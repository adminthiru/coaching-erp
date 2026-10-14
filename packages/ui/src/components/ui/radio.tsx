"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface RadioOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Radio group. Use `variant="card"` when each option needs a description —
 * plan selection, billing cycle, refund type. Plain rows otherwise.
 */
export function RadioGroup<T extends string = string>({
  name,
  label,
  required,
  options,
  value,
  onChange,
  error,
  helperText,
  variant = "row",
  className,
}: {
  name: string;
  label?: string;
  required?: boolean;
  options: RadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  helperText?: string;
  variant?: "row" | "card";
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      {label && (
        <legend className="mb-1 text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </legend>
      )}

      <div className={cn("flex flex-col gap-2", variant === "card" && "gap-2.5")}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5",
                variant === "card" &&
                  cn(
                    "rounded-md border px-3.5 py-3 transition-colors",
                    checked ? "border-primary bg-primary-soft" : "border-border-strong bg-surface hover:border-primary"
                  ),
                o.disabled && "cursor-not-allowed opacity-55"
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-px grid size-[17px] shrink-0 place-items-center rounded-full border transition-colors",
                  checked ? "border-[5px] border-primary bg-surface" : "border border-border-strong bg-surface",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-[var(--ring)]"
                )}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body-sm font-medium text-fg">{o.label}</span>
                {o.description && <span className="text-caption text-fg-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span className="text-caption text-fg-muted">{helperText}</span>
      ) : null}
    </fieldset>
  );
}
