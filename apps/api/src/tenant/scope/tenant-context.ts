import { ForbiddenException } from '@nestjs/common';
import type { OrgRole } from '@prisma/client';

/**
 * Everything the server knows about who is asking, resolved from the database on
 * every request. Nothing here is ever taken from the client (spec §76, §86).
 */
export interface TenantContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: OrgRole;
  sessionId: string;
  /** Branch ids this user may touch. `null` means every branch in the organization. */
  accessibleBranchIds: string[] | null;
  /**
   * The branch selected in the switcher. `null` means the all-branch view, which
   * only a cross-branch role can reach.
   */
  activeBranchId: string | null;
  /**
   * Spec §65 — the students a PARENT or STUDENT may see (their children, or
   * themselves). Present only for portal roles; `undefined` for staff, whose
   * reach is decided by branch instead. Every portal query filters on this, so
   * a parent cannot read a student who is not theirs even within the same branch.
   */
  portalStudentIds?: string[];
}

/**
 * The portal equivalent of `branchScope()`: the set of students this caller may
 * read. Throws rather than returning an empty filter, because a bug that left
 * this unset must fail closed, not quietly widen to the whole branch.
 */
export function portalStudentScope(ctx: TenantContext): string[] {
  if (!ctx.portalStudentIds?.length) {
    throw new ForbiddenException({
      code: 'PORTAL_ONLY',
      message: 'This is only available to a parent or student account.',
    });
  }
  return ctx.portalStudentIds;
}

/** Throws unless this portal caller is attached to the student they asked for. */
export function assertPortalStudent(ctx: TenantContext, studentId: string) {
  if (!portalStudentScope(ctx).includes(studentId)) {
    // Same answer as "does not exist" — whether another family's child is
    // enrolled here is not a parent's to learn.
    throw new ForbiddenException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
  }
}

export const isCrossBranch = (ctx: TenantContext) => ctx.accessibleBranchIds === null;

/**
 * The single primitive every branch-scoped query must use.
 *
 * Returns the `branchId` fragment for a Prisma `where`. Centralising it means a
 * new module cannot forget the filter and quietly expose another branch's data —
 * the only way to query without a scope is to not call this.
 */
export function branchScope(ctx: TenantContext): { branchId?: string | { in: string[] } } {
  // A specific branch is selected: pin to it. The guard has already proved access.
  if (ctx.activeBranchId) return { branchId: ctx.activeBranchId };

  // All-branch view for an org-level user: no branch predicate, the
  // organizationId filter alone already contains the query to this tenant.
  if (ctx.accessibleBranchIds === null) return {};

  // Branch-scoped user with no selection: restrict to exactly their branches.
  return { branchId: { in: ctx.accessibleBranchIds } };
}

/** Throws unless the user may act on this specific branch. */
export function assertBranchAccess(ctx: TenantContext, branchId: string) {
  if (ctx.accessibleBranchIds === null) return;
  if (!ctx.accessibleBranchIds.includes(branchId)) {
    throw new ForbiddenException({
      code: 'BRANCH_FORBIDDEN',
      message: 'You do not have access to that branch.',
    });
  }
}

/** Branch ids this user can actually read, for building an IN clause explicitly. */
export function readableBranchIds(ctx: TenantContext, allBranchIds: string[]) {
  if (ctx.accessibleBranchIds === null) return allBranchIds;
  return allBranchIds.filter((id) => ctx.accessibleBranchIds!.includes(id));
}
