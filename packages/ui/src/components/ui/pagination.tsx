"use client";

import { Button } from "../ui/button";
import { cn } from "../../lib/cn";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  summary?: string;
}

export function Pagination({ page, pageCount, onChange, summary }: PaginationProps) {
  const pages = Array.from({ length: Math.min(pageCount, 3) }, (_, i) => i + 1);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3" aria-label="Pagination">
      {summary && <span className="text-caption text-fg-muted">{summary}</span>}
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</Button>
        {pages.map((p) => (
          <button
            key={p}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onChange(p)}
            className={cn(
              "size-8 rounded-sm border text-[12.5px]",
              p === page ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-surface text-fg-secondary hover:bg-surface-secondary"
            )}
          >
            {p}
          </button>
        ))}
        <Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}
