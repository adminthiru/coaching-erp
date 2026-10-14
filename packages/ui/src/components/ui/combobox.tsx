"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { FloatingMenu } from "./floating-menu";

export interface ComboboxOption<T extends string = string> {
  value: T;
  label: string;
  /** Secondary line — branch code, city, email. Also matched when searching. */
  meta?: string;
  disabled?: boolean;
}

interface BaseProps<T extends string> {
  label?: string;
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  options: ComboboxOption<T>[];
  className?: string;
  /** Server-side search — when supplied, local filtering is skipped. */
  onSearch?: (query: string) => void;
}

function useDismiss(open: boolean, close: () => void) {
  const wrap = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // The menu is portalled to <body>, so it is not inside `wrap`. Without
      // this, mousedown on an option would close the list before the option's
      // own click could fire, and nothing would ever be selectable.
      if (t.closest?.("[data-floating-menu]")) return;
      if (!wrap.current?.contains(t)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return wrap;
}

function matches(o: ComboboxOption<string>, q: string) {
  if (!q) return true;
  const n = q.toLowerCase();
  return o.label.toLowerCase().includes(n) || (o.meta?.toLowerCase().includes(n) ?? false);
}

/**
 * Searchable single-select. Use this over <Select> once the list can exceed
 * ~8 entries — organizations, branches, batches, faculty, students.
 */
export function Combobox<T extends string = string>({
  label, required, placeholder = "Select…", searchPlaceholder = "Search…", emptyText = "No matches",
  helperText, error, disabled, loading, options, value, onChange, onSearch, className,
}: BaseProps<T> & { value: T | null; onChange: (value: T | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const close = React.useCallback(() => { setOpen(false); setQuery(""); }, []);
  const wrap = useDismiss(open, close);
  const trigger = React.useRef<HTMLButtonElement>(null);

  const list = React.useMemo(
    () => (onSearch ? options : options.filter((o) => matches(o, query))),
    [options, query, onSearch]
  );
  const current = options.find((o) => o.value === value);

  React.useEffect(() => setCursor(0), [query, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => {
        if (!list.length) return 0;
        let n = c;
        for (let i = 0; i < list.length; i++) {
          n = (n + d + list.length) % list.length;
          if (!list[n].disabled) break;
        }
        return n;
      });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = list[cursor];
      if (pick && !pick.disabled) { onChange(pick.value); close(); }
    }
  }

  return (
    <div ref={wrap} className={cn("relative flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </span>
      )}

      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[38px] items-center justify-between gap-2 rounded-md border bg-surface px-3 text-body-sm text-fg transition-shadow",
          open ? "border-primary ring-[3px] ring-[var(--ring)]" : "border-border-strong",
          error && "border-error",
          disabled && "cursor-not-allowed bg-surface-secondary text-fg-disabled"
        )}
      >
        <span className={cn("truncate", !current && "text-fg-muted")}>{current?.label ?? placeholder}</span>
        <Chevron />
      </button>

      <FloatingMenu anchorRef={trigger} open={open} onClose={() => setOpen(false)} className="p-0">
        <div className="flex w-full flex-col">
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-sm bg-transparent px-2 text-body-sm text-fg outline-none placeholder:text-fg-muted"
            />
          </div>

          <ul role="listbox" className="flex max-h-[220px] flex-col gap-px overflow-y-auto p-1.5">
            {loading ? (
              <li className="px-2.5 py-3 text-center text-body-sm text-fg-muted">Loading…</li>
            ) : list.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-body-sm text-fg-muted">{emptyText}</li>
            ) : (
              list.map((o, i) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={o.disabled}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => { onChange(o.value); close(); }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-left",
                        i === cursor && "bg-surface-secondary",
                        active && "bg-primary-soft",
                        o.disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{o.label}</span>
                        {o.meta && <span className="truncate text-caption text-fg-muted">{o.meta}</span>}
                      </span>
                      {active && <span className="shrink-0 text-primary">✓</span>}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </FloatingMenu>

      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span className="text-caption text-fg-muted">{helperText}</span>
      ) : null}
    </div>
  );
}

/**
 * Searchable multi-select. Selected entries render as removable chips —
 * branch targeting for a multi-branch test, feature entitlements on a plan.
 */
export function MultiCombobox<T extends string = string>({
  label, required, placeholder = "Select…", searchPlaceholder = "Search…", emptyText = "No matches",
  helperText, error, disabled, loading, options, value, onChange, onSearch, className, max,
}: BaseProps<T> & { value: T[]; onChange: (value: T[]) => void; max?: number }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const close = React.useCallback(() => { setOpen(false); setQuery(""); }, []);
  const wrap = useDismiss(open, close);
  const trigger = React.useRef<HTMLDivElement>(null);

  const list = React.useMemo(
    () => (onSearch ? options : options.filter((o) => matches(o, query))),
    [options, query, onSearch]
  );
  const atMax = max !== undefined && value.length >= max;

  function toggle(v: T) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!atMax) onChange([...value, v]);
  }

  return (
    <div ref={wrap} className={cn("relative flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </span>
      )}

      <div
        ref={trigger}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        className={cn(
          "flex min-h-[38px] cursor-pointer flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 transition-shadow",
          open ? "border-primary ring-[3px] ring-[var(--ring)]" : "border-border-strong",
          error && "border-error",
          disabled && "cursor-not-allowed bg-surface-secondary"
        )}
      >
        {value.length === 0 && <span className="px-1 text-body-sm text-fg-muted">{placeholder}</span>}
        {value.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-caption font-medium text-primary">
              {o?.label ?? v}
              <button
                type="button"
                aria-label={`Remove ${o?.label ?? v}`}
                onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }}
                className="grid size-4 place-items-center rounded-full text-primary/70 hover:bg-primary/15 hover:text-primary"
              >
                ✕
              </button>
            </span>
          );
        })}
        <span className="ml-auto pr-1"><Chevron /></span>
      </div>

      <FloatingMenu anchorRef={trigger} open={open} onClose={() => setOpen(false)} className="p-0">
        <div className="flex w-full flex-col">
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
              onKeyDown={(e) => e.key === "Escape" && close()}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-sm bg-transparent px-2 text-body-sm text-fg outline-none placeholder:text-fg-muted"
            />
          </div>

          <ul role="listbox" aria-multiselectable className="flex max-h-[220px] flex-col gap-px overflow-y-auto p-1.5">
            {loading ? (
              <li className="px-2.5 py-3 text-center text-body-sm text-fg-muted">Loading…</li>
            ) : list.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-body-sm text-fg-muted">{emptyText}</li>
            ) : (
              list.map((o) => {
                const on = value.includes(o.value);
                const blocked = !on && atMax;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={o.disabled || blocked}
                      onClick={() => toggle(o.value)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-secondary",
                        on && "bg-primary-soft",
                        (o.disabled || blocked) && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[5px] border text-[10px] font-bold",
                          on ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface"
                        )}
                      >
                        {on && "✓"}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{o.label}</span>
                        {o.meta && <span className="truncate text-caption text-fg-muted">{o.meta}</span>}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </FloatingMenu>

      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span className="text-caption text-fg-muted">{helperText}</span>
      ) : atMax ? (
        <span className="text-caption text-fg-muted">Maximum of {max} selected.</span>
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" aria-hidden className="shrink-0">
      <path d="m4 6.5 4 4 4-4" />
    </svg>
  );
}
