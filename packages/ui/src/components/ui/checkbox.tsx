"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, checked, disabled, ...props },
  ref
) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-body-sm", disabled && "cursor-not-allowed text-fg-disabled", className)}>
      <span className="relative grid size-[17px] place-items-center">
        <input ref={ref} type="checkbox" checked={checked} disabled={disabled} className="peer absolute inset-0 cursor-pointer opacity-0" {...props} />
        <span
          aria-hidden
          className={cn(
            "grid size-[17px] place-items-center rounded-[5px] border border-border-strong bg-surface transition-colors",
            "peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-[var(--ring)]"
          )}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--primary-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cn(!checked && "opacity-0")}>
            <path d="m3.5 8.4 3 3 6-6.6" />
          </svg>
        </span>
      </span>
      {label}
    </label>
  );
});
