import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  assignFeeSchema, createFeeStructureSchema, grantConcessionSchema, paginationSchema,
  recordFeePaymentSchema, refundFeePaymentSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { FeesService } from './fees.service';

/** Spec §61 — fee structures, the templates a student account is built from. */
@Controller('fee-structures')
export class FeeStructuresController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('courseId') courseId?: string,
  ) {
    return this.fees.listStructures(ctx, { ...query, courseId });
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createFeeStructureSchema)) body: any) {
    return this.fees.createStructure(ctx, body);
  }
}

/** Spec §§61–62 — a student's fee account, its concessions and its receipts. */
@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('studentId') studentId?: string,
    @Query('outstanding') outstanding?: string,
  ) {
    return this.fees.listStudentFees(ctx, { ...query, status, studentId, outstanding: outstanding === 'true' });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.fees.getStudentFee(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post('assign')
  assign(@Tenant() ctx: TenantContext, @Body(zodBody(assignFeeSchema)) body: any) {
    return this.fees.assignFee(ctx, body);
  }

  /** Spec §61 — scholarships and discounts both land here. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post(':id/concessions')
  concession(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(grantConcessionSchema)) body: any,
  ) {
    return this.fees.grantConcession(ctx, id, body);
  }
}

/** Spec §62 — money received. Never deleted; corrected by a refund. */
@Controller('fee-payments')
export class FeePaymentsController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('studentId') studentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.fees.listPayments(ctx, { ...query, studentId, from, to });
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post()
  record(@Tenant() ctx: TenantContext, @Body(zodBody(recordFeePaymentSchema)) body: any) {
    return this.fees.recordPayment(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post(':id/refund')
  refund(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(refundFeePaymentSchema)) body: any,
  ) {
    return this.fees.refundPayment(ctx, id, body);
  }
}
