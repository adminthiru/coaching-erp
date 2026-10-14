import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createLeaveSchema, paginationSchema, reviewLeaveSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { LeaveService } from './leave.service';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('subjectType') subjectType?: any,
  ) {
    return this.leave.list(ctx, { ...query, status, subjectType });
  }

  @Get('pending-count')
  pendingCount(@Tenant() ctx: TenantContext) {
    return this.leave.pendingCount(ctx).then((count) => ({ count }));
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR', 'FACULTY')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createLeaveSchema)) body: any) {
    return this.leave.create(ctx, body);
  }

  /** Spec §48 — a Branch Admin approves their own branch's requests. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/review')
  review(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reviewLeaveSchema)) body: any,
  ) {
    return this.leave.review(ctx, id, body.status, body.reviewNote);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR', 'FACULTY')
  @Post(':id/cancel')
  cancel(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(ctx, id);
  }
}
