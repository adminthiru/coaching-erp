import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpsertPlanInput } from '@acadia/validation';
import type { AccessClaims } from '../auth/token.service';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeArchived = false) {
    const plans = await this.prisma.plan.findMany({
      where: includeArchived ? {} : { status: { not: 'ARCHIVED' } },
      orderBy: [{ sortOrder: 'asc' }, { monthlyPriceMinor: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map(shape);
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That plan does not exist.' });
    return shape(plan);
  }

  async create(input: UpsertPlanInput, actor: AccessClaims) {
    const plan = await this.prisma.plan.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description || null,
        currency: input.currency,
        monthlyPriceMinor: input.monthlyPriceMinor,
        annualPriceMinor: input.annualPriceMinor,
        trialDays: input.trialDays,
        features: input.features,
        limits: input.limits as Prisma.InputJsonValue,
        status: input.status,
        sortOrder: input.sortOrder,
      },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'plan.create',
      entityType: 'Plan',
      entityId: plan.id,
      after: input,
    });

    return this.get(plan.id);
  }

  async update(id: string, input: UpsertPlanInput, actor: AccessClaims) {
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That plan does not exist.' });

    await this.prisma.plan.update({
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description || null,
        currency: input.currency,
        monthlyPriceMinor: input.monthlyPriceMinor,
        annualPriceMinor: input.annualPriceMinor,
        trialDays: input.trialDays,
        features: input.features,
        limits: input.limits as Prisma.InputJsonValue,
        status: input.status,
        sortOrder: input.sortOrder,
      },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'plan.update',
      entityType: 'Plan',
      entityId: id,
      before: { name: before.name, monthlyPriceMinor: before.monthlyPriceMinor, features: before.features, limits: before.limits },
      after: input,
    });

    return this.get(id);
  }

  /**
   * Plans are archived, never deleted — invoices reference the plan they were
   * billed against, and that history has to stay readable. Archiving is also
   * blocked while tenants are still on it, so nobody loses their entitlements.
   */
  async archive(id: string, actor: AccessClaims) {
    const active = await this.prisma.subscription.count({
      where: { planId: id, status: { in: ['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'] } },
    });
    if (active > 0) {
      throw new BadRequestException({
        code: 'PLAN_IN_USE',
        message: `${active} organization${active === 1 ? ' is' : 's are'} still on this plan. Move them to another plan first.`,
        details: { activeSubscriptions: active },
      });
    }

    await this.prisma.plan.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'plan.archive',
      entityType: 'Plan',
      entityId: id,
    });
    return this.get(id);
  }
}

function shape(plan: Prisma.PlanGetPayload<{ include: { _count: { select: { subscriptions: true } } } }>) {
  const { _count, ...rest } = plan;
  return { ...rest, subscriptionCount: _count.subscriptions };
}
