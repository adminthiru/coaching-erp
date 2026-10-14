import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const INCLUDE = {
  batch: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true } },
  publishedBy: { select: { id: true, name: true } },
  targets: { include: { branch: { select: { id: true, name: true, code: true } } } },
} as const;

/**
 * Spec §49 — communication targeting.
 *
 * `audience` says who it is for; `targets` says which branches it reaches. An
 * organization-wide notice has no targets, which is how a Branch Admin can see it
 * without being able to see another branch's notices.
 */
@Injectable()
export class CommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Visibility, not just filtering: a branch-scoped user sees organization-wide
   * announcements plus those targeted at a branch they can reach — and nothing
   * else, because the predicate is part of the query.
   */
  async list(ctx: TenantContext, query: PaginationQuery & { status?: any }) {
    const reachable = ctx.activeBranchId
      ? [ctx.activeBranchId]
      : ctx.accessibleBranchIds;

    const visibility: Prisma.AnnouncementWhereInput =
      reachable === null
        ? {}
        : {
            OR: [
              { audience: 'ALL_BRANCHES' },
              { targets: { some: { branchId: { in: reachable } } } },
            ],
          };

    const where: Prisma.AnnouncementWhereInput = {
      organizationId: ctx.organizationId,
      ...visibility,
      ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'publishedAt', 'title'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const now = new Date();
    return paginate(
      rows.map((a) => ({
        ...a,
        targets: a.targets.map((t) => t.branch),
        pinned: Boolean(a.pinnedUntil && a.pinnedUntil > now),
      })),
      total,
      query,
    );
  }

  async get(ctx: TenantContext, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: INCLUDE,
    });
    if (!announcement) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That announcement does not exist.' });

    // Org-wide notices are readable by everyone in the tenant; a targeted one
    // only by someone who can reach one of its branches.
    if (announcement.audience !== 'ALL_BRANCHES' && ctx.accessibleBranchIds) {
      const reachable = announcement.targets.some((t) => ctx.accessibleBranchIds!.includes(t.branchId));
      if (!reachable) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'That announcement does not exist.' });
      }
    }

    return { ...announcement, targets: announcement.targets.map((t) => t.branch) };
  }

  async create(ctx: TenantContext, input: any) {
    const branchIds = await this.resolveTargets(ctx, input);

    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { id: true, branchId: true },
      });
      if (!batch) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.', details: { batchId: 'Pick a batch.' } });
      }
      assertBranchAccess(ctx, batch.branchId);
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        organizationId: ctx.organizationId,
        title: input.title,
        body: input.body,
        audience: input.audience,
        batchId: input.batchId ?? null,
        courseId: input.courseId ?? null,
        pinnedUntil: input.pinnedUntil ? new Date(`${input.pinnedUntil}T23:59:59.999Z`) : null,
        targets: { create: branchIds.map((branchId) => ({ branchId })) },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'announcement.create', entityType: 'Announcement', entityId: announcement.id,
      after: { title: announcement.title, audience: announcement.audience, branches: branchIds.length },
    });

    return { ...announcement, targets: announcement.targets.map((t) => t.branch) };
  }

  async setStatus(ctx: TenantContext, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const announcement = await this.get(ctx, id);

    if (announcement.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This announcement is already ${status.toLowerCase()}.` });
    }
    // A published notice has been seen; it is archived, never returned to draft.
    if (announcement.status === 'PUBLISHED' && status === 'DRAFT') {
      throw new BadRequestException({
        code: 'ALREADY_PUBLISHED',
        message: 'A published announcement cannot go back to draft. Archive it instead.',
      });
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? announcement.publishedAt ?? new Date() : announcement.publishedAt,
        publishedById: status === 'PUBLISHED' ? announcement.publishedById ?? ctx.userId : announcement.publishedById,
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `announcement.${status.toLowerCase()}`, entityType: 'Announcement', entityId: id,
      before: { status: announcement.status }, after: { status },
    });

    return { ...updated, targets: updated.targets.map((t) => t.branch) };
  }

  /**
   * Turns an audience choice into a concrete branch list, refusing any branch the
   * caller cannot reach. Spec §49's "All branches" is reserved for org-level roles
   * — a Branch Admin broadcasting organization-wide is exactly the scope escape
   * §86 forbids.
   */
  private async resolveTargets(ctx: TenantContext, input: any): Promise<string[]> {
    if (input.audience === 'ALL_BRANCHES') {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only organization-level roles can announce to every branch.',
        });
      }
      return [];
    }

    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { branchId: true },
      });
      return batch ? [batch.branchId] : [];
    }

    const requested: string[] = input.branchIds?.length
      ? input.branchIds
      : ctx.activeBranchId
        ? [ctx.activeBranchId]
        : [];

    if (!requested.length) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Choose at least one branch, or switch out of the all-branch view.',
        details: { branchIds: 'Pick a branch.' },
      });
    }

    for (const id of requested) assertBranchAccess(ctx, id);

    const found = await this.prisma.branch.count({
      where: { id: { in: requested }, organizationId: ctx.organizationId },
    });
    if (found !== requested.length) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected branches do not exist.' });
    }

    return requested;
  }
}
