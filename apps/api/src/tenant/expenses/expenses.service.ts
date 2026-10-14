import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** REJECTED and PAID are terminal — a settled expense is not re-litigated. */
const ALLOWED: Record<ExpenseStatus, ExpenseStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID', 'REJECTED'],
  REJECTED: [],
  PAID: [],
};

const INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  recordedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

/** Spec §63 — branch expenses and central organization costs. */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A central cost (`branchId: null`) belongs to the organization, so only
   * organization-level roles see it — a Branch Admin's expense list is their
   * branch's, not head office's.
   */
  private visibility(ctx: TenantContext): Prisma.ExpenseWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { branchId: { in: reachable } };
  }

  async list(ctx: TenantContext, query: PaginationQuery & { status?: ExpenseStatus; category?: any; from?: string; to?: string }) {
    const where: Prisma.ExpenseWhereInput = {
      organizationId: ctx.organizationId,
      ...this.visibility(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            incurredOn: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['incurredOn', 'amountMinor', 'createdAt'] as const, query.sortBy, query.sortDir, 'incurredOn'),
        include: INCLUDE,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginate(rows.map((r) => ({ ...r, scope: r.branchId ? 'branch' : 'organization' })), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: INCLUDE,
    });
    if (!expense) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That expense does not exist.' });
    return expense;
  }

  async create(ctx: TenantContext, input: any) {
    // Spec §63: a central organization cost is not a branch's to book.
    if (!input.branchId) {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only organization-level roles can record a central organization expense.',
        });
      }
    } else {
      assertBranchAccess(ctx, input.branchId);
    }

    const expense = await this.prisma.expense.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        category: input.category,
        title: input.title,
        description: input.description || null,
        amountMinor: input.amountMinor,
        incurredOn: new Date(`${input.incurredOn}T00:00:00.000Z`),
        vendor: input.vendor || null,
        reference: input.reference || null,
        recordedById: ctx.userId,
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'expense.create', entityType: 'Expense', entityId: expense.id,
      after: { title: expense.title, amountMinor: expense.amountMinor, branchId: expense.branchId },
    });

    return expense;
  }

  async changeStatus(ctx: TenantContext, id: string, status: ExpenseStatus, reason?: string) {
    const expense = await this.get(ctx, id);

    if (expense.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This expense is already ${status.toLowerCase()}.` });
    }
    if (!ALLOWED[expense.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `An expense cannot move from ${expense.status} to ${status}.`,
        details: { from: expense.status, to: status, allowed: ALLOWED[expense.status] },
      });
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status,
        approvedById: status === 'APPROVED' ? ctx.userId : expense.approvedById,
        approvedAt: status === 'APPROVED' ? new Date() : expense.approvedAt,
        paidAt: status === 'PAID' ? new Date() : expense.paidAt,
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `expense.${status.toLowerCase()}`, entityType: 'Expense', entityId: id,
      before: { status: expense.status }, after: { status }, reason,
    });

    return updated;
  }
}
