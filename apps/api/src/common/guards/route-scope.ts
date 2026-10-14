import type { FastifyRequest } from 'fastify';

/**
 * The platform console and the tenant ERP authenticate differently and must never
 * share a token. Both guards run globally, so each one claims exactly its own
 * URL prefix and stands aside for the other.
 *
 * Anything outside /api/tenant/ therefore still requires platform auth unless it
 * opts out with @Public() — the default stays closed.
 */
export const TENANT_PREFIX = '/api/tenant';

/**
 * Where a PARENT or STUDENT is allowed to go (spec §65). Confinement is decided
 * here, by URL prefix, rather than per-controller: most staff GET routes carry
 * no `@OrgRoles`, so a portal role that reached them would read every student at
 * their child's branch. A new staff module cannot forget this rule, because it
 * never opts in to begin with.
 */
export const PORTAL_PREFIX = `${TENANT_PREFIX}/portal`;

/** Auth routes a portal user must still reach — sign in, sign out, refresh, identity. */
const PORTAL_ALLOWED = [`${TENANT_PREFIX}/auth/`];

export function isTenantRoute(req: FastifyRequest) {
  const path = requestPath(req);
  return path === TENANT_PREFIX || path.startsWith(`${TENANT_PREFIX}/`);
}

export function isPortalRoute(req: FastifyRequest) {
  const path = requestPath(req);
  if (path === PORTAL_PREFIX || path.startsWith(`${PORTAL_PREFIX}/`)) return true;
  return PORTAL_ALLOWED.some((prefix) => path.startsWith(prefix));
}

function requestPath(req: FastifyRequest) {
  return (req.raw.url ?? req.url ?? '').split('?')[0];
}
