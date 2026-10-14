import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  addHostelRoomSchema, allocateHostelSchema, allocateTransportSchema, createHostelSchema,
  createMessPlanSchema, createRouteSchema, createVehicleSchema, endAllocationSchema,
  subscribeMessSchema, vehicleStatusSchema,
} from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { HostelService } from './hostel.service';
import { TransportService } from './transport.service';
import { MessService } from './mess.service';

/** Spec §66 — hostels, rooms and who sleeps in them. */
@Controller('hostels')
export class HostelController {
  constructor(private readonly hostels: HostelService) {}

  @Get()
  list(@Tenant() ctx: TenantContext) {
    return this.hostels.list(ctx);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.hostels.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createHostelSchema)) body: any) {
    return this.hostels.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/rooms')
  addRoom(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(addHostelRoomSchema)) body: any,
  ) {
    return this.hostels.addRoom(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('allocations')
  allocate(@Tenant() ctx: TenantContext, @Body(zodBody(allocateHostelSchema)) body: any) {
    return this.hostels.allocate(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('allocations/:id/end')
  endAllocation(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(endAllocationSchema)) body: any,
  ) {
    return this.hostels.endAllocation(ctx, id, body.reason);
  }

  @Get('students/:studentId')
  forStudent(@Tenant() ctx: TenantContext, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.hostels.forStudent(ctx, studentId);
  }
}

/** Spec §67 — vehicles, routes, stops and riders. */
@Controller('transport')
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Get('vehicles')
  vehicles(@Tenant() ctx: TenantContext) {
    return this.transport.listVehicles(ctx);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('vehicles')
  createVehicle(@Tenant() ctx: TenantContext, @Body(zodBody(createVehicleSchema)) body: any) {
    return this.transport.createVehicle(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('vehicles/:id/status')
  vehicleStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(vehicleStatusSchema)) body: any,
  ) {
    return this.transport.setVehicleStatus(ctx, id, body.status);
  }

  @Get('routes')
  routes(@Tenant() ctx: TenantContext) {
    return this.transport.listRoutes(ctx);
  }

  @Get('routes/:id')
  route(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transport.getRoute(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('routes')
  createRoute(@Tenant() ctx: TenantContext, @Body(zodBody(createRouteSchema)) body: any) {
    return this.transport.createRoute(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('allocations')
  allocate(@Tenant() ctx: TenantContext, @Body(zodBody(allocateTransportSchema)) body: any) {
    return this.transport.allocate(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('allocations/:id/end')
  endAllocation(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(endAllocationSchema)) body: any,
  ) {
    return this.transport.endAllocation(ctx, id, body.reason);
  }

  @Get('students/:studentId')
  forStudent(@Tenant() ctx: TenantContext, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.transport.forStudent(ctx, studentId);
  }
}

/** Spec §68 — mess plans and who is on them. */
@Controller('mess')
export class MessController {
  constructor(private readonly mess: MessService) {}

  @Get('plans')
  plans(@Tenant() ctx: TenantContext) {
    return this.mess.listPlans(ctx);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('plans')
  createPlan(@Tenant() ctx: TenantContext, @Body(zodBody(createMessPlanSchema)) body: any) {
    return this.mess.createPlan(ctx, body);
  }

  @Get('plans/:id/subscribers')
  subscribers(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.mess.subscribers(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('subscriptions')
  subscribe(@Tenant() ctx: TenantContext, @Body(zodBody(subscribeMessSchema)) body: any) {
    return this.mess.subscribe(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('subscriptions/:id/end')
  endSubscription(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(endAllocationSchema)) body: any,
  ) {
    return this.mess.endSubscription(ctx, id, body.reason);
  }

  @Get('students/:studentId')
  forStudent(@Tenant() ctx: TenantContext, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.mess.forStudent(ctx, studentId);
  }
}
