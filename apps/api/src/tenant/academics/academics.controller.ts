import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { upsertAcademicYearSchema, upsertCourseSchema, upsertSubjectSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { AcademicsService } from './academics.service';

/** Courses, subjects and academic years are organization-wide (spec §42). */
@Controller()
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get('courses')
  listCourses(@Tenant() ctx: TenantContext, @Query('includeInactive') includeInactive?: string) {
    return this.academics.listCourses(ctx, includeInactive === 'true');
  }

  @OrgRoles('ORG_ADMIN')
  @Post('courses')
  createCourse(@Tenant() ctx: TenantContext, @Body(zodBody(upsertCourseSchema)) body: any) {
    return this.academics.createCourse(ctx, body);
  }

  @OrgRoles('ORG_ADMIN')
  @Patch('courses/:id')
  updateCourse(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(upsertCourseSchema.partial())) body: any,
  ) {
    return this.academics.updateCourse(ctx, id, body);
  }

  @Get('subjects')
  listSubjects(@Tenant() ctx: TenantContext, @Query('courseId') courseId?: string) {
    return this.academics.listSubjects(ctx, courseId);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('subjects')
  createSubject(@Tenant() ctx: TenantContext, @Body(zodBody(upsertSubjectSchema)) body: any) {
    return this.academics.createSubject(ctx, body);
  }

  @Get('academic-years')
  listYears(@Tenant() ctx: TenantContext) {
    return this.academics.listAcademicYears(ctx);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('academic-years')
  createYear(@Tenant() ctx: TenantContext, @Body(zodBody(upsertAcademicYearSchema)) body: any) {
    return this.academics.createAcademicYear(ctx, body);
  }
}
