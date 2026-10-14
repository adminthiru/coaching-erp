import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service';
import type { TenantContext } from '../scope/tenant-context';

@Injectable()
export class TenantOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Spec §26 — the tenant's own view of itself. Billing internals stay out. */
  async profile(ctx: TenantContext) {
    const [org, entitlements, usage] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
        select: {
          id: true, name: true, slug: true, status: true, logoUrl: true, website: true,
          email: true, phone: true, addressLine: true, city: true, state: true,
          country: true, pincode: true, timezone: true, trialEndsAt: true, createdAt: true,
          ownerName: true, ownerEmail: true,
        },
      }),
      this.entitlements.resolve(ctx.organizationId),
      this.entitlements.usageReport(ctx.organizationId),
    ]);

    return {
      ...org,
      plan: { name: entitlements.planName, features: entitlements.features },
      usage,
      // Drives the onboarding checklist (spec §25).
      setup: await this.setupState(ctx.organizationId),
    };
  }

  async update(ctx: TenantContext, input: Record<string, unknown>) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'This organization is read-only.' });
    }

    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]),
    );

    await this.prisma.organization.update({ where: { id: ctx.organizationId }, data });
    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'organization.update_profile',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      after: data,
    });

    return this.profile(ctx);
  }

  /**
   * Spec §25 — the onboarding gate. An organization is not operational until it
   * has a branch, and that branch has an admin.
   */
  private async setupState(organizationId: string) {
    const [org, branchCount, adminCount] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { city: true, phone: true },
      }),
      this.prisma.branch.count({ where: { organizationId, status: { not: 'ARCHIVED' } } }),
      this.prisma.orgUser.count({
        where: { organizationId, role: 'BRANCH_ADMIN', deletedAt: null },
      }),
    ]);

    const steps = [
      { key: 'profile', label: 'Complete the organization profile', done: Boolean(org.city && org.phone) },
      { key: 'branch', label: 'Create your first branch', done: branchCount > 0 },
      { key: 'branch_admin', label: 'Add a branch admin', done: adminCount > 0 },
    ];

    return {
      steps,
      complete: steps.every((s) => s.done),
      // Until a branch exists there is nothing to operate on.
      operational: branchCount > 0,
    };
  }
}
