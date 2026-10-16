/**
 * Thin API client for the Super Admin Console.
 *
 * Tokens live in localStorage rather than a cookie because the API is a separate
 * origin and authenticates with a Bearer header. A 401 triggers exactly one
 * refresh-and-retry; a second failure signs the user out.
 */
// `/config.js` (see public/config.js) is read at runtime so a built static site can be
// pointed at a different API by editing one file on the host, without rebuilding.
const BASE =
  (typeof window !== 'undefined' && (window as { ACADIA_API_URL?: string }).ACADIA_API_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

const ACCESS_KEY = 'acadia.superadmin.access';
const REFRESH_KEY = 'acadia.superadmin.refresh';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const tokens = {
  get access() {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
  },
  get refresh() {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  },
  set(access: string, refresh: string) {
    try {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch { /* private browsing — the session simply won't persist */ }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch { /* ignore */ }
  },
};

/** Mirrors the API's error envelope so callers can show field-level messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string> | Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors keyed by input name, when the failure was validation. */
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
    const res = await fetch(`${BASE}/api/platform/auth/refresh`, {
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

/** Concurrent 401s share one refresh rather than racing several rotations. */
function refreshOnce() {
  refreshing ??= runRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE}/api${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const access = tokens.access;
    if (access) headers.authorization = `Bearer ${access}`;

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
    throw new ApiError(
      res.status,
      data?.code ?? 'ERROR',
      data?.message ?? 'Something went wrong.',
      data?.details,
    );
  }

  return data as T;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? 'Sign in failed.', data?.details);
  }
  tokens.set(data.accessToken, data.refreshToken);
  return data.user as SessionUser;
}

export async function logout() {
  try {
    await api('/platform/auth/logout', { method: 'POST' });
  } finally {
    tokens.clear();
  }
}
