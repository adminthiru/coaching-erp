import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { createTicketSchema, paginationSchema, supportNoteSchema, updateTicketSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { SupportService } from './support.service';

@Controller('platform/support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('priority') priority?: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.support.list({ ...query, status, priority, organizationId });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.get(id);
  }

  @Roles('PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  @Post()
  create(@Body(zodBody(createTicketSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.support.create(body, user);
  }

  @Roles('PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateTicketSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.support.update(id, body, user);
  }

  @Roles('PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  @Post(':id/notes')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(supportNoteSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.support.addNote(id, body.body, body.isInternal, user);
  }
}
