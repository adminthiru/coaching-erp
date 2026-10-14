import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { dateRangeSchema } from '@acadia/validation';
import { DashboardService } from './dashboard.service';

/** Defaults to the trailing 30 days when the client sends no range. */
function toRange(q: { from?: string; to?: string }) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(to.getTime() - 29 * 864e5);
  return { from, to };
}

@Controller('platform/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Query(new ZodValidationPipe(dateRangeSchema)) q: any) {
    return this.dashboard.summary(toRange(q));
  }

  @Get('organization-growth')
  growth(@Query(new ZodValidationPipe(dateRangeSchema)) q: any) {
    return this.dashboard.organizationGrowth(toRange(q));
  }

  @Get('revenue-trend')
  revenue(@Query(new ZodValidationPipe(dateRangeSchema)) q: any) {
    return this.dashboard.revenueTrend(toRange(q));
  }

  @Get('plan-distribution')
  plans() {
    return this.dashboard.planDistribution();
  }

  @Get('status-breakdown')
  statuses() {
    return this.dashboard.statusBreakdown();
  }

  @Get('at-risk')
  atRisk() {
    return this.dashboard.atRiskOrganizations();
  }
}
