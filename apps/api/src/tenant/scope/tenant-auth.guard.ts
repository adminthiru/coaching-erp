import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantTokenService } from '../auth/tenant-token.service';
import { IS_TENANT_PUBLIC_KEY, TENANT_ROLES_KEY } from './tenant.decorators';
import type { TenantContext } from './tenant-context';
import type { OrgRole } from '@prisma/client';
import { isPortalRoute, isTenantRoute } from '../../common/guards/route-scope';

/** Roles that may see across every branch in their organization (spec §31). */
const CROSS_BRANCH: OrgRole[] = ['ORG_OWNER', 'ORG_ADMIN'];

/**
 * Spec §65. These roles are not staff: their scope comes from the students they
 * are attached to, not from a branch assignment, and they may only reach the
 * portal.
 */
const PORTAL_ROLES: OrgRole[] = ['PARENT', 'STUDENT'];

/** Organization states in which the tenant may still sign in and work. */
const USABLE_ORG_STATUSES = ['TRIAL', 'ACTIVE', 'PAYMENT_DUE'];

/**
 * Resolves and enforces tenant identity and branch scope.
 *
 * The chain the spec demands (§73): user → organization → branch → role →
 * permission → resource. Each link is re-checked here against the database on
 * every request, so a stale token, a revoked session, a suspended organization
 * or a withdrawn branch assignment all take effect immediately.
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TenantTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { tenant?: TenantContext }>();
    // Platform routes are JwtAuthGuard's to enforce.
    if (!isTenantRoute(req)) return true;

    if (this.reflector.getAllAndOverride<boolean>(IS_TENANT_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    }

    let claims;
    try {
      claims = await this.tokens.verifyAccess(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Your session has expired.' });
    }

    const session = await this.prisma.orgSession.findFirst({
      where: { id: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
      include: {
        user: {
          include: {
            organization: { select: { id: true, status: true } },
            branches: {
              where: { endedAt: null },
              select: { branchId: true, isPrimary: true },
            },
          },
        },
      },
    });

    if (!session || !session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Your session has ended.' });
    }

    const org = session.user.organization;
    if (!USABLE_ORG_STATUSES.includes(org.status)) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_INACTIVE',
        message:
          org.status === 'SUSPENDED'
            ? 'This organization is suspended. Contact support.'
            : 'This organization is no longer active.',
        details: { status: org.status },
      });
    }

    const role = session.user.role;

    // Spec §65 — a parent or student is confined to the portal. Enforced here by
    // URL prefix rather than per-controller, because most staff read routes carry
    // no role decorator and would otherwise be reachable.
    if (PORTAL_ROLES.includes(role)) {
      if (!isPortalRoute(req)) {
        throw new ForbiddenException({
          code: 'PORTAL_ONLY',
          message: 'Your account can only use the parent and student portal.',
        });
      }
      const subjects = await this.portalSubjects(session.user.id, role, org.id);
      if (!subjects.length) {
        throw new ForbiddenException({
          code: 'NO_STUDENT_LINKED',
          message: 'Your account is not linked to a student yet. Contact your branch office.',
        });
      }

      req.tenant = {
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
        organizationId: org.id,
        role,
        sessionId: session.id,
        // Scope is the branches their children actually attend — the spec's own
        // example has siblings at different branches, so this is a list, not one.
        accessibleBranchIds: [...new Set(subjects.map((s) => s.branchId))],
        activeBranchId: null,
        portalStudentIds: subjects.map((s) => s.id),
      };
      this.assertRole(ctx, role);
      return true;
    }

    const crossBranch = CROSS_BRANCH.includes(role);
    const assigned = session.user.branches.map((b) => b.branchId);

    // A branch-scoped user with no assignment can reach nothing. Spec §29: a
    // Branch Admin must not exist without a branch.
    if (!crossBranch && assigned.length === 0) {
      throw new ForbiddenException({
        code: 'NO_BRANCH_ASSIGNED',
        message: 'Your account is not assigned to a branch yet. Contact your organization admin.',
      });
    }

    const accessibleBranchIds = crossBranch ? null : assigned;
    const activeBranchId = await this.resolveActiveBranch(req, session, accessibleBranchIds, org.id, crossBranch);

    const tenant: TenantContext = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      organizationId: org.id,
      role,
      sessionId: session.id,
      accessibleBranchIds,
      activeBranchId,
    };

    this.assertRole(ctx, role);
    req.tenant = tenant;
    return true;
  }

  /**
   * The students a portal user may see: their children for a PARENT, themselves
   * for a STUDENT. Resolved from the database on every request, so revoking a
   * guardian link takes effect immediately rather than at token expiry.
   */
  private async portalSubjects(userId: string, role: OrgRole, organizationId: string) {
    if (role === 'STUDENT') {
      const self = await this.prisma.student.findFirst({
        where: { portalUserId: userId, organizationId, deletedAt: null },
        select: { id: true, branchId: true },
      });
      return self ? [self] : [];
    }

    const links = await this.prisma.guardian.findMany({
      where: { userId, organizationId, student: { deletedAt: null } },
      select: { student: { select: { id: true, branchId: true } } },
    });
    return links.map((l) => l.student);
  }

  /**
   * Branch selection precedence: an explicit `x-branch-id` header (the switcher),
   * then whatever the session last stored, then a sensible default.
   *
   * The header is *validated*, never trusted — this is the exact route spec §86
   * says a Branch Admin must not be able to escape through.
   */
  private async resolveActiveBranch(
    req: FastifyRequest,
    session: { activeBranchId: string | null; user: { branches: { branchId: string; isPrimary: boolean }[] } },
    accessible: string[] | null,
    organizationId: string,
    crossBranch: boolean,
  ): Promise<string | null> {
    const raw = req.headers['x-branch-id'];
    const requested = Array.isArray(raw) ? raw[0] : raw;

    if (requested && requested !== 'all') {
      const belongs = await this.prisma.branch.findFirst({
        where: { id: requested, organizationId },
        select: { id: true },
      });
      // Same answer whether the branch belongs to another tenant or is merely
      // out of reach — the response must not reveal that it exists.
      if (!belongs || (accessible !== null && !accessible.includes(requested))) {
        throw new ForbiddenException({
          code: 'BRANCH_FORBIDDEN',
          message: 'You do not have access to that branch.',
        });
      }
      return requested;
    }

    // "All branches" is only meaningful for a cross-branch role.
    if (requested === 'all') {
      if (!crossBranch) {
        throw new ForbiddenException({
          code: 'BRANCH_FORBIDDEN',
          message: 'You can only work within your assigned branch.',
        });
      }
      return null;
    }

    if (session.activeBranchId && (accessible === null || accessible.includes(session.activeBranchId))) {
      return session.activeBranchId;
    }

    if (crossBranch) return null;
    const primary = session.user.branches.find((b) => b.isPrimary) ?? session.user.branches[0];
    return primary?.branchId ?? null;
  }

  private assertRole(ctx: ExecutionContext, role: OrgRole) {
    const required = this.reflector.getAllAndOverride<OrgRole[]>(TENANT_ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return;
    if (role === 'ORG_OWNER' || required.includes(role)) return;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Your role does not permit this action.',
    });
  }
}
