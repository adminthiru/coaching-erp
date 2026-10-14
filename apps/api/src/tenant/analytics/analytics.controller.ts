import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { AnalyticsService } from './analytics.service';

/** Spec §55 — performance analytics at student and batch scope; §57 — filterable reports. */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('students/:id')
  student(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.studentPerformance(ctx, id);
  }

  @Get('batches/:id')
  batch(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.batchPerformance(ctx, id);
  }

  @Get('tests')
  tests(
    @Tenant() ctx: TenantContext,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.testPerformance(ctx, { branchId, from, to });
  }

  /** Spec §64 — collections, outstanding, expenses and net contribution. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT')
  @Get('finance')
  finance(
    @Tenant() ctx: TenantContext,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.financeSummary(ctx, { branchId, from, to });
  }
}
