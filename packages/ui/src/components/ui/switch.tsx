"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  /**
   * Explains what the setting does. Settings whose consequence is not obvious from
   * the label alone should carry one — a toggle the user has to guess at is a bug.
   */
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const descriptionId = React.useId();

  return (
    <label
      className={cn(
        "inline-flex gap-2.5 text-body-sm",
        description ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed text-fg-disabled" : "cursor-pointer",
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-5 w-[34px] shrink-0 items-center rounded-full px-0.5 transition-colors",
          description && "mt-0.5",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
          checked ? "justify-end bg-primary" : "justify-start bg-border",
          disabled && "opacity-70"
        )}
      >
        <span className="size-4 rounded-full bg-surface shadow-soft" />
      </button>

      {(label || description) && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {label}
          {description && (
            <span id={descriptionId} className="text-caption text-fg-muted">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
