import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { upsertFeatureFlagSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('platform/feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  list() {
    return this.flags.list();
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.flags.get(key);
  }

  @Get(':key/resolve')
  async resolve(@Param('key') key: string, @Query('organizationId') organizationId?: string) {
    return { key, enabled: await this.flags.isEnabled(key, organizationId) };
  }

  @Roles('PLATFORM_ADMIN')
  @Post()
  upsert(@Body(zodBody(upsertFeatureFlagSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.flags.upsert(body, user);
  }
}
