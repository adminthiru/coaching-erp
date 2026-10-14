import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AccessClaims } from '../auth/token.service';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const flags = await this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
      include: {
        plans: { include: { plan: { select: { id: true, name: true } } } },
        organizations: { include: { organization: { select: { id: true, name: true } } } },
      },
    });
    return flags.map((f) => ({
      key: f.key,
      description: f.description,
      enabledGlobally: f.enabledGlobally,
      plans: f.plans.map((p) => p.plan),
      organizations: f.organizations.map((o) => ({ ...o.organization, enabled: o.enabled })),
      updatedAt: f.updatedAt,
    }));
  }

  async upsert(
    input: { key: string; description?: string; enabledGlobally: boolean; enabledPlanIds: string[]; enabledOrganizationIds: string[] },
    actor: AccessClaims,
  ) {
    const before = await this.prisma.featureFlag.findUnique({ where: { key: input.key } });

    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlag.upsert({
        where: { key: input.key },
        create: { key: input.key, description: input.description || null, enabledGlobally: input.enabledGlobally },
        update: { description: input.description || null, enabledGlobally: input.enabledGlobally },
      });
      // Replace the targeting sets wholesale — the client always sends the full list.
      await tx.featureFlagPlan.deleteMany({ where: { flagKey: input.key } });
      await tx.featureFlagOrganization.deleteMany({ where: { flagKey: input.key } });
      if (input.enabledPlanIds.length) {
        await tx.featureFlagPlan.createMany({
          data: input.enabledPlanIds.map((planId) => ({ flagKey: input.key, planId })),
        });
      }
      if (input.enabledOrganizationIds.length) {
        await tx.featureFlagOrganization.createMany({
          data: input.enabledOrganizationIds.map((organizationId) => ({ flagKey: input.key, organizationId, enabled: true })),
        });
      }
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: before ? 'feature_flag.update' : 'feature_flag.create',
      entityType: 'FeatureFlag',
      entityId: input.key,
      before: before ? { enabledGlobally: before.enabledGlobally } : undefined,
      after: input,
    });

    return this.get(input.key);
  }

  async get(key: string) {
    const all = await this.list();
    const flag = all.find((f) => f.key === key);
    if (!flag) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That flag does not exist.' });
    return flag;
  }

  /**
   * Spec §23 resolution order: an explicit organization row wins (either way),
   * then the organization's plan, then the global default.
   */
  async isEnabled(key: string, organizationId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: { plans: true, organizations: true },
    });
    if (!flag) return false;

    if (organizationId) {
      const org = flag.organizations.find((o) => o.organizationId === organizationId);
      if (org) return org.enabled;

      if (flag.plans.length) {
        const sub = await this.prisma.subscription.findFirst({
          where: { organizationId, status: { in: ['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
          select: { planId: true },
        });
        if (sub && flag.plans.some((p) => p.planId === sub.planId)) return true;
      }
    }

    return flag.enabledGlobally;
  }
}
