import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createStudentSchema, paginationSchema, studentStatusSchema, transferStudentSchema,
  updateStudentSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('batchId') batchId?: string,
    @Query('courseId') courseId?: string,
    @Query('unbatched') unbatched?: string,
  ) {
    return this.students.list(ctx, { ...query, status, batchId, courseId, unbatched: unbatched === 'true' });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createStudentSchema)) body: any) {
    return this.students.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Patch(':id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateStudentSchema)) body: any,
  ) {
    return this.students.update(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(studentStatusSchema)) body: any,
  ) {
    return this.students.changeStatus(ctx, id, body.status, body.reason);
  }

  /** Spec §35 — shown before the transfer is confirmed. */
  @Get(':id/transfer-preview')
  preview(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('toBranchId', ParseUUIDPipe) toBranchId: string,
  ) {
    return this.students.transferPreview(ctx, id, toBranchId);
  }

  @OrgRoles('ORG_ADMIN')
  @Post(':id/transfer')
  transfer(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transferStudentSchema)) body: any,
  ) {
    return this.students.transfer(ctx, id, body.toBranchId, body.toBatchId, body.reason);
  }
}
