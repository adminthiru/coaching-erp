import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { InsightsService } from './insights.service';

/**
 * Spec §§69–71 — advisory insights.
 *
 * Findings are computed from the database; only the written summary comes from
 * Claude, and it is optional (see NarrationService).
 */
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Get('students/:id')
  student(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.insights.student(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Get('batches/:id')
  batch(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.insights.batch(ctx, id);
  }

  /** Spec §71 — cross-branch comparison is an organization-level view (§56). */
  @OrgRoles('ORG_ADMIN')
  @Get('organization')
  organization(@Tenant() ctx: TenantContext) {
    return this.insights.organization(ctx);
  }
}
