import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ALL_FEATURES, ALL_LIMITS, type Feature, type LimitKey, type PlanLimits } from '@acadia/types';
import { quota } from '@acadia/utils';

/** Maps a LimitKey to the counter column that tracks it on OrganizationUsage. */
const USAGE_COLUMN: Record<LimitKey, keyof Omit<
  Prisma.OrganizationUsageGetPayload<{}>,
  'organizationId' | 'recalculatedAt' | 'updatedAt'
>> = {
  students: 'students',
  branches: 'branches',
  faculty: 'faculty',
  admin_users: 'adminUsers',
  storage_mb: 'storageMb',
  messages: 'messages',
  tests: 'tests',
  questions: 'questions',
};

export interface ResolvedEntitlements {
  planId: string | null;
  planName: string | null;
  features: Feature[];
  limits: PlanLimits;
  /** True where the organization carries a Super Admin override for that key. */
  overriddenLimits: LimitKey[];
  overriddenFeatures: Feature[];
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolution order, most specific first:
   *   organization override → active plan → nothing.
   *
   * Spec §15/§81: a Super Admin override outranks the plan for a single tenant
   * without mutating the plan every other tenant shares.
   */
  async resolve(organizationId: string): Promise<ResolvedEntitlements> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        limitOverrides: true,
        featureOverrides: true,
        subscriptions: {
          where: { status: { in: ['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { plan: { select: { id: true, name: true, features: true, limits: true } } },
        },
      },
    });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That organization does not exist.' });

    const plan = org.subscriptions[0]?.plan ?? null;

    const planFeatures = (plan?.features ?? []).filter((f): f is Feature =>
      (ALL_FEATURES as string[]).includes(f),
    );
    const overriddenFeatures = org.featureOverrides.filter((f): f is Feature =>
      (ALL_FEATURES as string[]).includes(f),
    );

    const planLimits = coerceLimits(plan?.limits);
    const overrides = coerceLimits(org.limitOverrides);

    return {
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      features: Array.from(new Set([...planFeatures, ...overriddenFeatures])),
      limits: { ...planLimits, ...overrides },
      overriddenLimits: Object.keys(overrides) as LimitKey[],
      overriddenFeatures,
    };
  }

  async hasFeature(organizationId: string, feature: Feature) {
    const { features } = await this.resolve(organizationId);
    return features.includes(feature);
  }

  async assertFeature(organizationId: string, feature: Feature) {
    if (!(await this.hasFeature(organizationId, feature))) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_ENTITLED',
        message: 'That capability is not included in this plan.',
        details: { feature },
      });
    }
  }

  /** Current counters, defaulting to zeroes before the usage row exists. */
  async usage(organizationId: string) {
    const row = await this.prisma.organizationUsage.findUnique({ where: { organizationId } });
    return {
      students: row?.students ?? 0,
      branches: row?.branches ?? 0,
      faculty: row?.faculty ?? 0,
      admin_users: row?.adminUsers ?? 0,
      storage_mb: row?.storageMb ?? 0,
      messages: row?.messages ?? 0,
      tests: row?.tests ?? 0,
      questions: row?.questions ?? 0,
    } satisfies Record<LimitKey, number>;
  }

  /** Every limit with its consumption — drives the usage panel in spec §16. */
  async usageReport(organizationId: string) {
    const [ent, used] = await Promise.all([this.resolve(organizationId), this.usage(organizationId)]);
    return ALL_LIMITS.map((key) => ({
      key,
      ...quota(used[key], ent.limits[key] ?? null),
      overridden: ent.overriddenLimits.includes(key),
    }));
  }

  /**
   * The gate in front of every quota-consuming create (spec §81).
   *
   * The message is deliberately the one the spec dictates, naming the plan and
   * the ceiling, because the frontend renders it verbatim next to [Upgrade Plan].
   */
  async assertWithinLimit(organizationId: string, key: LimitKey, adding = 1) {
    const ent = await this.resolve(organizationId);
    const limit = ent.limits[key] ?? null;
    if (limit === null) return;

    const used = (await this.usage(organizationId))[key];
    if (used + adding > limit) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message: ent.planName
          ? `Your ${ent.planName} plan allows ${limit} ${LABEL[key]}.`
          : `This organization is limited to ${limit} ${LABEL[key]}.`,
        details: { limit: key, allowed: limit, used, requested: adding, planName: ent.planName },
      });
    }
  }

  /**
   * Adjusts a counter in step with the row that caused the change. Pass the
   * transaction client so the counter can never drift from the data.
   */
  async increment(organizationId: string, key: LimitKey, by: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const column = USAGE_COLUMN[key];

    // Counters are non-negative: an upsert that creates the row starts it at the
    // delta only when the delta is positive, never at a negative value.
    const create: Prisma.OrganizationUsageUncheckedCreateInput = {
      organizationId,
      [column]: Math.max(0, by),
    };
    const update: Prisma.OrganizationUsageUncheckedUpdateInput = {
      [column]: { increment: by },
    };

    await client.organizationUsage.upsert({ where: { organizationId }, create, update });
  }

  /**
   * Recomputes counters from the source tables. Counters are incremental on the
   * hot path, so this exists to repair drift after an incident or a manual edit.
   */
  async recalculate(organizationId: string) {
    const [branches, adminUsers, faculty] = await this.prisma.$transaction([
      this.prisma.branch.count({ where: { organizationId, status: { not: 'ARCHIVED' } } }),
      this.prisma.orgUser.count({
        where: { organizationId, deletedAt: null, role: { in: ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'] } },
      }),
      this.prisma.orgUser.count({ where: { organizationId, deletedAt: null, role: 'FACULTY' } }),
    ]);

    return this.prisma.organizationUsage.upsert({
      where: { organizationId },
      create: { organizationId, branches, adminUsers, faculty, recalculatedAt: new Date() },
      update: { branches, adminUsers, faculty, recalculatedAt: new Date() },
    });
  }
}

const LABEL: Record<LimitKey, string> = {
  students: 'students',
  branches: 'branches',
  faculty: 'faculty members',
  admin_users: 'admin users',
  storage_mb: 'MB of storage',
  messages: 'messages',
  tests: 'tests',
  questions: 'questions',
};

/** Narrows a Prisma Json column to the limits map, discarding unknown keys. */
function coerceLimits(value: unknown): PlanLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: PlanLimits = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(ALL_LIMITS as string[]).includes(k)) continue;
    if (v === null) out[k as LimitKey] = null;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k as LimitKey] = v;
  }
  return out;
}
