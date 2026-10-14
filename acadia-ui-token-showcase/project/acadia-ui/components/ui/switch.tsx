"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className={cn("inline-flex items-center gap-2.5 text-body-sm", disabled ? "cursor-not-allowed text-fg-disabled" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-5 w-[34px] items-center rounded-full px-0.5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
          checked ? "justify-end bg-primary" : "justify-start bg-border",
          disabled && "opacity-70"
        )}
      >
        <span className="size-4 rounded-full bg-surface shadow-soft" />
      </button>
      {label}
    </label>
  );
}
