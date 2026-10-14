'use client';

import * as React from 'react';
import { ApiError, api, type RequestOptions } from './api';

export interface QueryState<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Minimal data-fetching hook — enough for the console without pulling in a
 * caching library. Requests are aborted when inputs change or the component
 * unmounts, so a slow response cannot overwrite a newer one.
 */
export function useQuery<T>(path: string | null, opts: RequestOptions = {}, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<ApiError | Error | null>(null);
  const [loading, setLoading] = React.useState(path !== null);
  const [nonce, setNonce] = React.useState(0);

  const serialized = JSON.stringify(opts.query ?? {});

  React.useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController();
    let live = true;

    setLoading(true);
    setError(null);

    api<T>(path, { ...opts, query: JSON.parse(serialized), signal: controller.signal })
      .then((res) => { if (live) { setData(res); setError(null); } })
      .catch((err) => {
        if (!live || controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error('Request failed'));
      })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, serialized, nonce, ...deps]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Debounces a value — used so typing in a search box doesn't fire a request per keystroke. */
export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
