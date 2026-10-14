import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

/**
 * Spec §68 — mess operations, branch-specific or centralised.
 *
 * The spec is one line, so this is the minimum that is actually operable: a
 * plan priced per month, and who is on it. Menus and per-meal attendance would
 * be invention rather than implementation.
 */
@Injectable()
export class MessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private visibility(ctx: TenantContext): Prisma.MessPlanWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  async listPlans(ctx: TenantContext) {
    const plans = await this.prisma.messPlan.findMany({
      where: { organizationId: ctx.organizationId, ...this.visibility(ctx), isActive: true },
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } },
      },
    });

    return plans.map(({ _count, ...p }) => ({
      ...p,
      scope: p.branchId ? 'branch' : 'organization',
      subscribers: _count.subscriptions,
    }));
  }

  async createPlan(ctx: TenantContext, input: any) {
    if (!input.branchId) {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only organization-level roles can create a mess plan shared across every branch.',
        });
      }
    } else {
      assertBranchAccess(ctx, input.branchId);
    }

    const plan = await this.prisma.messPlan.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        name: input.name,
        description: input.description || null,
        monthlyFareMinor: input.monthlyFareMinor ?? 0,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'mess_plan.create', entityType: 'MessPlan', entityId: plan.id,
      after: { name: plan.name, monthlyFareMinor: plan.monthlyFareMinor },
    });

    return plan;
  }

  async subscribers(ctx: TenantContext, planId: string) {
    const plan = await this.prisma.messPlan.findFirst({
      where: { id: planId, organizationId: ctx.organizationId, ...this.visibility(ctx) },
    });
    if (!plan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That mess plan does not exist.' });

    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    return this.prisma.messSubscription.findMany({
      where: {
        messPlanId: planId,
        status: 'ACTIVE',
        // A centralised plan spans branches, so its subscriber list is still
        // filtered to the students this caller may see.
        ...(reachable ? { student: { branchId: { in: reachable } } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      include: {
        student: {
          select: { id: true, name: true, studentCode: true, branch: { select: { id: true, code: true } } },
        },
      },
    });
  }

  async subscribe(ctx: TenantContext, input: { studentId: string; messPlanId: string }) {
    const plan = await this.prisma.messPlan.findFirst({
      where: { id: input.messPlanId, organizationId: ctx.organizationId, ...this.visibility(ctx), isActive: true },
    });
    if (!plan) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That mess plan is unavailable.', details: { messPlanId: 'Pick a plan.' } });
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
    if (plan.branchId && plan.branchId !== student.branchId) {
      throw new BadRequestException({
        code: 'PLAN_OUT_OF_SCOPE',
        message: `${plan.name} belongs to another branch, so ${student.name} cannot join it.`,
      });
    }

    const existing = await this.prisma.messSubscription.findFirst({
      where: { studentId: student.id, status: 'ACTIVE' },
      include: { messPlan: { select: { name: true } } },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'ALREADY_SUBSCRIBED',
        message: `${student.name} is already on ${existing.messPlan.name}. End that first.`,
      });
    }

    const subscription = await this.prisma.messSubscription.create({
      data: { organizationId: ctx.organizationId, messPlanId: plan.id, studentId: student.id },
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        messPlan: { select: { id: true, name: true, monthlyFareMinor: true } },
      },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'mess.subscribe', entityType: 'MessSubscription', entityId: subscription.id,
      after: { studentId: student.id, messPlanId: plan.id },
    });

    return subscription;
  }

  async endSubscription(ctx: TenantContext, subscriptionId: string, reason?: string) {
    const subscription = await this.prisma.messSubscription.findFirst({
      where: { id: subscriptionId, organizationId: ctx.organizationId },
      include: { student: { select: { branchId: true } } },
    });
    if (!subscription) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That subscription does not exist.' });
    assertBranchAccess(ctx, subscription.student.branchId);
    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'NOT_ACTIVE', message: 'That subscription has already ended.' });
    }

    await this.prisma.messSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'ENDED', endedAt: new Date(), endReason: reason || null },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'mess.end_subscription', entityType: 'MessSubscription', entityId: subscriptionId, reason,
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

    return this.prisma.messSubscription.findMany({
      where: { studentId },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
      include: { messPlan: { select: { id: true, name: true, monthlyFareMinor: true } } },
    });
  }
}
