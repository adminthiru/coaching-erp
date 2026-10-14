"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Checkbox } from "@/components/ui/checkbox";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Keep money and dates in font-mono. */
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  /** Rendered instead of the table row on mobile. Omit to hide the field on small screens. */
  mobile?: "primary" | "secondary" | "meta";
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string;
  /** Rendered when data is empty and not loading. */
  empty?: React.ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  sort?: { key: string; dir: "asc" | "desc" } | null;
  onSortChange?: (sort: { key: string; dir: "asc" | "desc" }) => void;
  rowActions?: (row: T) => React.ReactNode;
  toolbar?: React.ReactNode;
  bulkActions?: (selected: Set<string>) => React.ReactNode;
  pagination?: { page: number; pageCount: number; onChange: (p: number) => void; summary?: string };
  /** Mobile card renderer. Defaults to a card built from the mobile-tagged columns. */
  renderMobileCard?: (row: T) => React.ReactNode;
}

/**
 * The enterprise table for every module: students, attendance, exams, fees,
 * income, expenses, teachers, batches. Configure columns — never fork the table.
 * Below 1000px it switches to stacked cards rather than a horizontal scroll.
 */
export function DataTable<T>({
  columns, data, getRowId, loading, error, empty, selectable, selected, onSelectedChange,
  sort, onSortChange, rowActions, toolbar, bulkActions, pagination, renderMobileCard,
}: DataTableProps<T>) {
  const sel = selected ?? new Set<string>();
  const allSelected = data.length > 0 && data.every((r) => sel.has(getRowId(r)));

  const toggleRow = (id: string) => {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectedChange?.(next);
  };
  const toggleAll = () => onSelectedChange?.(allSelected ? new Set() : new Set(data.map(getRowId)));

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange({ key, dir: sort?.key === key && sort.dir === "asc" ? "desc" : "asc" });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {(toolbar || (sel.size > 0 && bulkActions)) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">{toolbar}</div>
          {sel.size > 0 && bulkActions && (
            <div className="flex items-center gap-2.5">
              <span className="text-caption text-fg-secondary">{sel.size} selected</span>
              {bulkActions(sel)}
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="px-5 py-12 text-center">
          <p className="text-body-sm font-semibold text-error">{error}</p>
          <p className="mt-1 text-caption text-fg-secondary">Retry, or contact support if this persists.</p>
        </div>
      ) : loading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        empty ?? <EmptyState title="Nothing here yet" description="Records will appear once they are added." />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-2.5 p-3.5 lg:hidden">
            {data.map((row) => (
              <div key={getRowId(row)}>{renderMobileCard?.(row) ?? <DefaultMobileCard row={row} columns={columns} actions={rowActions} />}</div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-secondary">
                  {selectable && (
                    <th className="w-11 py-2.5 pl-4 text-left">
                      <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                    </th>
                  )}
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      onClick={() => c.sortable && handleSort(c.key)}
                      className={cn(
                        "px-4 py-2.5 text-th uppercase text-fg-secondary",
                        c.align === "right" ? "text-right" : "text-left",
                        c.sortable && "cursor-pointer select-none hover:text-fg"
                      )}
                      aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {c.header} {sort?.key === c.key && (sort.dir === "asc" ? "↑" : "↓")}
                    </th>
                  ))}
                  {rowActions && <th className="w-14" />}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const id = getRowId(row);
                  return (
                    <tr key={id} className="border-t border-border hover:bg-surface-secondary">
                      {selectable && (
                        <td className="py-3 pl-4">
                          <Checkbox checked={sel.has(id)} onChange={() => toggleRow(id)} aria-label={`Select row ${id}`} />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-3 text-body-sm", c.align === "right" && "text-right")}>
                          {c.cell(row)}
                        </td>
                      ))}
                      {rowActions && <td className="py-3 pr-4 text-right">{rowActions(row)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pagination && !loading && data.length > 0 && <Pagination {...pagination} />}
    </div>
  );
}

function DefaultMobileCard<T>({ row, columns, actions }: { row: T; columns: Column<T>[]; actions?: (row: T) => React.ReactNode }) {
  const primary = columns.find((c) => c.mobile === "primary");
  const secondary = columns.filter((c) => c.mobile === "secondary");
  const meta = columns.filter((c) => c.mobile === "meta");
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">{primary?.cell(row)}</div>
        {actions?.(row)}
      </div>
      {secondary.length > 0 && (
        <div className="flex items-center justify-between gap-3">{secondary.map((c) => <span key={c.key}>{c.cell(row)}</span>)}</div>
      )}
      {meta.map((c) => <div key={c.key}>{c.cell(row)}</div>)}
    </div>
  );
}
