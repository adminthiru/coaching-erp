/**
 * Tenant API client.
 *
 * Beyond the platform client's token handling, every request carries the branch
 * the user is working in via `x-branch-id`. That header is a *request*, not an
 * assertion — the API re-validates it against the user's assignments on every
 * call (spec §76), so a tampered value fails rather than escalating.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ACCESS_KEY = 'acadia.erp.access';
const REFRESH_KEY = 'acadia.erp.refresh';
const BRANCH_KEY = 'acadia.erp.branch';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  trialEndsAt: string | null;
}

export interface Scope {
  activeBranchId: string | null;
  accessibleBranchIds: string[] | null;
  canSelectAllBranches: boolean;
}

const safeGet = (k: string) => {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(k); } catch { return null; }
};
const safeSet = (k: string, v: string | null) => {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ }
};

export const tokens = {
  get access() { return safeGet(ACCESS_KEY); },
  get refresh() { return safeGet(REFRESH_KEY); },
  set(access: string, refresh: string) { safeSet(ACCESS_KEY, access); safeSet(REFRESH_KEY, refresh); },
  clear() { safeSet(ACCESS_KEY, null); safeSet(REFRESH_KEY, null); safeSet(BRANCH_KEY, null); },
};

/** `"all"` is the all-branch view; `null` means "let the server decide". */
export const branchSelection = {
  get(): string | null { return safeGet(BRANCH_KEY); },
  set(id: string | null) { safeSet(BRANCH_KEY, id); },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_FAILED' || !this.details) return {};
    return this.details as Record<string, string>;
  }
}

let refreshing: Promise<boolean> | null = null;

async function runRefresh(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/api/tenant/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokens.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce() {
  refreshing ??= runRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Omit the branch header — used by /auth routes that resolve scope themselves. */
  noBranch?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE}/api/tenant${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const access = tokens.access;
    if (access) headers.authorization = `Bearer ${access}`;
    const branch = branchSelection.get();
    if (branch && !opts.noBranch) headers['x-branch-id'] = branch;

    return fetch(url.toString(), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      cache: 'no-store',
    });
  };

  let res = await send();

  if (res.status === 401 && tokens.refresh) {
    if (await refreshOnce()) {
      res = await send();
    } else {
      tokens.clear();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // A stale branch selection (transferred away, branch archived) must not
    // wedge the app — drop it and let the server pick the default next time.
    if (res.status === 403 && data?.code === 'BRANCH_FORBIDDEN') {
      branchSelection.set(null);
    }
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? 'Something went wrong.', data?.details);
  }

  return data as T;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/tenant/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? 'Sign in failed.', data?.details);
  }
  tokens.set(data.accessToken, data.refreshToken);
  branchSelection.set(null);
  return data.user as SessionUser & { organization: Organization };
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    tokens.clear();
  }
}
