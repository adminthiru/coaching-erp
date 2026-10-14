import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  branchStatusSchema, createBranchSchema, paginationSchema, updateBranchSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
  ) {
    return this.branches.list(ctx, { ...query, status });
  }

  /** Feeds the branch switcher — spec §32. */
  @Get('switchable')
  switchable(@Tenant() ctx: TenantContext) {
    return this.branches.switchable(ctx);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.get(ctx, id);
  }

  /** Only organization-level roles may open a branch (spec §31). */
  @OrgRoles('ORG_ADMIN')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createBranchSchema)) body: any) {
    return this.branches.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Patch(':id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateBranchSchema)) body: any,
  ) {
    return this.branches.update(ctx, id, body);
  }

  /** Spec §§36, 82 — what closing this branch would strand. */
  @Get(':id/closure-impact')
  closureImpact(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.closureImpact(ctx, id);
  }

  @OrgRoles('ORG_ADMIN')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(branchStatusSchema)) body: any,
  ) {
    return this.branches.changeStatus(ctx, id, body.status, body.reason);
  }

  @Get(':id/transfers')
  transfers(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.transferHistory(ctx, id);
  }
}
