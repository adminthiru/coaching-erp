import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import { addDays, addMonths } from '@acadia/utils';
import type { AccessClaims } from '../auth/token.service';
import type {
  CreateOrganizationInput, PaginationQuery,
} from '@acadia/validation';

/**
 * Status transitions that are actually reachable. Anything not listed here is
 * rejected, so an organization can never be moved into a nonsensical state (for
 * example ARCHIVED straight back to TRIAL).
 */
const ALLOWED_TRANSITIONS: Record<OrganizationStatus, OrganizationStatus[]> = {
  TRIAL: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED', 'ARCHIVED'],
  ACTIVE: ['PAYMENT_DUE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED'],
  PAYMENT_DUE: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ACTIVE', 'ARCHIVED'],
  EXPIRED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  ARCHIVED: [],
};

const LIST_SORTS = ['name', 'createdAt', 'status', 'lastActiveAt'] as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(query: PaginationQuery & { status?: OrganizationStatus; planId?: string }) {
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.planId
        ? { subscriptions: { some: { planId: query.planId, status: { notIn: ['CANCELLED'] } } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { ownerEmail: { contains: query.search, mode: 'insensitive' } },
              { ownerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(LIST_SORTS, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          usage: true,
          subscriptions: {
            where: { status: { notIn: ['CANCELLED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: { select: { id: true, name: true, slug: true } } },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return paginate(rows.map(toRow), total, query);
  }

  async get(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        usage: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { plan: { select: { id: true, name: true, slug: true } }, coupon: { select: { code: true } } },
        },
        _count: { select: { branches: true, users: true, tickets: true } },
      },
    });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });

    const [entitlements, usageReport] = await Promise.all([
      this.entitlements.resolve(id),
      this.entitlements.usageReport(id),
    ]);

    const { subscriptions, _count, ...rest } = org;
    return {
      ...rest,
      currentSubscription: subscriptions.find((s) => s.status !== 'CANCELLED') ?? null,
      subscriptionHistory: subscriptions,
      counts: { branches: _count.branches, users: _count.users, tickets: _count.tickets },
      entitlements,
      usage: usageReport,
    };
  }

  /**
   * Creates the tenant, its owner, its trial subscription and its usage row in a
   * single transaction. A half-created organization — one with no owner, or on no
   * plan — is not a state the product should ever have to recover from.
   */
  async create(input: CreateOrganizationInput, actor: AccessClaims) {
    const plan = input.planId
      ? await this.prisma.plan.findUnique({ where: { id: input.planId } })
      : await this.prisma.plan.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { monthlyPriceMinor: 'asc' }],
        });

    if (input.planId && !plan) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND', message: 'That plan does not exist.' });
    }
    if (plan && plan.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'PLAN_ARCHIVED', message: 'That plan is archived and cannot take new organizations.' });
    }

    const trialDays = input.trialDays ?? plan?.trialDays ?? 14;
    const now = new Date();
    const trialEndsAt = trialDays > 0 ? addDays(now, trialDays) : null;

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          ownerName: input.ownerName,
          ownerEmail: input.ownerEmail,
          ownerPhone: input.ownerPhone,
          email: input.ownerEmail,
          phone: input.ownerPhone,
          country: input.country,
          timezone: input.timezone,
          status: trialEndsAt ? 'TRIAL' : 'ACTIVE',
          trialEndsAt,
        },
      });

      await tx.organizationUsage.create({ data: { organizationId: created.id, adminUsers: 1 } });

      // The owner is created without a password; Phase 1 onboarding sends the
      // invitation that lets them set one.
      await tx.orgUser.create({
        data: {
          organizationId: created.id,
          name: input.ownerName,
          email: input.ownerEmail,
          phone: input.ownerPhone,
          role: 'ORG_OWNER',
          invitedAt: now,
          invitationExpiry: addDays(now, 14),
        },
      });

      if (plan) {
        const subscription = await tx.subscription.create({
          data: {
            organizationId: created.id,
            planId: plan.id,
            status: trialEndsAt ? 'TRIAL' : 'ACTIVE',
            billingCycle: 'MONTHLY',
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt ?? addMonths(now, 1),
            trialEndsAt,
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            type: 'created',
            toStatus: subscription.status,
            metadata: { planId: plan.id, planName: plan.name, trialDays },
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
      }

      if (trialEndsAt) {
        await tx.trialEvent.create({
          data: {
            organizationId: created.id,
            type: 'START',
            days: trialDays,
            newEndsAt: trialEndsAt,
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
      }

      return created;
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: org.id,
      action: 'organization.create',
      entityType: 'Organization',
      entityId: org.id,
      after: { name: org.name, slug: org.slug, planId: plan?.id ?? null, trialDays },
    });

    return this.get(org.id);
  }

  async update(id: string, input: Record<string, unknown>, actor: AccessClaims) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived organizations are read-only.' });
    }

    // Empty strings from optional form fields mean "clear it", not "set to ''".
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]),
    );

    await this.prisma.organization.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: id,
      action: 'organization.update',
      entityType: 'Organization',
      entityId: id,
      before: pick(before, Object.keys(data)),
      after: data,
    });

    return this.get(id);
  }

  async changeStatus(id: string, status: OrganizationStatus, reason: string, actor: AccessClaims) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });

    if (org.status === status) {
      throw new BadRequestException({
        code: 'NO_CHANGE',
        message: `This organization is already ${status.toLowerCase().replace('_', ' ')}.`,
      });
    }
    if (!ALLOWED_TRANSITIONS[org.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `An organization cannot move from ${org.status} to ${status}.`,
        details: { from: org.status, to: status, allowed: ALLOWED_TRANSITIONS[org.status] },
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: {
          status,
          suspendedAt: status === 'SUSPENDED' ? now : status === 'ACTIVE' ? null : org.suspendedAt,
          archivedAt: status === 'ARCHIVED' ? now : org.archivedAt,
        },
      });

      // Suspending a tenant suspends its billing too, otherwise invoices keep
      // being raised against an organization that cannot sign in.
      if (status === 'SUSPENDED' || status === 'CANCELLED') {
        const subs = await tx.subscription.findMany({
          where: { organizationId: id, status: { notIn: ['CANCELLED'] } },
          select: { id: true, status: true },
        });
        const next = status === 'SUSPENDED' ? 'SUSPENDED' : 'CANCELLED';
        for (const s of subs) {
          await tx.subscription.update({
            where: { id: s.id },
            data: { status: next, ...(next === 'CANCELLED' ? { cancelledAt: now, cancelReason: reason } : {}) },
          });
          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: s.id,
              type: `organization.${status.toLowerCase()}`,
              fromStatus: s.status,
              toStatus: next,
              metadata: { reason },
              actorId: actor.sub,
              actorEmail: actor.email,
            },
          });
        }
      }
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: id,
      action: `organization.${status.toLowerCase()}`,
      entityType: 'Organization',
      entityId: id,
      before: { status: org.status },
      after: { status },
      reason,
    });

    return this.get(id);
  }

  /** Spec §17 — trials are extended with a reason, and every extension is kept. */
  async extendTrial(id: string, days: number, reason: string, actor: AccessClaims) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });
    if (org.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived organizations are read-only.' });
    }

    // Extending from today (not from a lapsed date) is what an admin means when
    // they rescue an expired trial.
    const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
    const newEndsAt = addDays(base, days);

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { trialEndsAt: newEndsAt, status: org.status === 'EXPIRED' ? 'TRIAL' : org.status },
      });
      await tx.trialEvent.create({
        data: {
          organizationId: id,
          type: 'EXTEND',
          days,
          previousEndsAt: org.trialEndsAt,
          newEndsAt,
          reason,
          actorId: actor.sub,
          actorEmail: actor.email,
        },
      });
      const sub = await tx.subscription.findFirst({
        where: { organizationId: id, status: { in: ['TRIAL', 'PAYMENT_DUE', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (sub) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { trialEndsAt: newEndsAt, currentPeriodEnd: newEndsAt, status: 'TRIAL' },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            type: 'trial.extended',
            fromStatus: sub.status,
            toStatus: 'TRIAL',
            metadata: { days, newEndsAt: newEndsAt.toISOString(), reason },
            actorId: actor.sub,
            actorEmail: actor.email,
          },
        });
      }
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: id,
      action: 'organization.extend_trial',
      entityType: 'Organization',
      entityId: id,
      before: { trialEndsAt: org.trialEndsAt },
      after: { trialEndsAt: newEndsAt },
      reason,
    });

    return this.get(id);
  }

  /** Spec §81 — Super Admin may raise one tenant above its plan's ceilings. */
  async overrideLimits(id: string, limits: Record<string, number | null | undefined>, reason: string, actor: AccessClaims) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { limitOverrides: true } });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });

    const clean = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined));
    await this.prisma.organization.update({
      where: { id },
      data: { limitOverrides: clean as Prisma.InputJsonValue },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: id,
      action: 'organization.override_limits',
      entityType: 'Organization',
      entityId: id,
      before: org.limitOverrides,
      after: clean,
      reason,
    });

    return this.get(id);
  }

  async setFeatureAccess(id: string, features: string[], reason: string | undefined, actor: AccessClaims) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { featureOverrides: true } });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });

    await this.prisma.organization.update({ where: { id }, data: { featureOverrides: features } });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: id,
      action: 'organization.feature_access',
      entityType: 'Organization',
      entityId: id,
      before: { featureOverrides: org.featureOverrides },
      after: { featureOverrides: features },
      reason,
    });

    return this.get(id);
  }

  /** Spec §80 — usage broken down per branch. */
  async branches(id: string) {
    return this.prisma.branch.findMany({
      where: { organizationId: id },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { members: true } } },
    });
  }

  trialHistory(id: string) {
    return this.prisma.trialEvent.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/** Mirrors the exact `include` used by `list()` — a narrower plan select than the full model. */
type OrganizationListRow = Prisma.OrganizationGetPayload<{
  include: {
    usage: true;
    subscriptions: { include: { plan: { select: { id: true; name: true; slug: true } } } };
  };
}>;

function toRow(org: OrganizationListRow) {
  const { subscriptions, usage, ...rest } = org;
  const sub = subscriptions[0];
  return {
    ...rest,
    plan: sub?.plan ? { id: sub.plan.id, name: sub.plan.name, slug: sub.plan.slug } : null,
    subscriptionStatus: sub?.status ?? null,
    branchCount: usage?.branches ?? 0,
    studentCount: usage?.students ?? 0,
  };
}

function pick<T extends object>(obj: T, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, (obj as Record<string, unknown>)[k]]));
}
