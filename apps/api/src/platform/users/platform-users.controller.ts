import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { createPlatformUserSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { PlatformUsersService } from './platform-users.service';

const roleSchema = z.object({
  role: z.enum(['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN', 'READONLY_ADMIN']),
});

@Roles('PLATFORM_ADMIN')
@Controller('platform/users')
export class PlatformUsersController {
  constructor(private readonly users: PlatformUsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body(zodBody(createPlatformUserSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.users.create(body, user);
  }

  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.users.setActive(id, true, user);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.users.setActive(id, false, user);
  }

  @Post(':id/role')
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(roleSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.users.changeRole(id, body.role, user);
  }
}
