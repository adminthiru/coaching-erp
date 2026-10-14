"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface TabsProps<T extends string> {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  variant?: "underline" | "segmented";
}

export function Tabs<T extends string>({ tabs, value, onChange, variant = "underline" }: TabsProps<T>) {
  if (variant === "segmented") {
    return (
      <div role="tablist" className="inline-flex gap-1 rounded-md border border-border bg-surface-secondary p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={t.value === value}
            onClick={() => onChange(t.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              t.value === value ? "bg-surface text-fg shadow-soft" : "text-fg-secondary hover:text-fg"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" className="flex gap-6 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            "flex items-center gap-2 border-b-2 pb-2.5 text-body-sm font-semibold transition-colors",
            t.value === value ? "border-primary text-fg" : "border-transparent text-fg-secondary hover:text-fg"
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-surface-secondary px-1.5 font-mono text-[10.5px] text-fg-muted">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
