import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  acceptInvitationSchema, forgotPasswordSchema, resetPasswordSchema, switchBranchSchema,
  tenantLoginSchema,
} from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthService, type RequestMeta } from './tenant-auth.service';
import { Tenant, TenantPublic } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../scope/tenant-context';

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

const meta = (req: FastifyRequest): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('auth')
export class TenantAuthController {
  constructor(
    private readonly auth: TenantAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @TenantPublic()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body(zodBody(tenantLoginSchema)) body: any, @Req() req: FastifyRequest) {
    return this.auth.login(body.email, body.password, meta(req));
  }

  @TenantPublic()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zodBody(refreshSchema)) body: any, @Req() req: FastifyRequest) {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Tenant() ctx: TenantContext) {
    await this.auth.logout(ctx.sessionId);
  }

  @TenantPublic()
  @Get('invitation')
  inspect(@Query('token') token: string) {
    return this.auth.inspectInvitation(token);
  }

  @TenantPublic()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept-invitation')
  @HttpCode(200)
  accept(@Body(zodBody(acceptInvitationSchema)) body: any, @Req() req: FastifyRequest) {
    return this.auth.acceptInvitation(body.token, body.password, meta(req));
  }

  @TenantPublic()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body(zodBody(forgotPasswordSchema)) body: any) {
    return this.auth.forgotPassword(body.email);
  }

  @TenantPublic()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body(zodBody(resetPasswordSchema)) body: any) {
    await this.auth.resetPassword(body.token, body.password);
  }

  /** The whole session as the server sees it — identity plus resolved branch scope. */
  @Get('me')
  async me(@Tenant() ctx: TenantContext) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true, status: true, logoUrl: true, trialEndsAt: true },
    });

    return {
      user: { id: ctx.userId, name: ctx.name, email: ctx.email, role: ctx.role },
      organization: org,
      scope: {
        activeBranchId: ctx.activeBranchId,
        accessibleBranchIds: ctx.accessibleBranchIds,
        canSelectAllBranches: ctx.accessibleBranchIds === null,
      },
    };
  }

  /**
   * Spec §76 — the branch switcher. The guard has already validated the header
   * against the user's assignments; this only persists the choice on the session.
   */
  @Post('switch-branch')
  @HttpCode(200)
  async switchBranch(@Tenant() ctx: TenantContext, @Body(zodBody(switchBranchSchema)) body: any) {
    if (body.branchId) {
      assertBranchAccess(ctx, body.branchId);
      const exists = await this.prisma.branch.findFirst({
        where: { id: body.branchId, organizationId: ctx.organizationId, status: { not: 'ARCHIVED' } },
        select: { id: true },
      });
      if (!exists) {
        return { activeBranchId: ctx.activeBranchId, changed: false };
      }
    } else if (ctx.accessibleBranchIds !== null) {
      // Only a cross-branch role may sit on the all-branch view.
      assertBranchAccess(ctx, '__all__');
    }

    await this.auth.setActiveBranch(ctx.sessionId, body.branchId);
    return { activeBranchId: body.branchId, changed: true };
  }
}
