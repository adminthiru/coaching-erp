import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';
import type { AccessClaims } from '../auth/token.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── Invoices ─────────────────────────────────────────────────────────── */

  async listInvoices(query: PaginationQuery & { status?: any; organizationId?: string }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { organization: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'dueAt', 'totalMinor', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true, email: true, addressLine: true, city: true, state: true, pincode: true } },
        plan: { select: { id: true, name: true } },
        payments: { orderBy: { createdAt: 'desc' }, include: { refunds: true } },
      },
    });
    if (!invoice) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That invoice does not exist.' });
    return invoice;
  }

  /**
   * Invoice numbers are allocated inside the transaction that creates the row,
   * from a count scoped to the current year: ACD-2026-000123.
   */
  async issueInvoice(
    organizationId: string,
    input: { subscriptionId?: string; periodStart: Date; periodEnd: Date; subtotalMinor: number; discountMinor?: number; taxMinor?: number; dueInDays?: number; notes?: string },
    actor: AccessClaims,
  ) {
    const sub = input.subscriptionId
      ? await this.prisma.subscription.findUnique({ where: { id: input.subscriptionId }, include: { plan: true } })
      : await this.prisma.subscription.findFirst({
          where: { organizationId, status: { notIn: ['CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        });

    const discountMinor = input.discountMinor ?? 0;
    const taxMinor = input.taxMinor ?? 0;
    const totalMinor = input.subtotalMinor - discountMinor + taxMinor;
    if (totalMinor < 0) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'The discount exceeds the invoice subtotal.' });
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const issuedThisYear = await tx.invoice.count({
        where: { createdAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
      });
      const number = `ACD-${year}-${String(issuedThisYear + 1).padStart(6, '0')}`;

      return tx.invoice.create({
        data: {
          number,
          organizationId,
          subscriptionId: sub?.id ?? null,
          planId: sub?.planId ?? null,
          billingCycle: sub?.billingCycle ?? 'MONTHLY',
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          currency: sub?.plan.currency ?? 'INR',
          subtotalMinor: input.subtotalMinor,
          discountMinor,
          taxMinor,
          totalMinor,
          status: 'OPEN',
          issuedAt: new Date(),
          dueAt: new Date(Date.now() + (input.dueInDays ?? 14) * 864e5),
          notes: input.notes ?? null,
        },
      });
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId,
      action: 'invoice.issue',
      entityType: 'Invoice',
      entityId: invoice.id,
      after: { number: invoice.number, totalMinor },
    });

    return this.getInvoice(invoice.id);
  }

  /** Spec §20: never delete financial history — an unwanted invoice is voided. */
  async voidInvoice(id: string, reason: string, actor: AccessClaims) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That invoice does not exist.' });
    if (invoice.amountPaidMinor > 0) {
      throw new BadRequestException({
        code: 'INVOICE_PAID',
        message: 'This invoice has payments against it. Refund them before voiding.',
      });
    }
    if (invoice.status === 'VOID') {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'That invoice is already void.' });
    }

    await this.prisma.invoice.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date(), notes: reason } });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: invoice.organizationId,
      action: 'invoice.void',
      entityType: 'Invoice',
      entityId: id,
      reason,
    });

    return this.getInvoice(id);
  }

  /* ── Payments ─────────────────────────────────────────────────────────── */

  async listPayments(query: PaginationQuery & { status?: any; organizationId?: string }) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { organization: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'paidAt', 'amountMinor', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          invoice: { select: { id: true, number: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  /**
   * Records a payment and re-derives the invoice status from the resulting total,
   * inside one transaction — the invoice can never disagree with its payments.
   */
  async recordPayment(
    input: { invoiceId: string; amountMinor: number; method: any; reference?: string; paidAt?: string; note?: string },
    actor: AccessClaims,
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That invoice does not exist.' });
    if (invoice.status === 'VOID') {
      throw new BadRequestException({ code: 'INVOICE_VOID', message: 'A void invoice cannot take payments.' });
    }

    const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
    if (input.amountMinor > outstanding) {
      throw new BadRequestException({
        code: 'OVERPAYMENT',
        message: `That exceeds the ${(outstanding / 100).toFixed(2)} still outstanding on this invoice.`,
        details: { outstandingMinor: outstanding },
      });
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          amountMinor: input.amountMinor,
          currency: invoice.currency,
          method: input.method,
          status: 'SUCCEEDED',
          reference: input.reference || null,
          note: input.note || null,
          paidAt,
        },
      });

      const paid = invoice.amountPaidMinor + input.amountMinor;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaidMinor: paid,
          status: paid >= invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID',
          paidAt: paid >= invoice.totalMinor ? paidAt : null,
        },
      });

      // A settled invoice clears a payment-due organization.
      if (paid >= invoice.totalMinor) {
        await tx.organization.updateMany({
          where: { id: invoice.organizationId, status: 'PAYMENT_DUE' },
          data: { status: 'ACTIVE' },
        });
        if (invoice.subscriptionId) {
          await tx.subscription.updateMany({
            where: { id: invoice.subscriptionId, status: { in: ['PAYMENT_DUE', 'PAST_DUE'] } },
            data: { status: 'ACTIVE' },
          });
        }
      }

      return created;
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: invoice.organizationId,
      action: 'payment.record',
      entityType: 'Payment',
      entityId: payment.id,
      after: { amountMinor: input.amountMinor, method: input.method, invoice: invoice.number },
    });

    return this.getInvoice(invoice.id);
  }

  /** Refunds are additive records; the original payment row is never rewritten away. */
  async refund(paymentId: string, amountMinor: number, reason: string, actor: AccessClaims) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That payment does not exist.' });
    if (payment.status === 'FAILED' || payment.status === 'PENDING') {
      throw new BadRequestException({ code: 'NOT_REFUNDABLE', message: 'Only a successful payment can be refunded.' });
    }

    const refundable = payment.amountMinor - payment.refundedMinor;
    if (amountMinor > refundable) {
      throw new BadRequestException({
        code: 'REFUND_TOO_LARGE',
        message: `Only ${(refundable / 100).toFixed(2)} of this payment can still be refunded.`,
        details: { refundableMinor: refundable },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const refunded = payment.refundedMinor + amountMinor;
      await tx.refund.create({
        data: { paymentId, amountMinor, reason, actorId: actor.sub, actorEmail: actor.email },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedMinor: refunded,
          status: refunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      if (payment.invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
        const paid = Math.max(0, invoice.amountPaidMinor - amountMinor);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaidMinor: paid,
            status: paid === 0 ? 'REFUNDED' : paid >= invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID',
            paidAt: paid >= invoice.totalMinor ? invoice.paidAt : null,
          },
        });
      }
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: payment.organizationId,
      action: 'payment.refund',
      entityType: 'Payment',
      entityId: paymentId,
      after: { amountMinor },
      reason,
    });

    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
  }
}
