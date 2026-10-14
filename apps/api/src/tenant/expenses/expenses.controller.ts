import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createExpenseSchema, expenseStatusSchema, paginationSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { ExpensesService } from './expenses.service';

/** Spec §63 — branch and organization expenses. */
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('category') category?: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expenses.list(ctx, { ...query, status, category, from, to });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createExpenseSchema)) body: any) {
    return this.expenses.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(expenseStatusSchema)) body: any,
  ) {
    return this.expenses.changeStatus(ctx, id, body.status, body.reason);
  }
}
