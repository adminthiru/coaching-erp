import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createOrganizationSchema, extendTrialSchema, featureAccessSchema, organizationStatusSchema,
  overrideLimitsSchema, paginationSchema, updateOrganizationSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { OrganizationsService } from './organizations.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { AuditService } from '../audit/audit.service';

@Controller('platform/organizations')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationSchema)) query: any, @Query('status') status?: any, @Query('planId') planId?: string) {
    return this.orgs.list({ ...query, status, planId });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.get(id);
  }

  @Roles('PLATFORM_ADMIN')
  @Post()
  create(@Body(zodBody(createOrganizationSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.orgs.create(body, user);
  }

  @Roles('PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateOrganizationSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.orgs.update(id, body, user);
  }

  /** Suspend / reactivate / cancel / archive all funnel through one guarded route. */
  @Roles('PLATFORM_ADMIN')
  @Post(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(organizationStatusSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.orgs.changeStatus(id, body.status, body.reason, user);
  }

  @Roles('PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  @Post(':id/extend-trial')
  extendTrial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(extendTrialSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.orgs.extendTrial(id, body.days, body.reason, user);
  }

  @Roles('PLATFORM_ADMIN')
  @Post(':id/limits')
  overrideLimits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(overrideLimitsSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.orgs.overrideLimits(id, body.limits, body.reason, user);
  }

  @Roles('PLATFORM_ADMIN')
  @Post(':id/features')
  setFeatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(featureAccessSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.orgs.setFeatureAccess(id, body.features, body.reason, user);
  }

  @Get(':id/usage')
  usage(@Param('id', ParseUUIDPipe) id: string) {
    return this.entitlements.usageReport(id);
  }

  @Roles('PLATFORM_ADMIN')
  @Post(':id/usage/recalculate')
  recalculate(@Param('id', ParseUUIDPipe) id: string) {
    return this.entitlements.recalculate(id);
  }

  @Get(':id/branches')
  branches(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.branches(id);
  }

  @Get(':id/trial-history')
  trialHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.trialHistory(id);
  }

  @Get(':id/audit-logs')
  auditLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
  ) {
    return this.audit.list({ ...query, organizationId: id });
  }
}
