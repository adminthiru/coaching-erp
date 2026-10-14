"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

/** The dashboard period presets required by spec §10. */
export type RangePreset = "today" | "7d" | "30d" | "month" | "year" | "custom";

export interface DateRange {
  preset: RangePreset;
  /** ISO yyyy-mm-dd. Always populated, including for presets, so callers never recompute. */
  from: string;
  to: string;
}

const LABEL: Record<RangePreset, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  month: "This month",
  year: "This year",
  custom: "Custom",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Resolves a preset to concrete boundaries. `custom` returns the last 30 days as a starting point. */
export function resolvePreset(preset: RangePreset, now = new Date()): DateRange {
  const to = iso(now);
  const back = (days: number) => iso(new Date(now.getTime() - days * 864e5));
  switch (preset) {
    case "today": return { preset, from: to, to };
    case "7d": return { preset, from: back(6), to };
    case "30d": return { preset, from: back(29), to };
    case "month": return { preset, from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "year": return { preset, from: iso(new Date(now.getFullYear(), 0, 1)), to };
    case "custom": return { preset, from: back(29), to };
  }
}

const PRESETS: RangePreset[] = ["today", "7d", "30d", "month", "year", "custom"];

/**
 * Period filter for dashboards and reports. Presets resolve to real dates on
 * selection, so the caller always receives a concrete `{from, to}` to send to
 * the API — never a token the backend has to interpret.
 */
export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ from: value.from, to: value.to });
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => { setDraft({ from: value.from, to: value.to }); }, [value.from, value.to]);

  const invalid = draft.from > draft.to;

  function pick(p: RangePreset) {
    if (p === "custom") { setOpen(true); return; }
    onChange(resolvePreset(p));
    setOpen(false);
  }

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface-secondary p-0.5">
        {PRESETS.map((p) => {
          const active = value.preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => pick(p)}
              aria-pressed={active}
              className={cn(
                "rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
                active ? "bg-surface text-fg shadow-soft" : "text-fg-secondary hover:text-fg"
              )}
            >
              {LABEL[p]}
            </button>
          );
        })}
      </div>

      {value.preset === "custom" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-caption text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          {value.from} → {value.to}
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-[280px] flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-elevated">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-label text-fg">From</span>
              <input
                type="date"
                value={draft.from}
                max={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-body-sm text-fg outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label text-fg">To</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-body-sm text-fg outline-none focus:border-primary"
              />
            </label>
          </div>

          {invalid && <span className="text-caption text-error">The start date must fall on or before the end date.</span>}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={invalid}
              onClick={() => { onChange({ preset: "custom", from: draft.from, to: draft.to }); setOpen(false); }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
