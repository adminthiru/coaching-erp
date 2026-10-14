import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  assignBatchFacultySchema, batchStatusSchema, createBatchSchema, enrolStudentsSchema,
  paginationSchema, updateBatchSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { BatchesService } from './batches.service';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('courseId') courseId?: string,
  ) {
    return this.batches.list(ctx, { ...query, status, courseId });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createBatchSchema)) body: any) {
    return this.batches.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Patch(':id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateBatchSchema)) body: any,
  ) {
    return this.batches.update(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(batchStatusSchema)) body: any,
  ) {
    return this.batches.changeStatus(ctx, id, body.status, body.reason);
  }

  @Get(':id/students')
  students(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
  ) {
    return this.batches.listStudents(ctx, id, query);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/students')
  enrol(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(enrolStudentsSchema)) body: any,
  ) {
    return this.batches.enrol(ctx, id, body.studentIds);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Delete(':id/students/:studentId')
  release(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.batches.release(ctx, id, studentId);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/faculty')
  assignFaculty(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assignBatchFacultySchema)) body: any,
  ) {
    return this.batches.assignFaculty(ctx, id, body.facultyId, body.subjectId, body.isClassTeacher);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Delete(':id/faculty/:assignmentId')
  unassignFaculty(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.batches.unassignFaculty(ctx, id, assignmentId);
  }
}
