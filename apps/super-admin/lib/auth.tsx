'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, logout as apiLogout, tokens, type SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Resolves the session once on mount by asking the API who the stored token
 * belongs to. The server is the authority — a token in localStorage proves
 * nothing until /me confirms the session is still live.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [status, setStatus] = React.useState<AuthState['status']>('loading');
  const router = useRouter();
  const pathname = usePathname();

  const load = React.useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      setStatus('anonymous');
      return;
    }
    try {
      const me = await api<{ id: string; email: string; role: string }>('/platform/auth/me');
      const users = await api<SessionUser[]>('/platform/users').catch(() => [] as SessionUser[]);
      const full = users.find((u) => u.id === me.id);
      setUser({ id: me.id, email: me.email, role: me.role, name: full?.name ?? me.email });
      setStatus('authenticated');
    } catch {
      tokens.clear();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const signOut = React.useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  // Guard: bounce anonymous visitors out of the console, and signed-in users
  // away from the login screen.
  React.useEffect(() => {
    if (status === 'loading') return;
    const onLogin = pathname === '/login';
    if (status === 'anonymous' && !onLogin) router.replace('/login');
    if (status === 'authenticated' && onLogin) router.replace('/dashboard');
  }, [status, pathname, router]);

  const value = React.useMemo<AuthState>(
    () => ({ user, status, signOut, refreshUser: load }),
    [user, status, signOut, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
