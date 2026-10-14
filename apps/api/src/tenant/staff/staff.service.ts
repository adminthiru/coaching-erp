import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { addDays } from '@acadia/utils';
import { loadEnv } from '../../common/config/env';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const SAFE_USER = {
  id: true, name: true, email: true, phone: true, employeeId: true, role: true,
  isActive: true, invitedAt: true, acceptedAt: true, lastLoginAt: true, createdAt: true,
} as const;

@Injectable()
export class StaffService {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Staff visible to the caller. A branch-scoped user sees only people assigned
   * to a branch they can reach — never the whole organization's directory.
   */
  async list(ctx: TenantContext, query: PaginationQuery & { branchId?: string; role?: any }) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);

    const branchFilter = query.branchId
      ? [query.branchId]
      : ctx.activeBranchId
        ? [ctx.activeBranchId]
        : ctx.accessibleBranchIds;

    const where: Prisma.OrgUserWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt: null,
      role: query.role ? query.role : { notIn: ['STUDENT', 'PARENT'] },
      ...(branchFilter
        ? { branches: { some: { branchId: { in: branchFilter }, endedAt: null } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { employeeId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.orgUser.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['name', 'role', 'createdAt'] as const, query.sortBy, query.sortDir, 'name'),
        select: {
          ...SAFE_USER,
          branches: {
            where: { endedAt: null },
            select: { isPrimary: true, branch: { select: { id: true, name: true, code: true } } },
          },
        },
      }),
      this.prisma.orgUser.count({ where }),
    ]);

    return paginate(
      rows.map((u) => ({
        ...u,
        branches: u.branches.map((b) => ({ ...b.branch, isPrimary: b.isPrimary })),
        status: u.acceptedAt ? (u.isActive ? 'active' : 'inactive') : 'pending',
      })),
      total,
      query,
    );
  }

  /**
   * Spec §29. Creates the Branch Admin and their branch assignment together —
   * a Branch Admin without a branch is exactly the state the spec forbids, so it
   * must not be reachable even for a moment.
   */
  async createBranchAdmin(
    ctx: TenantContext,
    input: { name: string; email: string; phone?: string; employeeId?: string; branchId: string },
  ) {
    assertBranchAccess(ctx, input.branchId);

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (branch.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot assign staff to an archived branch.' });
    }

    const existing = await this.prisma.orgUser.findUnique({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: input.email } },
      include: { branches: { where: { endedAt: null }, include: { branch: { select: { name: true } } } } },
    });

    // Spec §37 — "admin already belongs to another branch". Adding an assignment
    // is the right answer for a multi-branch person, but it must be deliberate.
    if (existing) {
      const current = existing.branches.map((b) => b.branch.name);
      throw new BadRequestException({
        code: 'USER_EXISTS',
        message: current.length
          ? `${input.email} already belongs to this organization (${current.join(', ')}). Assign them to this branch instead.`
          : `${input.email} already belongs to this organization.`,
        details: { email: 'That email is already registered.', userId: existing.id, branches: current },
      });
    }

    await this.entitlements.assertWithinLimit(ctx.organizationId, 'admin_users', 1);

    const invitationToken = randomBytes(32).toString('base64url');
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orgUser.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          employeeId: input.employeeId || null,
          role: 'BRANCH_ADMIN',
          invitedAt: now,
          invitationToken,
          invitationExpiry: addDays(now, 14),
          branches: { create: { branchId: input.branchId, isPrimary: true } },
        },
        select: SAFE_USER,
      });

      await this.entitlements.increment(ctx.organizationId, 'admin_users', 1, tx);

      // A branch with an admin is ready to operate (spec §27).
      if (branch.status === 'SETUP_REQUIRED') {
        await tx.branch.update({ where: { id: branch.id }, data: { status: 'ACTIVE', openedAt: now } });
      }

      await tx.branchTransfer.create({
        data: {
          organizationId: ctx.organizationId,
          entityType: 'USER',
          entityId: created.id,
          entityLabel: created.name,
          toBranchId: branch.id,
          reason: 'Branch admin created',
          actorId: ctx.userId,
          actorEmail: ctx.email,
        },
      });

      return created;
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'branch_admin.create',
      entityType: 'OrgUser',
      entityId: user.id,
      after: { name: user.name, email: user.email, branchId: branch.id, branchName: branch.name },
    });

    return {
      ...user,
      branchId: branch.id,
      // Returned only in development so the invitation flow is testable before a
      // mailer exists. Production sends this by email and never returns it.
      // Read from the validated env, not process.env directly — NODE_ENV is often
      // unset locally, and loadEnv() is what defines the default the app runs on.
      invitationToken: this.env.NODE_ENV === 'development' ? invitationToken : undefined,
    };
  }

  /** Spec §40 — a person may hold assignments in several branches. */
  async assignToBranch(ctx: TenantContext, userId: string, branchId: string, isPrimary: boolean) {
    assertBranchAccess(ctx, branchId);

    const [user, branch] = await Promise.all([
      this.prisma.orgUser.findFirst({
        where: { id: userId, organizationId: ctx.organizationId, deletedAt: null },
        include: { branches: { where: { endedAt: null } } },
      }),
      this.prisma.branch.findFirst({ where: { id: branchId, organizationId: ctx.organizationId } }),
    ]);

    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That person does not exist.' });
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (branch.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot assign staff to an archived branch.' });
    }
    if (user.branches.some((b) => b.branchId === branchId)) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'They are already assigned to that branch.' });
    }

    await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.branchUser.updateMany({
          where: { userId, endedAt: null },
          data: { isPrimary: false },
        });
      }
      await tx.branchUser.create({ data: { userId, branchId, isPrimary } });
      await tx.branchTransfer.create({
        data: {
          organizationId: ctx.organizationId,
          entityType: 'USER',
          entityId: userId,
          entityLabel: user.name,
          toBranchId: branchId,
          reason: 'Additional branch assignment',
          actorId: ctx.userId,
          actorEmail: ctx.email,
        },
      });
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'staff.assign_branch',
      entityType: 'OrgUser',
      entityId: userId,
      after: { branchId, isPrimary },
    });

    return this.get(ctx, userId);
  }

  /**
   * Spec §35. Ends the assignment at the source and opens one at the destination
   * in a single transaction, leaving a transfer record behind.
   *
   * Historical rows keep pointing at the branch that owned them at the time —
   * only future records follow the destination.
   */
  async transfer(ctx: TenantContext, userId: string, toBranchId: string, reason: string) {
    assertBranchAccess(ctx, toBranchId);

    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, deletedAt: null },
      include: { branches: { where: { endedAt: null }, include: { branch: { select: { id: true, name: true } } } } },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That person does not exist.' });

    const destination = await this.prisma.branch.findFirst({
      where: { id: toBranchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!destination) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (destination.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot transfer into an archived branch.' });
    }

    const from = user.branches.find((b) => b.isPrimary) ?? user.branches[0];
    if (from?.branchId === toBranchId) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'They are already in that branch.' });
    }
    // The caller must be able to reach the branch they are moving someone out of.
    if (from) assertBranchAccess(ctx, from.branchId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (from) {
        await tx.branchUser.update({ where: { id: from.id }, data: { endedAt: now, isPrimary: false } });
      }

      // Re-open a previously ended assignment rather than violating the
      // (userId, branchId) uniqueness with a second row.
      const prior = await tx.branchUser.findUnique({
        where: { userId_branchId: { userId, branchId: toBranchId } },
      });
      if (prior) {
        await tx.branchUser.update({
          where: { id: prior.id },
          data: { endedAt: null, isPrimary: true, assignedAt: now },
        });
      } else {
        await tx.branchUser.create({ data: { userId, branchId: toBranchId, isPrimary: true } });
      }

      await tx.branchTransfer.create({
        data: {
          organizationId: ctx.organizationId,
          entityType: 'USER',
          entityId: userId,
          entityLabel: user.name,
          fromBranchId: from?.branchId ?? null,
          toBranchId,
          reason,
          actorId: ctx.userId,
          actorEmail: ctx.email,
        },
      });

      // The moved person's sessions may still point at the old branch.
      await tx.orgSession.updateMany({
        where: { userId, activeBranchId: from?.branchId ?? undefined },
        data: { activeBranchId: toBranchId },
      });
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'staff.transfer',
      entityType: 'OrgUser',
      entityId: userId,
      before: { branchId: from?.branchId ?? null, branchName: from?.branch.name ?? null },
      after: { branchId: toBranchId, branchName: destination.name },
      reason,
    });

    return this.get(ctx, userId);
  }

  async get(ctx: TenantContext, userId: string) {
    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, deletedAt: null },
      select: {
        ...SAFE_USER,
        branches: {
          where: { endedAt: null },
          select: { isPrimary: true, assignedAt: true, branch: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That person does not exist.' });

    // A branch-scoped caller may only see people who share a branch with them.
    if (ctx.accessibleBranchIds) {
      const shares = user.branches.some((b) => ctx.accessibleBranchIds!.includes(b.branch.id));
      if (!shares) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That person does not exist.' });
    }

    return {
      ...user,
      branches: user.branches.map((b) => ({ ...b.branch, isPrimary: b.isPrimary, assignedAt: b.assignedAt })),
      status: user.acceptedAt ? (user.isActive ? 'active' : 'inactive') : 'pending',
    };
  }

  async setActive(ctx: TenantContext, userId: string, isActive: boolean) {
    const user = await this.get(ctx, userId);
    if (user.role === 'ORG_OWNER') {
      throw new BadRequestException({
        code: 'OWNER_PROTECTED',
        message: 'The organization owner cannot be deactivated.',
      });
    }
    if (userId === ctx.userId) {
      throw new BadRequestException({ code: 'SELF_DEACTIVATE', message: 'You cannot deactivate your own account.' });
    }

    await this.prisma.$transaction([
      this.prisma.orgUser.update({ where: { id: userId }, data: { isActive } }),
      ...(isActive
        ? []
        : [this.prisma.orgSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]),
    ]);

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: isActive ? 'staff.activate' : 'staff.deactivate',
      entityType: 'OrgUser',
      entityId: userId,
    });

    return this.get(ctx, userId);
  }
}
