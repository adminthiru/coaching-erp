import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  convertEnquirySchema, createEnquirySchema, enquiryActivitySchema, moveEnquiryStageSchema,
  paginationSchema, updateEnquirySchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { AdmissionsService } from './admissions.service';

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  /** Stage counts for the pipeline board. */
  @Get('pipeline')
  pipeline(@Tenant() ctx: TenantContext) {
    return this.admissions.pipeline(ctx);
  }

  @Get('enquiries')
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('stage') stage?: any,
    @Query('assignedToId') assignedToId?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.admissions.list(ctx, { ...query, stage, assignedToId, overdue: overdue === 'true' });
  }

  @Get('enquiries/:id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.admissions.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post('enquiries')
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createEnquirySchema)) body: any) {
    return this.admissions.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Patch('enquiries/:id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateEnquirySchema)) body: any,
  ) {
    return this.admissions.update(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post('enquiries/:id/stage')
  moveStage(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(moveEnquiryStageSchema)) body: any,
  ) {
    return this.admissions.moveStage(ctx, id, body.stage, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post('enquiries/:id/activities')
  addActivity(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(enquiryActivitySchema)) body: any,
  ) {
    return this.admissions.addActivity(ctx, id, body);
  }

  /** Spec §38 — the conversion that turns an enquiry into a student. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post('enquiries/:id/convert')
  convert(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(convertEnquirySchema)) body: any,
  ) {
    return this.admissions.convert(ctx, id, body);
  }
}
