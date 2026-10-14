import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ConflictsService } from './conflicts.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { parseClock } from '@acadia/utils';
import type { ScheduleConflict } from '@acadia/types';

const SLOT_INCLUDE = {
  batch: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, code: true } },
  faculty: { select: { id: true, name: true } },
  room: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly conflicts: ConflictsService,
  ) {}

  /* ── Rooms ────────────────────────────────────────────────────────────── */

  listRooms(ctx: TenantContext) {
    return this.prisma.room.findMany({
      where: { organizationId: ctx.organizationId, isActive: true, ...branchScope(ctx) },
      orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async createRoom(ctx: TenantContext, input: any) {
    const branchId = this.requireBranch(ctx, input.branchId);
    assertBranchAccess(ctx, branchId);

    const clash = await this.prisma.room.findFirst({ where: { branchId, code: input.code } });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Room code ${input.code} is already used at this branch.`,
        details: { code: 'That room code is already used.' },
      });
    }

    const room = await this.prisma.room.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        name: input.name,
        code: input.code,
        capacity: input.capacity,
        isActive: input.isActive,
      },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'room.create', entityType: 'Room', entityId: room.id,
      after: { name: room.name, code: room.code, branchId },
    });

    return room;
  }

  /* ── Weekly grid ──────────────────────────────────────────────────────── */

  async listSlots(ctx: TenantContext, filter: { batchId?: string; facultyId?: string; roomId?: string }) {
    const where: Prisma.TimetableSlotWhereInput = {
      organizationId: ctx.organizationId,
      status: { not: 'ENDED' },
      ...branchScope(ctx),
      ...(filter.batchId ? { batchId: filter.batchId } : {}),
      ...(filter.facultyId ? { facultyId: filter.facultyId } : {}),
      ...(filter.roomId ? { roomId: filter.roomId } : {}),
    };

    const slots = await this.prisma.timetableSlot.findMany({
      where,
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      include: SLOT_INCLUDE,
    });

    return { slots, days: groupByDay(slots) };
  }

  /**
   * Creation is refused outright when the slot clashes — spec §46 says detect,
   * and a timetable that silently double-books a teacher is worse than no
   * timetable. The conflicts come back in `details` so the UI can name them.
   */
  async createSlot(ctx: TenantContext, input: any) {
    const prepared = await this.prepare(ctx, input);

    const conflicts = await this.conflicts.forSlot({
      organizationId: ctx.organizationId,
      branchId: prepared.branchId,
      batchId: prepared.batchId,
      facultyId: prepared.facultyId,
      roomId: prepared.roomId,
      dayOfWeek: input.dayOfWeek,
      startMinute: prepared.startMinute,
      endMinute: prepared.endMinute,
      effectiveFrom: prepared.effectiveFrom,
      effectiveTo: prepared.effectiveTo,
    });
    if (conflicts.length) throw conflictError(conflicts);

    const slot = await this.prisma.timetableSlot.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: prepared.branchId,
        batchId: prepared.batchId,
        subjectId: prepared.subjectId,
        facultyId: prepared.facultyId,
        roomId: prepared.roomId,
        dayOfWeek: input.dayOfWeek,
        startMinute: prepared.startMinute,
        endMinute: prepared.endMinute,
        effectiveFrom: prepared.effectiveFrom,
        effectiveTo: prepared.effectiveTo,
      },
      include: SLOT_INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'timetable.slot_create', entityType: 'TimetableSlot', entityId: slot.id,
      after: { batchId: slot.batchId, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute },
    });

    return slot;
  }

  /** Dry run for the UI — the same checks, without writing anything. */
  async checkSlot(ctx: TenantContext, input: any) {
    const prepared = await this.prepare(ctx, input);
    const conflicts = await this.conflicts.forSlot({
      organizationId: ctx.organizationId,
      branchId: prepared.branchId,
      batchId: prepared.batchId,
      facultyId: prepared.facultyId,
      roomId: prepared.roomId,
      dayOfWeek: input.dayOfWeek,
      startMinute: prepared.startMinute,
      endMinute: prepared.endMinute,
      effectiveFrom: prepared.effectiveFrom,
      effectiveTo: prepared.effectiveTo,
      excludeSlotId: input.excludeSlotId,
    });
    return { ok: conflicts.length === 0, conflicts };
  }

  async updateSlot(ctx: TenantContext, id: string, input: any) {
    const existing = await this.getSlot(ctx, id);

    const merged = {
      batchId: input.batchId ?? existing.batchId,
      subjectId: input.subjectId ?? existing.subjectId,
      facultyId: input.facultyId ?? existing.facultyId,
      roomId: input.roomId === undefined ? existing.roomId : input.roomId,
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo:
        input.effectiveTo === undefined
          ? existing.effectiveTo?.toISOString().slice(0, 10) ?? null
          : input.effectiveTo,
    };

    const prepared = await this.prepare(ctx, merged, {
      startMinute: existing.startMinute,
      endMinute: existing.endMinute,
    });

    const conflicts = await this.conflicts.forSlot({
      organizationId: ctx.organizationId,
      branchId: prepared.branchId,
      batchId: prepared.batchId,
      facultyId: prepared.facultyId,
      roomId: prepared.roomId,
      dayOfWeek: merged.dayOfWeek,
      startMinute: prepared.startMinute,
      endMinute: prepared.endMinute,
      effectiveFrom: prepared.effectiveFrom,
      effectiveTo: prepared.effectiveTo,
      excludeSlotId: id,
    });
    if (conflicts.length) throw conflictError(conflicts);

    const slot = await this.prisma.timetableSlot.update({
      where: { id },
      data: {
        batchId: prepared.batchId,
        subjectId: prepared.subjectId,
        facultyId: prepared.facultyId,
        roomId: prepared.roomId,
        dayOfWeek: merged.dayOfWeek,
        startMinute: prepared.startMinute,
        endMinute: prepared.endMinute,
        effectiveFrom: prepared.effectiveFrom,
        effectiveTo: prepared.effectiveTo,
      },
      include: SLOT_INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'timetable.slot_update', entityType: 'TimetableSlot', entityId: id,
      after: { dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute },
    });

    return slot;
  }

  async getSlot(ctx: TenantContext, id: string) {
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: SLOT_INCLUDE,
    });
    if (!slot) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That timetable entry does not exist.' });
    assertBranchAccess(ctx, slot.branchId);
    return slot;
  }

  /** Ends a recurring entry. Sessions already generated from it are left alone. */
  async removeSlot(ctx: TenantContext, id: string) {
    await this.getSlot(ctx, id);
    await this.prisma.timetableSlot.update({ where: { id }, data: { status: 'ENDED', effectiveTo: new Date() } });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'timetable.slot_end', entityType: 'TimetableSlot', entityId: id,
    });
    return { ended: true };
  }

  /* ── Dated sessions ───────────────────────────────────────────────────── */

  async listSessions(ctx: TenantContext, filter: { from: string; to: string; batchId?: string; facultyId?: string }) {
    const from = new Date(`${filter.from}T00:00:00.000Z`);
    const to = new Date(`${filter.to}T00:00:00.000Z`);

    return this.prisma.classSession.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...branchScope(ctx),
        date: { gte: from, lte: to },
        ...(filter.batchId ? { batchId: filter.batchId } : {}),
        ...(filter.facultyId ? { facultyId: filter.facultyId } : {}),
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      include: SLOT_INCLUDE,
    });
  }

  /**
   * Materialises the weekly grid into dated rows.
   *
   * Only the branch's working days are generated, the window is capped, and the
   * `(slotId, date)` unique index makes regeneration idempotent — running it
   * twice does not duplicate a term.
   */
  async generateSessions(ctx: TenantContext, input: { from: string; to: string; batchId?: string; replace: boolean }) {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const to = new Date(`${input.to}T00:00:00.000Z`);
    const days = Math.round((to.getTime() - from.getTime()) / 864e5) + 1;
    if (days > 200) {
      throw new BadRequestException({
        code: 'RANGE_TOO_WIDE',
        message: 'Generate at most 200 days at a time.',
        details: { to: 'Pick a shorter range.' },
      });
    }

    const slots = await this.prisma.timetableSlot.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'ACTIVE',
        ...branchScope(ctx),
        ...(input.batchId ? { batchId: input.batchId } : {}),
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      include: { branch: { select: { id: true, workingDays: true } } },
    });

    if (!slots.length) {
      return { created: 0, replaced: 0, skipped: 0, message: 'No active timetable entries in this range.' };
    }

    if (input.replace) {
      await this.prisma.classSession.deleteMany({
        where: {
          organizationId: ctx.organizationId,
          date: { gte: from, lte: to },
          slotId: { in: slots.map((s) => s.id) },
          // Never discard a class that has already happened.
          status: 'SCHEDULED',
        },
      });
    }

    const rows: Prisma.ClassSessionCreateManyInput[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(from.getTime() + i * 864e5);
      // getUTCDay is 0=Sunday; the schema uses ISO 1=Monday…7=Sunday.
      const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();

      for (const slot of slots) {
        if (slot.dayOfWeek !== isoDay) continue;
        if (!slot.branch.workingDays.includes(isoDay)) continue;
        if (slot.effectiveFrom > date) continue;
        if (slot.effectiveTo && slot.effectiveTo < date) continue;

        rows.push({
          organizationId: ctx.organizationId,
          branchId: slot.branchId,
          batchId: slot.batchId,
          subjectId: slot.subjectId,
          facultyId: slot.facultyId,
          roomId: slot.roomId,
          slotId: slot.id,
          date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
        });
      }
    }

    // skipDuplicates leans on the (slotId, date) unique index, so re-running over
    // an overlapping window tops up rather than duplicating.
    const result = await this.prisma.classSession.createMany({ data: rows, skipDuplicates: true });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'timetable.generate_sessions', entityType: 'ClassSession',
      after: { from: input.from, to: input.to, created: result.count, candidates: rows.length },
    });

    return {
      created: result.count,
      skipped: rows.length - result.count,
      replaced: input.replace ? 1 : 0,
      message: `${result.count} session${result.count === 1 ? '' : 's'} created from ${slots.length} timetable ${slots.length === 1 ? 'entry' : 'entries'}.`,
    };
  }

  /** Rescheduling or reassigning re-runs the same conflict checks. */
  async updateSession(ctx: TenantContext, id: string, input: any) {
    const session = await this.prisma.classSession.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That class does not exist.' });
    assertBranchAccess(ctx, session.branchId);

    const startMinute = input.startTime ? parseClock(input.startTime)! : session.startMinute;
    const endMinute = input.endTime ? parseClock(input.endTime)! : session.endMinute;
    if (startMinute >= endMinute) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields need attention.',
        details: { endTime: 'The class must end after it starts' },
      });
    }

    const date = input.date ? new Date(`${input.date}T00:00:00.000Z`) : session.date;
    const facultyId = input.facultyId ?? session.facultyId;
    const roomId = input.roomId === undefined ? session.roomId : input.roomId;
    const nextStatus = input.status ?? session.status;

    // A cancelled class occupies nothing, so it needs no conflict check.
    if (nextStatus !== 'CANCELLED') {
      const conflicts = await this.conflicts.forSession({
        organizationId: ctx.organizationId,
        branchId: session.branchId,
        batchId: session.batchId,
        facultyId,
        roomId,
        date,
        startMinute,
        endMinute,
        excludeSessionId: id,
      });
      if (conflicts.length) throw conflictError(conflicts);
    }

    if (nextStatus === 'CANCELLED' && !input.cancelReason) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields need attention.',
        details: { cancelReason: 'Say why this class was cancelled' },
      });
    }

    const updated = await this.prisma.classSession.update({
      where: { id },
      data: {
        status: nextStatus,
        facultyId,
        roomId,
        date,
        startMinute,
        endMinute,
        cancelReason: nextStatus === 'CANCELLED' ? input.cancelReason : null,
        notes: input.notes === undefined ? session.notes : input.notes || null,
      },
      include: SLOT_INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `class_session.${nextStatus.toLowerCase()}`, entityType: 'ClassSession', entityId: id,
      before: { status: session.status, date: session.date, startMinute: session.startMinute },
      after: { status: nextStatus, date, startMinute },
      reason: input.cancelReason,
    });

    return updated;
  }

  /**
   * Validates every reference against this organization and branch, and converts
   * clock strings to minutes. Nothing downstream re-checks ownership, so this is
   * the single gate everything passes through.
   */
  private async prepare(
    ctx: TenantContext,
    input: any,
    fallback?: { startMinute: number; endMinute: number },
  ) {
    // The four lookups are independent, so they go out together. Fetching them in
    // sequence cost four network round trips per keystroke on the conflict-check
    // endpoint, which the UI calls as the user edits a slot.
    const [batch, subject, faculty, room] = await Promise.all([
      this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { id: true, branchId: true, status: true, name: true },
      }),
      this.prisma.subject.findFirst({
        where: { id: input.subjectId, organizationId: ctx.organizationId },
        select: { id: true },
      }),
      this.prisma.orgUser.findFirst({
        where: { id: input.facultyId, organizationId: ctx.organizationId, deletedAt: null },
        include: { branches: { where: { endedAt: null }, select: { branchId: true } } },
      }),
      input.roomId
        ? this.prisma.room.findFirst({
            where: { id: input.roomId, organizationId: ctx.organizationId },
            select: { id: true, branchId: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!batch) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.', details: { batchId: 'Pick a batch.' } });
    }
    assertBranchAccess(ctx, batch.branchId);
    if (['ARCHIVED', 'CANCELLED', 'COMPLETED'].includes(batch.status)) {
      throw new BadRequestException({ code: 'BATCH_CLOSED', message: `${batch.name} is not running.` });
    }

    if (!subject) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.', details: { subjectId: 'Pick a subject.' } });
    }

    if (!faculty) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That person does not exist.', details: { facultyId: 'Pick a teacher.' } });
    }
    // Spec §45: the teacher must actually work at this batch's branch.
    const crossBranchRole = faculty.role === 'ORG_OWNER' || faculty.role === 'ORG_ADMIN';
    if (!crossBranchRole && !faculty.branches.some((b) => b.branchId === batch.branchId)) {
      throw new BadRequestException({
        code: 'FACULTY_WRONG_BRANCH',
        message: `${faculty.name} is not assigned to this batch's branch.`,
        details: { facultyId: 'Not assigned to this branch.' },
      });
    }

    let roomId: string | null = null;
    if (input.roomId) {
      if (!room) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That room does not exist.', details: { roomId: 'Pick a room.' } });
      }
      if (room.branchId !== batch.branchId) {
        throw new BadRequestException({
          code: 'ROOM_WRONG_BRANCH',
          message: `${room.name} is at a different branch.`,
          details: { roomId: 'Pick a room at this branch.' },
        });
      }
      roomId = room.id;
    }

    const startMinute = input.startTime ? parseClock(input.startTime)! : fallback?.startMinute;
    const endMinute = input.endTime ? parseClock(input.endTime)! : fallback?.endMinute;
    if (startMinute === undefined || endMinute === undefined || startMinute >= endMinute) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields need attention.',
        details: { endTime: 'The class must end after it starts' },
      });
    }

    return {
      branchId: batch.branchId,
      batchId: batch.id,
      subjectId: subject.id,
      facultyId: faculty.id,
      roomId,
      startMinute,
      endMinute,
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
      effectiveTo: input.effectiveTo ? new Date(`${input.effectiveTo}T00:00:00.000Z`) : null,
    };
  }

  private requireBranch(ctx: TenantContext, requested?: string) {
    const branchId = requested ?? ctx.activeBranchId;
    if (!branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Choose a branch first, or switch out of the all-branch view.',
        details: { branchId: 'Pick a branch.' },
      });
    }
    return branchId;
  }
}

/** 409, because the request is well-formed but the schedule cannot accept it. */
function conflictError(conflicts: ScheduleConflict[]) {
  return new ConflictException({
    code: 'SCHEDULE_CONFLICT',
    message: conflicts[0].message,
    details: { conflicts },
  });
}

function groupByDay<T extends { dayOfWeek: number }>(slots: T[]) {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    dayOfWeek: day,
    slots: slots.filter((s) => s.dayOfWeek === day),
  }));
}
