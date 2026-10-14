"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * Segmented control — a small, mutually-exclusive set of views over the *same*
 * data (dashboard period: Today / 7d / 30d). Use <Tabs> when the panels show
 * different data, not a different slice of it.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth,
  className,
  "aria-label": ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    const at = enabled.indexOf(index);
    const next = enabled[(at + delta + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-secondary p-0.5",
        fullWidth && "flex w-full",
        className
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "rounded-[7px] font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[12.5px]",
              fullWidth && "flex-1",
              active ? "bg-surface text-fg shadow-soft" : "text-fg-secondary hover:text-fg",
              o.disabled && "cursor-not-allowed text-fg-disabled hover:text-fg-disabled"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
