import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { isoDateSchema, minorAmountSchema, paginationSchema, recordPaymentSchema, refundPaymentSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { BillingService } from './billing.service';

const issueInvoiceSchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  subtotalMinor: minorAmountSchema,
  discountMinor: minorAmountSchema.optional(),
  taxMinor: minorAmountSchema.optional(),
  dueInDays: z.number().int().min(0).max(120).optional(),
  notes: z.string().trim().max(400).optional(),
}).refine((v) => v.periodStart <= v.periodEnd, {
  message: 'The period start must fall on or before the period end',
  path: ['periodEnd'],
});

const voidSchema = z.object({ reason: z.string().trim().min(4).max(400) });

@Controller('platform')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  listInvoices(
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.billing.listInvoices({ ...query, status, organizationId });
  }

  @Get('invoices/:id')
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getInvoice(id);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('organizations/:id/invoices')
  issue(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body(zodBody(issueInvoiceSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.billing.issueInvoice(
      organizationId,
      {
        ...body,
        periodStart: new Date(`${body.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${body.periodEnd}T23:59:59.999Z`),
      },
      user,
    );
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('invoices/:id/void')
  voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(voidSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.billing.voidInvoice(id, body.reason, user);
  }

  @Get('payments')
  listPayments(
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.billing.listPayments({ ...query, status, organizationId });
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('payments')
  record(@Body(zodBody(recordPaymentSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.billing.recordPayment(body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('payments/:id/refund')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(refundPaymentSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.billing.refund(id, body.amountMinor, body.reason, user);
  }
}
