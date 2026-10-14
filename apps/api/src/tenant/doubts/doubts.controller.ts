import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  assignDoubtSchema, createDoubtSchema, doubtStatusSchema, paginationSchema, replyDoubtSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { DoubtsService } from './doubts.service';

/** Spec §59 — doubt routing and resolution. */
@Controller('doubts')
export class DoubtsController {
  constructor(private readonly doubts: DoubtsService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('mine') mine?: string,
  ) {
    return this.doubts.list(ctx, { ...query, status, mine: mine === 'true' });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.doubts.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'COUNSELLOR')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createDoubtSchema)) body: any) {
    return this.doubts.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'COUNSELLOR')
  @Post(':id/assign')
  assign(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assignDoubtSchema)) body: any,
  ) {
    return this.doubts.assign(ctx, id, body.assignedToId);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'COUNSELLOR')
  @Post(':id/reply')
  reply(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(replyDoubtSchema)) body: any,
  ) {
    return this.doubts.reply(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'COUNSELLOR')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(doubtStatusSchema)) body: any,
  ) {
    return this.doubts.setStatus(ctx, id, body.status);
  }
}
