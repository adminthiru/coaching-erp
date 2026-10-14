import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Plan, type Subscription, type SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CouponsService } from '../coupons/coupons.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import { addDays, addMonths } from '@acadia/utils';
import type { PaginationQuery } from '@acadia/validation';
import type { AccessClaims } from '../auth/token.service';

/** Spec §19. A subscription may only move along the documented lifecycle. */
const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIAL: ['ACTIVE', 'PAYMENT_DUE', 'CANCELLED', 'SUSPENDED'],
  ACTIVE: ['RENEWAL', 'PAYMENT_DUE', 'SUSPENDED', 'CANCELLED'],
  RENEWAL: ['ACTIVE', 'PAYMENT_DUE', 'CANCELLED'],
  PAYMENT_DUE: ['ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'SUSPENDED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [],
};

const LIVE: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'];

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly coupons: CouponsService,
  ) {}

  async list(query: PaginationQuery & { status?: SubscriptionStatus; organizationId?: string }) {
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.search ? { organization: { name: { contains: query.search, mode: 'insensitive' } } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'currentPeriodEnd', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          organization: { select: { id: true, name: true, slug: true, status: true } },
          plan: { select: { id: true, name: true, monthlyPriceMinor: true, annualPriceMinor: true, currency: true } },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  async get(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        plan: true,
        coupon: { select: { id: true, code: true, type: true, value: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 24 },
      },
    });
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That subscription does not exist.' });
    return sub;
  }

  /**
   * Upgrade / downgrade. Either takes effect now — closing the current period and
   * opening one on the new plan — or is deferred to the renewal date, which is
   * what a downgrade normally wants so the tenant keeps what they paid for.
   */
  async changePlan(
    organizationId: string,
    input: { planId: string; billingCycle: 'MONTHLY' | 'ANNUAL'; effectiveAtPeriodEnd: boolean; reason?: string },
    actor: AccessClaims,
  ) {
    const [current, plan] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { organizationId, status: { in: LIVE } },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
    ]);

    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'That plan does not exist.' });
    if (plan.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'PLAN_ARCHIVED', message: 'That plan is archived and cannot be assigned.' });
    }
    if (current && current.planId === plan.id && current.billingCycle === input.billingCycle) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'This organization is already on that plan and cycle.' });
    }

    const now = new Date();
    const direction = current ? describeChange(current, plan, input.billingCycle) : 'created';

    const result = await this.prisma.$transaction(async (tx) => {
      if (current && input.effectiveAtPeriodEnd) {
        // Deferred: record the intent, leave the live subscription untouched.
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: current.id,
            type: `plan.${direction}.scheduled`,
            fromStatus: current.status,
            toStatus: current.status,
            metadata: {
              fromPlanId: current.planId,
              toPlanId: plan.id,
              billingCycle: input.billingCycle,
              effectiveAt: current.currentPeriodEnd.toISOString(),
              reason: input.reason ?? null,
            },
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
        return current;
      }

      if (current) {
        await tx.subscription.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', cancelledAt: now, endedAt: now, cancelReason: `Replaced by plan change (${direction})` },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: current.id,
            type: `plan.${direction}.applied`,
            fromStatus: current.status,
            toStatus: 'CANCELLED',
            metadata: { fromPlanId: current.planId, toPlanId: plan.id, reason: input.reason ?? null },
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
      }

      const periodEnd = input.billingCycle === 'ANNUAL' ? addMonths(now, 12) : addMonths(now, 1);
      const created = await tx.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          status: 'ACTIVE',
          billingCycle: input.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: created.id,
          type: direction,
          toStatus: 'ACTIVE',
          metadata: { planId: plan.id, planName: plan.name, billingCycle: input.billingCycle, reason: input.reason ?? null },
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      });

      // A paying organization is no longer on trial.
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: 'ACTIVE', trialEndsAt: null },
      });

      return created;
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId,
      action: `subscription.${direction}`,
      entityType: 'Subscription',
      entityId: result.id,
      before: current ? { planId: current.planId, billingCycle: current.billingCycle } : undefined,
      after: { planId: plan.id, billingCycle: input.billingCycle, deferred: input.effectiveAtPeriodEnd },
      reason: input.reason,
    });

    return this.get(result.id);
  }

  /** Applies a coupon to the organization's live subscription. Spec §18. */
  async applyCoupon(organizationId: string, code: string, actor: AccessClaims) {
    const sub = await this.prisma.subscription.findFirst({
      where: { organizationId, status: { in: LIVE } },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) {
      throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'This organization has no active subscription.' });
    }

    const coupon = await this.coupons.validate(code, organizationId, sub.planId);

    const updated = await this.prisma.$transaction(async (tx) => {
      // A trial-extension coupon buys days, not money.
      if (coupon.type === 'TRIAL_EXTENSION') {
        const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
        const newEndsAt = addDays(base, coupon.value);
        await tx.subscription.update({
          where: { id: sub.id },
          data: { trialEndsAt: newEndsAt, currentPeriodEnd: newEndsAt, status: 'TRIAL', couponId: coupon.id },
        });
        await tx.organization.update({ where: { id: organizationId }, data: { trialEndsAt: newEndsAt, status: 'TRIAL' } });
        await tx.trialEvent.create({
          data: {
            organizationId,
            type: 'EXTEND',
            days: coupon.value,
            previousEndsAt: sub.trialEndsAt,
            newEndsAt,
            reason: `Coupon ${coupon.code}`,
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
      } else {
        await tx.subscription.update({ where: { id: sub.id }, data: { couponId: coupon.id } });
      }

      await this.coupons.redeem(tx, coupon, organizationId, sub.id, 0);

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'coupon.applied',
          fromStatus: sub.status,
          metadata: { couponId: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      });

      return tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId,
      action: 'subscription.coupon_applied',
      entityType: 'Subscription',
      entityId: sub.id,
      after: { code: coupon.code },
    });

    return this.get(updated.id);
  }

  async transition(id: string, to: SubscriptionStatus, reason: string | undefined, actor: AccessClaims) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That subscription does not exist.' });

    if (!ALLOWED[sub.status].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A subscription cannot move from ${sub.status} to ${to}.`,
        details: { from: sub.status, to, allowed: ALLOWED[sub.status] },
      });
    }

    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id }, data: { status: to } }),
      this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: `status.${to.toLowerCase()}`,
          fromStatus: sub.status,
          toStatus: to,
          metadata: { reason: reason ?? null },
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      }),
    ]);

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: sub.organizationId,
      action: `subscription.${to.toLowerCase()}`,
      entityType: 'Subscription',
      entityId: id,
      before: { status: sub.status },
      after: { status: to },
      reason,
    });

    return this.get(id);
  }

  /**
   * Cancelling at period end is the default: the tenant keeps service they have
   * already paid for, and the row stays live until the period lapses.
   */
  async cancel(id: string, atPeriodEnd: boolean, reason: string, actor: AccessClaims) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That subscription does not exist.' });
    if (sub.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'That subscription is already cancelled.' });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: atPeriodEnd
          ? { cancelAtPeriodEnd: true, cancelReason: reason }
          : { status: 'CANCELLED', cancelAtPeriodEnd: false, cancelledAt: now, endedAt: now, cancelReason: reason },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: atPeriodEnd ? 'cancel.scheduled' : 'cancel.immediate',
          fromStatus: sub.status,
          toStatus: atPeriodEnd ? sub.status : 'CANCELLED',
          metadata: { reason, effectiveAt: atPeriodEnd ? sub.currentPeriodEnd.toISOString() : now.toISOString() },
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      });
      if (!atPeriodEnd) {
        await tx.organization.update({ where: { id: sub.organizationId }, data: { status: 'CANCELLED' } });
      }
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: sub.organizationId,
      action: 'subscription.cancel',
      entityType: 'Subscription',
      entityId: id,
      after: { atPeriodEnd },
      reason,
    });

    return this.get(id);
  }

  /** Renews the current period without changing plan. */
  async renew(id: string, actor: AccessClaims) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That subscription does not exist.' });
    if (sub.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'CANCELLED', message: 'A cancelled subscription cannot be renewed.' });
    }

    // Renew from whichever is later, so a lapsed subscription does not renew into the past.
    const base = sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    const end = sub.billingCycle === 'ANNUAL' ? addMonths(base, 12) : addMonths(base, 1);

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id },
        data: { status: 'ACTIVE', currentPeriodStart: base, currentPeriodEnd: end, trialEndsAt: null },
      }),
      this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: 'renewed',
          fromStatus: sub.status,
          toStatus: 'ACTIVE',
          metadata: { periodStart: base.toISOString(), periodEnd: end.toISOString() },
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      }),
    ]);

    return this.get(id);
  }
}

/**
 * Classifies the move purely for the event/audit label. Prices are normalised to
 * a monthly equivalent first, so switching Monthly -> Annual on the same plan is
 * not misreported as a twelve-fold upgrade.
 */
function describeChange(
  current: Subscription & { plan: Plan },
  plan: Plan,
  cycle: 'MONTHLY' | 'ANNUAL',
): 'upgrade' | 'downgrade' | 'cycle_change' {
  const monthly = (p: Plan, c: 'MONTHLY' | 'ANNUAL') =>
    c === 'ANNUAL' ? Math.round(p.annualPriceMinor / 12) : p.monthlyPriceMinor;

  const from = monthly(current.plan, current.billingCycle);
  const to = monthly(plan, cycle);

  if (to > from) return 'upgrade';
  if (to < from) return 'downgrade';
  return 'cycle_change';
}
