import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type VehicleStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

/** "09:30" → 570. Same representation timetable slots use. */
const toMinute = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

/** Spec §67 — vehicles, routes, stops and who rides them. */
@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private vehicleVisibility(ctx: TenantContext): Prisma.VehicleWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  private routeVisibility(ctx: TenantContext): Prisma.TransportRouteWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  /* ── Vehicles ──────────────────────────────────────────────────────────── */

  async listVehicles(ctx: TenantContext) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: ctx.organizationId, ...this.vehicleVisibility(ctx) },
      orderBy: { registration: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        routes: { where: { isActive: true }, select: { id: true, name: true, code: true } },
      },
    });
    return vehicles.map((v) => ({ ...v, scope: v.branchId ? 'branch' : 'organization' }));
  }

  async createVehicle(ctx: TenantContext, input: any) {
    await this.assertOwnership(ctx, input.branchId, 'vehicle');

    const clash = await this.prisma.vehicle.findFirst({
      where: { organizationId: ctx.organizationId, registration: input.registration },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `${input.registration} is already registered.`,
        details: { registration: 'That vehicle already exists.' },
      });
    }

    const vehicle = await this.prisma.vehicle.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        registration: input.registration,
        model: input.model || null,
        capacity: input.capacity,
        driverName: input.driverName || null,
        driverPhone: input.driverPhone || null,
        driverLicence: input.driverLicence || null,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'vehicle.create', entityType: 'Vehicle', entityId: vehicle.id,
      after: { registration: vehicle.registration },
    });

    return vehicle;
  }

  async setVehicleStatus(ctx: TenantContext, id: string, status: VehicleStatus) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.vehicleVisibility(ctx) },
    });
    if (!vehicle) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That vehicle does not exist.' });
    if (vehicle.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This vehicle is already ${status.toLowerCase()}.` });
    }

    // A retired or off-road vehicle must not silently keep serving a route.
    if (status !== 'ACTIVE') {
      const routes = await this.prisma.transportRoute.count({ where: { vehicleId: id, isActive: true } });
      if (routes > 0) {
        throw new BadRequestException({
          code: 'VEHICLE_IN_USE',
          message: `This vehicle still serves ${routes} active route${routes === 1 ? '' : 's'}. Reassign ${routes === 1 ? 'it' : 'them'} first.`,
        });
      }
    }

    const updated = await this.prisma.vehicle.update({ where: { id }, data: { status } });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `vehicle.${status.toLowerCase()}`, entityType: 'Vehicle', entityId: id,
      before: { status: vehicle.status }, after: { status },
    });

    return updated;
  }

  /* ── Routes ────────────────────────────────────────────────────────────── */

  async listRoutes(ctx: TenantContext) {
    const routes = await this.prisma.transportRoute.findMany({
      where: { organizationId: ctx.organizationId, ...this.routeVisibility(ctx), isActive: true },
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, registration: true, capacity: true, status: true, driverName: true } },
        stops: { orderBy: { sequence: 'asc' } },
        _count: { select: { allocations: { where: { status: 'ACTIVE' } } } },
      },
    });

    return routes.map(({ _count, ...r }) => ({
      ...r,
      scope: r.branchId ? 'branch' : 'organization',
      riders: _count.allocations,
      seatsLeft: r.vehicle ? r.vehicle.capacity - _count.allocations : null,
    }));
  }

  async getRoute(ctx: TenantContext, id: string) {
    const route = await this.prisma.transportRoute.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.routeVisibility(ctx) },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        vehicle: { select: { id: true, registration: true, capacity: true, status: true, driverName: true, driverPhone: true } },
        stops: {
          orderBy: { sequence: 'asc' },
          include: { _count: { select: { allocations: { where: { status: 'ACTIVE' } } } } },
        },
        allocations: {
          where: { status: 'ACTIVE' },
          include: {
            student: { select: { id: true, name: true, studentCode: true } },
            stop: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!route) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That route does not exist.' });

    return {
      ...route,
      scope: route.branchId ? 'branch' : 'organization',
      riders: route.allocations.length,
      seatsLeft: route.vehicle ? route.vehicle.capacity - route.allocations.length : null,
      stops: route.stops.map(({ _count, ...s }) => ({ ...s, riders: _count.allocations })),
    };
  }

  async createRoute(ctx: TenantContext, input: any) {
    await this.assertOwnership(ctx, input.branchId, 'route');

    const clash = await this.prisma.transportRoute.findFirst({
      where: { organizationId: ctx.organizationId, code: input.code },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Route code ${input.code} is already used.`,
        details: { code: 'That code is already used.' },
      });
    }

    if (input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: ctx.organizationId, ...this.vehicleVisibility(ctx) },
        select: { id: true, status: true, registration: true },
      });
      if (!vehicle) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That vehicle does not exist.', details: { vehicleId: 'Pick a vehicle.' } });
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new BadRequestException({
          code: 'VEHICLE_UNAVAILABLE',
          message: `${vehicle.registration} is ${vehicle.status.toLowerCase()} and cannot be put on a route.`,
          details: { vehicleId: 'That vehicle is not in service.' },
        });
      }
    }

    const route = await this.prisma.transportRoute.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        vehicleId: input.vehicleId ?? null,
        name: input.name,
        code: input.code,
        fareMinor: input.fareMinor ?? 0,
        stops: {
          create: input.stops.map((s: any, i: number) => ({
            name: s.name,
            landmark: s.landmark || null,
            sequence: i,
            pickupMinute: toMinute(s.pickupTime),
            dropMinute: s.dropTime ? toMinute(s.dropTime) : null,
          })),
        },
      },
      include: { stops: { orderBy: { sequence: 'asc' } }, branch: { select: { id: true, name: true, code: true } } },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'route.create', entityType: 'TransportRoute', entityId: route.id,
      after: { name: route.name, stops: route.stops.length },
    });

    return route;
  }

  /* ── Riders ────────────────────────────────────────────────────────────── */

  async allocate(ctx: TenantContext, input: { studentId: string; routeId: string; stopId: string }) {
    const route = await this.getRoute(ctx, input.routeId);

    const stop = route.stops.find((s) => s.id === input.stopId);
    if (!stop) {
      throw new BadRequestException({ code: 'STOP_NOT_ON_ROUTE', message: 'That stop is not on this route.', details: { stopId: 'Pick a stop on this route.' } });
    }

    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true, status: true },
    });
    if (!student) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student does not exist.', details: { studentId: 'Pick a student.' } });
    }
    assertBranchAccess(ctx, student.branchId);
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'STUDENT_INACTIVE', message: `${student.name} is not an active student.` });
    }
    if (route.branchId && route.branchId !== student.branchId) {
      throw new BadRequestException({
        code: 'ROUTE_OUT_OF_SCOPE',
        message: `${route.name} serves another branch, so ${student.name} cannot ride it.`,
      });
    }

    const existing = await this.prisma.transportAllocation.findFirst({
      where: { studentId: student.id, status: 'ACTIVE' },
      include: { route: { select: { name: true } } },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'ALREADY_ALLOCATED',
        message: `${student.name} already rides ${existing.route.name}. End that first.`,
      });
    }
    // Seats are the vehicle's, so a route with no vehicle assigned has no limit
    // to enforce yet rather than a limit of zero.
    if (route.seatsLeft !== null && route.seatsLeft <= 0) {
      throw new BadRequestException({
        code: 'ROUTE_FULL',
        message: `${route.name} is full — every seat on ${route.vehicle?.registration} is taken.`,
      });
    }

    const allocation = await this.prisma.transportAllocation.create({
      data: { organizationId: ctx.organizationId, routeId: route.id, stopId: stop.id, studentId: student.id },
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        route: { select: { id: true, name: true } },
        stop: { select: { id: true, name: true } },
      },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'transport.allocate', entityType: 'TransportAllocation', entityId: allocation.id,
      after: { studentId: student.id, routeId: route.id, stopId: stop.id },
    });

    return allocation;
  }

  async endAllocation(ctx: TenantContext, allocationId: string, reason?: string) {
    const allocation = await this.prisma.transportAllocation.findFirst({
      where: { id: allocationId, organizationId: ctx.organizationId },
      include: { route: { select: { branchId: true } } },
    });
    if (!allocation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That allocation does not exist.' });
    if (allocation.route.branchId) assertBranchAccess(ctx, allocation.route.branchId);
    if (allocation.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'NOT_ACTIVE', message: 'That allocation has already ended.' });
    }

    await this.prisma.transportAllocation.update({
      where: { id: allocationId },
      data: { status: 'ENDED', endedAt: new Date(), endReason: reason || null },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'transport.end_allocation', entityType: 'TransportAllocation', entityId: allocationId, reason,
    });

    return { ended: true };
  }

  async forStudent(ctx: TenantContext, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    return this.prisma.transportAllocation.findMany({
      where: { studentId },
      orderBy: [{ status: 'asc' }, { allocatedAt: 'desc' }],
      include: {
        route: { select: { id: true, name: true, code: true, fareMinor: true } },
        stop: { select: { id: true, name: true, pickupMinute: true } },
      },
    });
  }

  private async assertOwnership(ctx: TenantContext, branchId: string | null | undefined, what: string) {
    if (!branchId) {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: `Only organization-level roles can create a ${what} shared across every branch.`,
        });
      }
      return;
    }
    assertBranchAccess(ctx, branchId);
  }
}
