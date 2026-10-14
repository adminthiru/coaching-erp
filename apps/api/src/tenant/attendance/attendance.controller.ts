import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { attendanceRangeSchema, markAttendanceSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Classes in a window, with whether the roll has been taken. */
  @Get('sessions')
  pending(@Tenant() ctx: TenantContext, @Query('from') from: string, @Query('to') to: string) {
    return this.attendance.pending(ctx, from, to);
  }

  /** The roll for one class — roster plus anything already marked. */
  @Get('sessions/:sessionId')
  roster(@Tenant() ctx: TenantContext, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.attendance.roster(ctx, sessionId);
  }

  /** Faculty mark their own classes, so they are permitted here (spec §47). */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post('sessions/:sessionId')
  mark(
    @Tenant() ctx: TenantContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(markAttendanceSchema)) body: any,
  ) {
    return this.attendance.mark(ctx, sessionId, body.entries);
  }

  /** Student / batch / branch / organization rollups in one response. */
  @Get('report')
  report(@Query(new ZodValidationPipe(attendanceRangeSchema)) query: any, @Tenant() ctx: TenantContext) {
    return this.attendance.report(ctx, query);
  }

  @Get('students/:studentId')
  forStudent(
    @Tenant() ctx: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.attendance.forStudent(ctx, studentId, from, to);
  }
}
