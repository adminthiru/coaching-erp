"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

/** Listbox select. Combobox and MultiSelect share this shell. */
export function Select<T extends string = string>({
  label, required, helperText, error, placeholder = "Select…", disabled, options, value, onChange, className,
}: SelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn("relative flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[38px] items-center justify-between rounded-md border bg-surface px-3 text-body-sm text-fg",
          open ? "border-primary ring-[3px] ring-[var(--ring)]" : "border-border-strong",
          error && "border-error",
          disabled && "cursor-not-allowed bg-surface-secondary text-fg-disabled"
        )}
      >
        <span className={cn(!current && "text-fg-muted")}>{current?.label ?? placeholder}</span>
        <Chevron />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-[66px] z-40 flex max-h-[226px] w-full flex-col gap-px overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-elevated"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={o.disabled}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-left text-body-sm text-fg hover:bg-surface-secondary",
                    active && "bg-primary-soft",
                    o.disabled && "cursor-not-allowed text-fg-disabled"
                  )}
                >
                  {o.label}
                  {active && <span className="text-primary">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span className="text-caption text-fg-muted">{helperText}</span>
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="m4 6.5 4 4 4-4" />
    </svg>
  );
}
