import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  assignBranchSchema, createBranchAdminSchema, paginationSchema, transferSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('branchId') branchId?: string,
    @Query('role') role?: any,
  ) {
    return this.staff.list(ctx, { ...query, branchId, role });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.get(ctx, id);
  }

  /** Spec §29 — creating a Branch Admin also creates their branch assignment. */
  @OrgRoles('ORG_ADMIN')
  @Post('branch-admins')
  createBranchAdmin(@Tenant() ctx: TenantContext, @Body(zodBody(createBranchAdminSchema)) body: any) {
    return this.staff.createBranchAdmin(ctx, body);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('assign-branch')
  assign(@Tenant() ctx: TenantContext, @Body(zodBody(assignBranchSchema)) body: any) {
    return this.staff.assignToBranch(ctx, body.userId, body.branchId, body.isPrimary);
  }

  /** Spec §35 — branch transfer, with history. */
  @OrgRoles('ORG_ADMIN')
  @Post('transfer')
  transfer(@Tenant() ctx: TenantContext, @Body(zodBody(transferSchema)) body: any) {
    return this.staff.transfer(ctx, body.entityId, body.toBranchId, body.reason);
  }

  @OrgRoles('ORG_ADMIN')
  @Post(':id/activate')
  activate(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setActive(ctx, id, true);
  }

  @OrgRoles('ORG_ADMIN')
  @Post(':id/deactivate')
  deactivate(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setActive(ctx, id, false);
  }
}
