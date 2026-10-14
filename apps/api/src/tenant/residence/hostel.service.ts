import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

const INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  rooms: { orderBy: { roomNumber: 'asc' } },
} as const;

/** Spec §66 — hostels, which may belong to a branch or serve every branch. */
@Injectable()
export class HostelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A centralised hostel (`branchId: null`) is visible everywhere. */
  private visibility(ctx: TenantContext): Prisma.HostelWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  async list(ctx: TenantContext) {
    const hostels = await this.prisma.hostel.findMany({
      where: { organizationId: ctx.organizationId, ...this.visibility(ctx), isActive: true },
      orderBy: { name: 'asc' },
      include: INCLUDE,
    });

    return hostels.map((h) => {
      const capacity = h.rooms.reduce((sum, r) => sum + r.capacity, 0);
      const occupied = h.rooms.reduce((sum, r) => sum + r.occupied, 0);
      return {
        ...h,
        scope: h.branchId ? 'branch' : 'organization',
        capacity,
        occupied,
        available: capacity - occupied,
        roomCount: h.rooms.length,
      };
    });
  }

  async get(ctx: TenantContext, id: string) {
    const hostel = await this.prisma.hostel.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: {
        ...INCLUDE,
        rooms: {
          orderBy: { roomNumber: 'asc' },
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { student: { select: { id: true, name: true, studentCode: true } } },
            },
          },
        },
      },
    });
    if (!hostel) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That hostel does not exist.' });

    const capacity = hostel.rooms.reduce((sum, r) => sum + r.capacity, 0);
    const occupied = hostel.rooms.reduce((sum, r) => sum + r.occupied, 0);
    return { ...hostel, scope: hostel.branchId ? 'branch' : 'organization', capacity, occupied, available: capacity - occupied };
  }

  async create(ctx: TenantContext, input: any) {
    if (!input.branchId) {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only organization-level roles can create a hostel shared across every branch.',
        });
      }
    } else {
      assertBranchAccess(ctx, input.branchId);
    }

    const clash = await this.prisma.hostel.findFirst({
      where: { organizationId: ctx.organizationId, code: input.code },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Hostel code ${input.code} is already used.`,
        details: { code: 'That code is already used.' },
      });
    }

    const hostel = await this.prisma.hostel.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        name: input.name,
        code: input.code,
        occupancy: input.occupancy,
        address: input.address || null,
        wardenName: input.wardenName || null,
        wardenPhone: input.wardenPhone || null,
        rooms: {
          create: (input.rooms ?? []).map((r: any) => ({
            roomNumber: r.roomNumber, floor: r.floor || null, capacity: r.capacity,
          })),
        },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'hostel.create', entityType: 'Hostel', entityId: hostel.id,
      after: { name: hostel.name, rooms: hostel.rooms.length, scope: hostel.branchId ? 'branch' : 'organization' },
    });

    return hostel;
  }

  async addRoom(ctx: TenantContext, hostelId: string, input: any) {
    await this.get(ctx, hostelId);

    const clash = await this.prisma.hostelRoom.findUnique({
      where: { hostelId_roomNumber: { hostelId, roomNumber: input.roomNumber } },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Room ${input.roomNumber} already exists in this hostel.`,
        details: { roomNumber: 'That room already exists.' },
      });
    }

    return this.prisma.hostelRoom.create({
      data: { hostelId, roomNumber: input.roomNumber, floor: input.floor || null, capacity: input.capacity },
    });
  }

  /**
   * Allocating a bed. `occupied` moves in the same transaction as the
   * allocation, so a full room cannot be oversold by two clerks at once — the
   * check and the increment are never separated.
   */
  async allocate(ctx: TenantContext, input: { studentId: string; roomId: string }) {
    const room = await this.prisma.hostelRoom.findFirst({
      where: { id: input.roomId, hostel: { organizationId: ctx.organizationId } },
      include: { hostel: { select: { id: true, name: true, branchId: true, occupancy: true, isActive: true } } },
    });
    if (!room) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That room does not exist.' });
    if (!room.hostel.isActive) {
      throw new BadRequestException({ code: 'HOSTEL_INACTIVE', message: 'That hostel is no longer in use.' });
    }
    // A branch hostel is that branch's; a centralised one is everyone's.
    if (room.hostel.branchId) assertBranchAccess(ctx, room.hostel.branchId);

    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true, status: true, gender: true },
    });
    if (!student) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student does not exist.', details: { studentId: 'Pick a student.' } });
    }
    assertBranchAccess(ctx, student.branchId);
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'STUDENT_INACTIVE', message: `${student.name} is not an active student.` });
    }
    // A branch-specific hostel only takes that branch's students.
    if (room.hostel.branchId && room.hostel.branchId !== student.branchId) {
      throw new BadRequestException({
        code: 'HOSTEL_OUT_OF_SCOPE',
        message: `${room.hostel.name} belongs to another branch, so ${student.name} cannot be allocated there.`,
      });
    }
    if (
      room.hostel.occupancy !== 'MIXED' &&
      ((room.hostel.occupancy === 'BOYS' && student.gender === 'FEMALE') ||
        (room.hostel.occupancy === 'GIRLS' && student.gender === 'MALE'))
    ) {
      throw new BadRequestException({
        code: 'OCCUPANCY_MISMATCH',
        message: `${room.hostel.name} is a ${room.hostel.occupancy.toLowerCase()} hostel.`,
      });
    }

    const existing = await this.prisma.hostelAllocation.findFirst({
      where: { studentId: student.id, status: 'ACTIVE' },
      include: { room: { include: { hostel: { select: { name: true } } } } },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'ALREADY_ALLOCATED',
        message: `${student.name} already has a bed in ${existing.room.hostel.name}, room ${existing.room.roomNumber}. End that stay first.`,
      });
    }
    if (room.occupied >= room.capacity) {
      throw new BadRequestException({
        code: 'ROOM_FULL',
        message: `Room ${room.roomNumber} is full (${room.occupied}/${room.capacity}).`,
      });
    }

    const allocation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.hostelAllocation.create({
        data: { organizationId: ctx.organizationId, roomId: room.id, studentId: student.id },
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          room: { include: { hostel: { select: { id: true, name: true } } } },
        },
      });
      await tx.hostelRoom.update({ where: { id: room.id }, data: { occupied: { increment: 1 } } });
      return created;
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'hostel.allocate', entityType: 'HostelAllocation', entityId: allocation.id,
      after: { studentId: student.id, roomId: room.id },
    });

    return allocation;
  }

  /** Ending a stay keeps the row — "who was in 204 last term" must survive. */
  async endAllocation(ctx: TenantContext, allocationId: string, reason?: string) {
    const allocation = await this.prisma.hostelAllocation.findFirst({
      where: { id: allocationId, organizationId: ctx.organizationId },
      include: { room: { include: { hostel: { select: { branchId: true } } } } },
    });
    if (!allocation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That allocation does not exist.' });
    if (allocation.room.hostel.branchId) assertBranchAccess(ctx, allocation.room.hostel.branchId);
    if (allocation.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'NOT_ACTIVE', message: 'That stay has already ended.' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hostelAllocation.update({
        where: { id: allocationId },
        data: { status: 'ENDED', endedAt: new Date(), endReason: reason || null },
      });
      // Never below zero, even if a counter was corrected by hand.
      await tx.hostelRoom.update({
        where: { id: allocation.roomId },
        data: { occupied: { decrement: Math.min(1, allocation.room.occupied) } },
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'hostel.end_allocation', entityType: 'HostelAllocation', entityId: allocationId,
      after: { roomId: allocation.roomId }, reason,
    });

    return { ended: true };
  }

  /** Every stay a student has had, current first. */
  async forStudent(ctx: TenantContext, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    return this.prisma.hostelAllocation.findMany({
      where: { studentId },
      orderBy: [{ status: 'asc' }, { allocatedAt: 'desc' }],
      include: { room: { include: { hostel: { select: { id: true, name: true, code: true } } } } },
    });
  }
}
