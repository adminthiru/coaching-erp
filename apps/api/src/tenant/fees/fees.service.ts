import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const STRUCTURE_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  components: { orderBy: { sequence: 'asc' } },
  _count: { select: { studentFees: true } },
} as const;

const FEE_INCLUDE = {
  student: { select: { id: true, name: true, studentCode: true } },
  branch: { select: { id: true, name: true, code: true } },
  feeStructure: { select: { id: true, name: true } },
  installments: { orderBy: { sequence: 'asc' } },
  concessions: {
    orderBy: { createdAt: 'desc' },
    include: { grantedBy: { select: { id: true, name: true } } },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: { collectedBy: { select: { id: true, name: true } }, refunds: true },
  },
} as const;

/** Derived, never guessed: what a student owes decides the status. */
function statusFor(netMinor: number, paidMinor: number): StudentFeeStatus {
  if (paidMinor >= netMinor) return 'PAID';
  if (paidMinor > 0) return 'PARTIALLY_PAID';
  return 'PENDING';
}

/** Spec §§61–62 — fee structures, student accounts, concessions and collection. */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── Structures (spec §61) ─────────────────────────────────────────────── */

  /**
   * An organization-wide structure (`branchId: null`) is usable everywhere; a
   * branch's own is visible only to that branch. Same shape as the question
   * bank's shared-vs-branch library (spec §51, §77).
   */
  private structureVisibility(ctx: TenantContext): Prisma.FeeStructureWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  async listStructures(ctx: TenantContext, query: PaginationQuery & { courseId?: string }) {
    const where: Prisma.FeeStructureWhereInput = {
      organizationId: ctx.organizationId,
      ...this.structureVisibility(ctx),
      isActive: true,
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feeStructure.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['name', 'createdAt', 'totalMinor'] as const, query.sortBy, query.sortDir, 'name'),
        include: STRUCTURE_INCLUDE,
      }),
      this.prisma.feeStructure.count({ where }),
    ]);

    return paginate(
      rows.map(({ _count, ...r }) => ({ ...r, assignedCount: _count.studentFees, scope: r.branchId ? 'branch' : 'organization' })),
      total,
      query,
    );
  }

  async createStructure(ctx: TenantContext, input: any) {
    // Spec §77: only an organization-level role may add to the shared library
    // every branch draws on.
    if (!input.branchId && ctx.accessibleBranchIds !== null) {
      throw new BadRequestException({
        code: 'FORBIDDEN',
        message: 'Only organization-level roles can create a fee structure shared across every branch.',
      });
    }
    if (input.branchId) assertBranchAccess(ctx, input.branchId);

    const totalMinor = input.components.reduce((sum: number, c: any) => sum + c.amountMinor, 0);

    const structure = await this.prisma.feeStructure.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: input.branchId ?? null,
        courseId: input.courseId ?? null,
        academicYearId: input.academicYearId ?? null,
        name: input.name,
        description: input.description || null,
        totalMinor,
        components: {
          create: input.components.map((c: any, i: number) => ({
            name: c.name, amountMinor: c.amountMinor, isOptional: c.isOptional ?? false, sequence: i,
          })),
        },
      },
      include: STRUCTURE_INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'fee_structure.create', entityType: 'FeeStructure', entityId: structure.id,
      after: { name: structure.name, totalMinor, scope: structure.branchId ? 'branch' : 'organization' },
    });

    const { _count, ...rest } = structure;
    return { ...rest, assignedCount: _count.studentFees };
  }

  /* ── Student accounts ──────────────────────────────────────────────────── */

  async listStudentFees(ctx: TenantContext, query: PaginationQuery & { status?: StudentFeeStatus; studentId?: string; outstanding?: boolean }) {
    const where: Prisma.StudentFeeWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      // "Outstanding" is a status question, not an arithmetic one — the status
      // column is kept in step with the money on every write.
      ...(query.outstanding ? { status: { in: ['PENDING', 'PARTIALLY_PAID'] } } : {}),
      ...(query.search
        ? {
            OR: [
              { student: { name: { contains: query.search, mode: 'insensitive' } } },
              { student: { studentCode: { contains: query.search.toUpperCase() } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentFee.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['assignedAt', 'netMinor', 'paidMinor'] as const, query.sortBy, query.sortDir, 'assignedAt'),
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          branch: { select: { id: true, name: true, code: true } },
          feeStructure: { select: { id: true, name: true } },
        },
      }),
      this.prisma.studentFee.count({ where }),
    ]);

    return paginate(rows.map((r) => ({ ...r, outstandingMinor: r.netMinor - r.paidMinor })), total, query);
  }

  async getStudentFee(ctx: TenantContext, id: string) {
    const fee = await this.prisma.studentFee.findFirst({
      where: { id, organizationId: ctx.organizationId, ...branchScope(ctx) },
      include: FEE_INCLUDE,
    });
    if (!fee) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That fee account does not exist.' });
    return { ...fee, outstandingMinor: fee.netMinor - fee.paidMinor };
  }

  /**
   * Assigning copies the structure's numbers onto the student. Editing the
   * template afterwards must never silently restate an existing student's debt,
   * which is exactly what reading through a live relation would do.
   */
  async assignFee(ctx: TenantContext, input: any) {
    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true, status: true },
    });
    if (!student) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student does not exist.', details: { studentId: 'Pick a student.' } });
    }
    assertBranchAccess(ctx, student.branchId);

    const structure = await this.prisma.feeStructure.findFirst({
      where: { id: input.feeStructureId, organizationId: ctx.organizationId, isActive: true, ...this.structureVisibility(ctx) },
      include: { components: true },
    });
    if (!structure) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That fee structure is unavailable to you.', details: { feeStructureId: 'Pick a structure.' } });
    }
    // A branch-specific structure belongs to exactly one branch's students.
    if (structure.branchId && structure.branchId !== student.branchId) {
      throw new BadRequestException({
        code: 'STRUCTURE_OUT_OF_SCOPE',
        message: `That structure belongs to another branch, so it cannot be assigned to ${student.name}.`,
      });
    }

    const existing = await this.prisma.studentFee.findUnique({
      where: { studentId_feeStructureId: { studentId: student.id, feeStructureId: structure.id } },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'ALREADY_ASSIGNED',
        message: `${student.name} already has this fee structure assigned.`,
      });
    }

    const grossMinor = structure.totalMinor;
    const installments: { label: string; amountMinor: number; dueDate: string }[] = input.installments ?? [];
    if (installments.length) {
      const scheduled = installments.reduce((sum, i) => sum + i.amountMinor, 0);
      if (scheduled !== grossMinor) {
        throw new BadRequestException({
          code: 'SCHEDULE_MISMATCH',
          message: `The installments total ₹${(scheduled / 100).toLocaleString('en-IN')} but the fee is ₹${(grossMinor / 100).toLocaleString('en-IN')}.`,
          details: { installments: 'The schedule must add up to the full fee.' },
        });
      }
    }

    const fee = await this.prisma.studentFee.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: student.branchId,
        studentId: student.id,
        feeStructureId: structure.id,
        currency: structure.currency,
        grossMinor,
        netMinor: grossMinor,
        note: input.note || null,
        installments: {
          create: installments.map((i, seq) => ({
            label: i.label, amountMinor: i.amountMinor, dueDate: new Date(`${i.dueDate}T00:00:00.000Z`), sequence: seq,
          })),
        },
      },
      include: FEE_INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'fee.assign', entityType: 'StudentFee', entityId: fee.id,
      after: { studentId: student.id, feeStructureId: structure.id, grossMinor },
    });

    return { ...fee, outstandingMinor: fee.netMinor - fee.paidMinor };
  }

  /**
   * Spec §61 scholarships and discounts. Append-only: the concession row stays
   * as the record of who reduced this fee and why, and the cached totals are
   * recomputed from the full set rather than nudged.
   */
  async grantConcession(ctx: TenantContext, studentFeeId: string, input: any) {
    const fee = await this.getStudentFee(ctx, studentFeeId);
    if (fee.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'FEE_CANCELLED', message: 'This fee account is cancelled.' });
    }

    const discountMinor = fee.discountMinor + input.amountMinor;
    if (discountMinor > fee.grossMinor) {
      throw new BadRequestException({
        code: 'CONCESSION_EXCEEDS_FEE',
        message: 'That concession is larger than the fee still carries.',
        details: { amountMinor: 'Too large for this fee.' },
      });
    }

    const netMinor = fee.grossMinor - discountMinor;
    // Reducing the fee can settle it outright — a scholarship covering the
    // remainder should leave the account PAID, not permanently PENDING.
    const status = statusFor(netMinor, fee.paidMinor);

    await this.prisma.$transaction([
      this.prisma.feeConcession.create({
        data: {
          studentFeeId,
          kind: input.kind,
          amountMinor: input.amountMinor,
          reason: input.reason,
          grantedById: ctx.userId,
        },
      }),
      this.prisma.studentFee.update({ where: { id: studentFeeId }, data: { discountMinor, netMinor, status } }),
    ]);

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'fee.concession', entityType: 'StudentFee', entityId: studentFeeId,
      before: { discountMinor: fee.discountMinor, netMinor: fee.netMinor },
      after: { discountMinor, netMinor, kind: input.kind },
      reason: input.reason,
    });

    return this.getStudentFee(ctx, studentFeeId);
  }

  /* ── Payments (spec §62) ───────────────────────────────────────────────── */

  async recordPayment(ctx: TenantContext, input: any) {
    const fee = await this.getStudentFee(ctx, input.studentFeeId);
    if (fee.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'FEE_CANCELLED', message: 'This fee account is cancelled and cannot take payment.' });
    }

    const outstanding = fee.netMinor - fee.paidMinor;
    if (outstanding <= 0) {
      throw new BadRequestException({ code: 'ALREADY_SETTLED', message: 'This fee is already fully paid.' });
    }
    // Overpaying a fee account is almost always a typo, and a credit balance is
    // a feature this product does not have — refuse rather than silently hold it.
    if (input.amountMinor > outstanding) {
      throw new BadRequestException({
        code: 'OVERPAYMENT',
        message: `That is more than the ₹${(outstanding / 100).toLocaleString('en-IN')} still outstanding.`,
        details: { amountMinor: 'More than is outstanding.' },
      });
    }

    const paidMinor = fee.paidMinor + input.amountMinor;
    const status = statusFor(fee.netMinor, paidMinor);

    const payment = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const issuedThisYear = await tx.feePayment.count({
        where: { organizationId: ctx.organizationId, createdAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
      });
      const receiptNumber = `RCP-${year}-${String(issuedThisYear + 1).padStart(6, '0')}`;

      const created = await tx.feePayment.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: fee.branchId,
          studentId: fee.studentId,
          studentFeeId: fee.id,
          receiptNumber,
          amountMinor: input.amountMinor,
          currency: fee.currency,
          method: input.method,
          reference: input.reference || null,
          note: input.note || null,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          collectedById: ctx.userId,
        },
        include: { collectedBy: { select: { id: true, name: true } }, student: { select: { id: true, name: true, studentCode: true } } },
      });

      await tx.studentFee.update({ where: { id: fee.id }, data: { paidMinor, status } });
      await this.allocate(tx, fee.id, input.amountMinor);

      return created;
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'fee.payment', entityType: 'FeePayment', entityId: payment.id,
      after: { receiptNumber: payment.receiptNumber, amountMinor: input.amountMinor, studentFeeId: fee.id },
    });

    return payment;
  }

  async listPayments(ctx: TenantContext, query: PaginationQuery & { studentId?: string; from?: string; to?: string }) {
    const where: Prisma.FeePaymentWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { receiptNumber: { contains: query.search.toUpperCase() } },
              { student: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feePayment.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['paidAt', 'amountMinor'] as const, query.sortBy, query.sortDir, 'paidAt'),
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          branch: { select: { id: true, name: true, code: true } },
          collectedBy: { select: { id: true, name: true } },
          studentFee: { select: { id: true, feeStructure: { select: { name: true } } } },
        },
      }),
      this.prisma.feePayment.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  /**
   * Money already received is never deleted — a mistake is corrected by a refund
   * row, which is what a receipt book does on paper (spec §20's rule, applied to
   * the tenant side).
   */
  async refundPayment(ctx: TenantContext, paymentId: string, input: any) {
    const payment = await this.prisma.feePayment.findFirst({
      where: { id: paymentId, organizationId: ctx.organizationId, ...branchScope(ctx) },
    });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That payment does not exist.' });

    const refundable = payment.amountMinor - payment.refundedMinor;
    if (input.amountMinor > refundable) {
      throw new BadRequestException({
        code: 'REFUND_EXCEEDS_PAYMENT',
        message: `Only ₹${(refundable / 100).toLocaleString('en-IN')} of this payment can still be refunded.`,
        details: { amountMinor: 'More than remains on this payment.' },
      });
    }

    const refundedMinor = payment.refundedMinor + input.amountMinor;
    const fee = await this.prisma.studentFee.findUniqueOrThrow({ where: { id: payment.studentFeeId } });
    const paidMinor = fee.paidMinor - input.amountMinor;

    await this.prisma.$transaction(async (tx) => {
      await tx.feeRefund.create({
        data: { feePaymentId: paymentId, amountMinor: input.amountMinor, reason: input.reason, refundedById: ctx.userId },
      });
      await tx.feePayment.update({
        where: { id: paymentId },
        data: { refundedMinor, status: refundedMinor >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await tx.studentFee.update({
        where: { id: fee.id },
        data: { paidMinor, status: fee.status === 'CANCELLED' ? 'CANCELLED' : statusFor(fee.netMinor, paidMinor) },
      });
      // The money is no longer against any installment either.
      await this.deallocate(tx, fee.id, input.amountMinor);
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'fee.refund', entityType: 'FeePayment', entityId: paymentId,
      before: { refundedMinor: payment.refundedMinor }, after: { refundedMinor },
      reason: input.reason,
    });

    return this.getStudentFee(ctx, fee.id);
  }

  /**
   * Spreads a receipt across the schedule oldest-due-first, so a part payment
   * always clears the most overdue money rather than whichever row a caller
   * happened to name. A fee with no schedule simply has nothing to allocate.
   */
  private async allocate(tx: Prisma.TransactionClient, studentFeeId: string, amountMinor: number) {
    const installments = await tx.feeInstallment.findMany({
      where: { studentFeeId, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
      orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
    });

    let left = amountMinor;
    for (const i of installments) {
      if (left <= 0) break;
      const owed = i.amountMinor - i.paidMinor;
      const applied = Math.min(owed, left);
      const paidMinor = i.paidMinor + applied;
      await tx.feeInstallment.update({
        where: { id: i.id },
        data: { paidMinor, status: paidMinor >= i.amountMinor ? 'PAID' : 'PARTIALLY_PAID' },
      });
      left -= applied;
    }
  }

  /** The mirror of `allocate` — a refund unwinds the newest-settled money first. */
  private async deallocate(tx: Prisma.TransactionClient, studentFeeId: string, amountMinor: number) {
    const installments = await tx.feeInstallment.findMany({
      where: { studentFeeId, paidMinor: { gt: 0 } },
      orderBy: [{ dueDate: 'desc' }, { sequence: 'desc' }],
    });

    let left = amountMinor;
    for (const i of installments) {
      if (left <= 0) break;
      const removed = Math.min(i.paidMinor, left);
      const paidMinor = i.paidMinor - removed;
      await tx.feeInstallment.update({
        where: { id: i.id },
        data: { paidMinor, status: paidMinor === 0 ? 'PENDING' : paidMinor >= i.amountMinor ? 'PAID' : 'PARTIALLY_PAID' },
      });
      left -= removed;
    }
  }
}
