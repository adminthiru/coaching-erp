import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import {
  changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema,
} from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { AuthService, type RequestMeta } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { AccessClaims } from './token.service';
import { z } from 'zod';

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

const meta = (req: FastifyRequest): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('platform/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Brute-force ceiling on the one endpoint that accepts a password. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body(zodBody(loginSchema)) body: any, @Req() req: FastifyRequest) {
    return this.auth.login(body, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zodBody(refreshSchema)) body: { refreshToken: string }, @Req() req: FastifyRequest) {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AccessClaims, @Req() req: FastifyRequest) {
    await this.auth.logout(user.sid, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body(zodBody(forgotPasswordSchema)) body: { email: string }, @Req() req: FastifyRequest) {
    return this.auth.forgotPassword(body.email, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body(zodBody(resetPasswordSchema)) body: any, @Req() req: FastifyRequest) {
    await this.auth.resetPassword(body.token, body.password, meta(req));
  }

  @Post('change-password')
  @HttpCode(204)
  async change(
    @CurrentUser() user: AccessClaims,
    @Body(zodBody(changePasswordSchema)) body: any,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.changePassword(user.sub, body.currentPassword, body.password, user.sid, meta(req));
  }

  @Get('me')
  me(@CurrentUser() user: AccessClaims) {
    return { id: user.sub, email: user.email, role: user.role, sessionId: user.sid };
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AccessClaims) {
    return this.auth.listSessions(user.sub, user.sid);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AccessClaims, @Param('id') id: string) {
    await this.auth.revokeSession(user.sub, id);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOthers(@CurrentUser() user: AccessClaims) {
    return this.auth.revokeAllOtherSessions(user.sub, user.sid);
  }
}
