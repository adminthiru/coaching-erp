import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createTimetableSlotSchema, generateSessionsSchema, updateSessionSchema,
  updateTimetableSlotSchema, upsertRoomSchema,
} from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { TimetableService } from './timetable.service';

@Controller()
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  /* Rooms — needed before a slot can name one (spec §46). */

  @Get('rooms')
  listRooms(@Tenant() ctx: TenantContext) {
    return this.timetable.listRooms(ctx);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('rooms')
  createRoom(@Tenant() ctx: TenantContext, @Body(zodBody(upsertRoomSchema)) body: any) {
    return this.timetable.createRoom(ctx, body);
  }

  /* Weekly grid */

  @Get('timetable/slots')
  listSlots(
    @Tenant() ctx: TenantContext,
    @Query('batchId') batchId?: string,
    @Query('facultyId') facultyId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.timetable.listSlots(ctx, { batchId, facultyId, roomId });
  }

  /** Dry run — the UI calls this before offering to save. */
  @Post('timetable/slots/check')
  check(@Tenant() ctx: TenantContext, @Body(zodBody(createTimetableSlotSchema)) body: any) {
    return this.timetable.checkSlot(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('timetable/slots')
  createSlot(@Tenant() ctx: TenantContext, @Body(zodBody(createTimetableSlotSchema)) body: any) {
    return this.timetable.createSlot(ctx, body);
  }

  @Get('timetable/slots/:id')
  getSlot(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.timetable.getSlot(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Patch('timetable/slots/:id')
  updateSlot(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateTimetableSlotSchema)) body: any,
  ) {
    return this.timetable.updateSlot(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Delete('timetable/slots/:id')
  removeSlot(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.timetable.removeSlot(ctx, id);
  }

  /* Dated sessions */

  @Get('timetable/sessions')
  listSessions(
    @Tenant() ctx: TenantContext,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('batchId') batchId?: string,
    @Query('facultyId') facultyId?: string,
  ) {
    return this.timetable.listSessions(ctx, { from, to, batchId, facultyId });
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('timetable/sessions/generate')
  generate(@Tenant() ctx: TenantContext, @Body(zodBody(generateSessionsSchema)) body: any) {
    return this.timetable.generateSessions(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Patch('timetable/sessions/:id')
  updateSession(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSessionSchema)) body: any,
  ) {
    return this.timetable.updateSession(ctx, id, body);
  }
}
