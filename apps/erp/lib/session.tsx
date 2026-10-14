'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  api, branchSelection, logout as apiLogout, tokens,
  type Organization, type Scope, type SessionUser,
} from './api';

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  city: string;
  status: string;
}

interface SessionState {
  user: SessionUser | null;
  organization: Organization | null;
  scope: Scope | null;
  branches: BranchOption[];
  /** The branch in view; `null` is the all-branch view. */
  activeBranch: BranchOption | null;
  /** Spec §65 — a parent or student, who belongs in the portal, not the ERP. */
  isPortalUser: boolean;
  status: 'loading' | 'authenticated' | 'anonymous';
  switchBranch: (branchId: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

/** Roles confined to the portal — the API enforces this too (`PORTAL_ONLY`). */
const PORTAL_ROLES = ['PARENT', 'STUDENT'];

const SessionContext = React.createContext<SessionState | null>(null);

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Holds identity and branch scope for the whole ERP.
 *
 * The server is the authority on both: `/auth/me` returns the scope it resolved,
 * and the switcher's options come from `/branches/switchable` — never from a
 * client-side filter over a full branch list.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [organization, setOrganization] = React.useState<Organization | null>(null);
  const [scope, setScope] = React.useState<Scope | null>(null);
  const [branches, setBranches] = React.useState<BranchOption[]>([]);
  const [status, setStatus] = React.useState<SessionState['status']>('loading');

  const router = useRouter();
  const pathname = usePathname();

  const load = React.useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      setStatus('anonymous');
      return;
    }
    try {
      const me = await api<{ user: SessionUser; organization: Organization; scope: Scope }>('/auth/me');
      setUser(me.user);
      setOrganization(me.organization);
      setScope(me.scope);

      // A portal user cannot reach `/branches/switchable` — it is a staff route,
      // and asking would 403 and log them straight back out. They have no branch
      // switcher either: their scope is their children, not a branch.
      if (PORTAL_ROLES.includes(me.user.role)) {
        setBranches([]);
        branchSelection.set(null);
        setStatus('authenticated');
        return;
      }

      const switchable = await api<{ branches: BranchOption[]; activeBranchId: string | null }>(
        '/branches/switchable',
      );
      setBranches(switchable.branches);

      // Keep the stored selection aligned with what the server actually resolved.
      branchSelection.set(me.scope.activeBranchId ?? (me.scope.canSelectAllBranches ? 'all' : null));
      setStatus('authenticated');
    } catch {
      tokens.clear();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const switchBranch = React.useCallback(async (branchId: string | null) => {
    // Send the header with the request so the server validates the target before
    // it is persisted — an unauthorised pick fails here, not silently later.
    branchSelection.set(branchId ?? 'all');
    try {
      await api('/auth/switch-branch', { method: 'POST', body: { branchId } });
      await load();
      router.refresh();
    } catch (err) {
      await load();
      throw err;
    }
  }, [load, router]);

  const signOut = React.useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  const isPortalUser = PORTAL_ROLES.includes(user?.role ?? '');

  React.useEffect(() => {
    if (status === 'loading') return;
    const onAuthPage = pathname === '/login' || pathname.startsWith('/invitation');
    if (status === 'anonymous' && !onAuthPage) { router.replace('/login'); return; }
    if (status !== 'authenticated') return;

    // Each audience has exactly one home. Sending a parent to /dashboard would
    // show them a shell whose every request 403s.
    const home = isPortalUser ? '/portal' : '/dashboard';
    if (pathname === '/login') { router.replace(home); return; }
    if (isPortalUser && !pathname.startsWith('/portal')) { router.replace('/portal'); return; }
    if (!isPortalUser && pathname.startsWith('/portal')) router.replace('/dashboard');
  }, [status, pathname, router, isPortalUser]);

  const activeBranch = React.useMemo(
    () => branches.find((b) => b.id === scope?.activeBranchId) ?? null,
    [branches, scope],
  );

  const value = React.useMemo<SessionState>(
    () => ({ user, organization, scope, branches, activeBranch, isPortalUser, status, switchBranch, signOut, reload: load }),
    [user, organization, scope, branches, activeBranch, isPortalUser, status, switchBranch, signOut, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
