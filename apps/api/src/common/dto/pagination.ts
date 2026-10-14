import type { Paginated } from '@acadia/types';

export interface PageArgs {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export const skipTake = (a: Pick<PageArgs, 'page' | 'pageSize'>) => ({
  skip: (a.page - 1) * a.pageSize,
  take: a.pageSize,
});

export function paginate<T>(data: T[], total: number, a: Pick<PageArgs, 'page' | 'pageSize'>): Paginated<T> {
  return {
    data,
    meta: {
      page: a.page,
      pageSize: a.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / a.pageSize)),
    },
  };
}

/**
 * Whitelist-based ordering. A client-supplied sort key is never interpolated into
 * a query — an unknown key silently falls back to the default column.
 */
export function orderBy<T extends string>(
  allowed: readonly T[],
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc',
  fallback: T,
): Record<string, 'asc' | 'desc'> {
  const key = allowed.includes(sortBy as T) ? (sortBy as T) : fallback;
  return { [key]: sortDir };
}
