import { Controller, Get } from '@nestjs/common';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { TenantDashboardService } from './tenant-dashboard.service';

@Controller('dashboard')
export class TenantDashboardController {
  constructor(private readonly dashboard: TenantDashboardService) {}

  @Get('summary')
  summary(@Tenant() ctx: TenantContext) {
    return this.dashboard.summary(ctx);
  }

  /** Spec §56 — cross-branch comparison is an organization-level view. */
  @OrgRoles('ORG_ADMIN')
  @Get('branch-comparison')
  comparison(@Tenant() ctx: TenantContext) {
    return this.dashboard.branchComparison(ctx);
  }
}
