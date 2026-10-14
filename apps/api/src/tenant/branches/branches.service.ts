import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BranchStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** Spec §27. A branch is archived, never deleted — its history has to survive. */
const ALLOWED: Record<BranchStatus, BranchStatus[]> = {
  SETUP_REQUIRED: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['TEMPORARILY_CLOSED', 'SUSPENDED', 'ARCHIVED'],
  TEMPORARILY_CLOSED: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

const LIST_SORTS = ['name', 'code', 'city', 'status', 'createdAt'] as const;

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Spec §32: never show a branch the user cannot reach. The scope is applied as
   * a query predicate rather than a post-filter, so an inaccessible branch is not
   * merely hidden — it is never read.
   */
  async list(ctx: TenantContext, query: PaginationQuery & { status?: BranchStatus }) {
    const where: Prisma.BranchWhereInput = {
      organizationId: ctx.organizationId,
      ...(ctx.accessibleBranchIds ? { id: { in: ctx.accessibleBranchIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search.toUpperCase() } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(LIST_SORTS, query.sortBy, query.sortDir, 'name'),
        include: {
          members: {
            where: { endedAt: null },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          },
        },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  /** The branch switcher's options — accessible, non-archived branches only. */
  async switchable(ctx: TenantContext) {
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: 'ARCHIVED' },
        ...(ctx.accessibleBranchIds ? { id: { in: ctx.accessibleBranchIds } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, city: true, status: true },
    });

    return {
      branches,
      // Spec §33 — only a cross-branch role is offered the all-branch view.
      canSelectAll: ctx.accessibleBranchIds === null,
      activeBranchId: ctx.activeBranchId,
    };
  }

  async get(ctx: TenantContext, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        members: {
          where: { endedAt: null },
          include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true, acceptedAt: true } } },
        },
      },
    });
    // A branch in another tenant is answered 404 — its existence must not leak.
    // A sibling branch in the same organization is answered 403, which is both
    // honest and more useful: staff already know their organization has branches.
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    assertBranchAccess(ctx, branch.id);
    return shape(branch);
  }

  /**
   * Spec §§28, 37, 81. Creation is gated on the plan's branch entitlement, and
   * both duplicate-code and duplicate-name are caught before the insert so the
   * message names the field rather than surfacing a constraint violation.
   */
  async create(
    ctx: TenantContext,
    input: {
      name: string; code: string; city: string; state: string; country?: string;
      addressLine?: string; pincode?: string; phone?: string; email?: string;
      timezone?: string; workingDays?: number[];
    },
  ) {
    await this.entitlements.assertWithinLimit(ctx.organizationId, 'branches', 1);
    await this.assertUnique(ctx.organizationId, input.name, input.code);

    const branch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          code: input.code,
          city: input.city,
          state: input.state,
          country: input.country ?? 'India',
          addressLine: input.addressLine || null,
          pincode: input.pincode || null,
          phone: input.phone || null,
          email: input.email || null,
          timezone: input.timezone ?? 'Asia/Kolkata',
          ...(input.workingDays?.length ? { workingDays: input.workingDays } : {}),
          // Spec §27: a branch with no admin is not yet operational.
          status: 'SETUP_REQUIRED',
        },
      });

      await this.entitlements.increment(ctx.organizationId, 'branches', 1, tx);
      return created;
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'branch.create',
      entityType: 'Branch',
      entityId: branch.id,
      after: { name: branch.name, code: branch.code, city: branch.city },
    });

    return this.get(ctx, branch.id);
  }

  async update(ctx: TenantContext, id: string, input: Record<string, unknown>) {
    const before = await this.prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    assertBranchAccess(ctx, id);

    if (before.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived branches are read-only.' });
    }

    if (typeof input.name === 'string' || typeof input.code === 'string') {
      await this.assertUnique(
        ctx.organizationId,
        typeof input.name === 'string' ? input.name : before.name,
        typeof input.code === 'string' ? input.code : before.code,
        id,
      );
    }

    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]),
    );

    await this.prisma.branch.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'branch.update',
      entityType: 'Branch',
      entityId: id,
      after: data,
    });

    return this.get(ctx, id);
  }

  /**
   * Spec §§36, 82 — what closing a branch would strand.
   *
   * Shown before the confirmation so the decision is informed, and re-checked on
   * the way in so the UI cannot be bypassed.
   */
  async closureImpact(ctx: TenantContext, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    assertBranchAccess(ctx, id);

    const [activeStaff, otherBranches] = await this.prisma.$transaction([
      this.prisma.branchUser.count({ where: { branchId: id, endedAt: null } }),
      this.prisma.branch.count({
        where: { organizationId: ctx.organizationId, id: { not: id }, status: { in: ['ACTIVE', 'SETUP_REQUIRED'] } },
      }),
    ]);

    // Students, batches, fees and tests join this list as their phases land.
    const blockers: { key: string; label: string; count: number; resolution: string }[] = [];
    if (activeStaff > 0) {
      blockers.push({
        key: 'staff',
        label: 'Assigned staff',
        count: activeStaff,
        resolution: otherBranches > 0
          ? 'Transfer them to another branch, or end their assignment.'
          : 'No other branch is available to transfer them to.',
      });
    }

    return {
      branch,
      blockers,
      canArchive: blockers.length === 0,
      otherBranchCount: otherBranches,
    };
  }

  async changeStatus(ctx: TenantContext, id: string, status: BranchStatus, reason: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!branch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    assertBranchAccess(ctx, id);

    if (branch.status === status) {
      throw new BadRequestException({
        code: 'NO_CHANGE',
        message: `This branch is already ${status.toLowerCase().replace(/_/g, ' ')}.`,
      });
    }
    if (!ALLOWED[branch.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A branch cannot move from ${branch.status} to ${status}.`,
        details: { from: branch.status, to: status, allowed: ALLOWED[branch.status] },
      });
    }

    if (status === 'ARCHIVED') {
      const impact = await this.closureImpact(ctx, id);
      if (!impact.canArchive) {
        throw new BadRequestException({
          code: 'BRANCH_NOT_EMPTY',
          message: 'Resolve the branch’s active records before archiving it.',
          details: { blockers: impact.blockers },
        });
      }
      // Spec §36: the organization must never be left with no operating branch.
      if (impact.otherBranchCount === 0) {
        throw new BadRequestException({
          code: 'LAST_BRANCH',
          message: 'This is the only operating branch. An organization must keep at least one.',
        });
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id },
        data: {
          status,
          openedAt: status === 'ACTIVE' && !branch.openedAt ? now : branch.openedAt,
          closedAt: status === 'TEMPORARILY_CLOSED' || status === 'SUSPENDED' ? now : null,
          archivedAt: status === 'ARCHIVED' ? now : branch.archivedAt,
        },
      });
      // An archived branch stops counting against the plan's branch quota.
      if (status === 'ARCHIVED') {
        await this.entitlements.increment(ctx.organizationId, 'branches', -1, tx);
      }
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `branch.${status.toLowerCase()}`,
      entityType: 'Branch',
      entityId: id,
      before: { status: branch.status },
      after: { status },
      reason,
    });

    return this.get(ctx, id);
  }

  /** Spec §75 — every move in or out of this branch. */
  async transferHistory(ctx: TenantContext, id: string) {
    assertBranchAccess(ctx, id);
    return this.prisma.branchTransfer.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ fromBranchId: id }, { toBranchId: id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });
  }

  /** Spec §37 — duplicate code and duplicate name are separate, named failures. */
  private async assertUnique(organizationId: string, name: string, code: string, exceptId?: string) {
    const clash = await this.prisma.branch.findFirst({
      where: {
        organizationId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [{ code }, { name }],
      },
      select: { code: true, name: true },
    });
    if (!clash) return;

    if (clash.code === code) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Branch code ${code} is already used in this organization.`,
        details: { code: 'That branch code is already used.' },
      });
    }
    throw new BadRequestException({
      code: 'DUPLICATE',
      message: `A branch named "${name}" already exists in this organization.`,
      details: { name: 'That branch name is already used.' },
    });
  }
}

type BranchWithMembers = Prisma.BranchGetPayload<{
  include: { members: { include: { user: { select: { id: true; name: true; email: true; role: true } } } } };
}>;

function shape(branch: BranchWithMembers | (BranchWithMembers & Record<string, unknown>)) {
  const { members, ...rest } = branch;
  const admins = members.filter((m) => m.user.role === 'BRANCH_ADMIN').map((m) => m.user);
  return {
    ...rest,
    admins,
    staffCount: members.length,
    // Spec §37: a branch created without an admin is visibly incomplete.
    needsAdmin: admins.length === 0,
  };
}
