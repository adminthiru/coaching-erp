"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export const fieldShell =
  "flex items-center gap-2 h-[38px] rounded-md border border-border-strong bg-surface px-3 " +
  "text-body-sm text-fg transition-shadow focus-within:border-primary focus-within:ring-[3px] focus-within:ring-[var(--ring)]";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  prefix?: React.ReactNode;
  loading?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, required, helperText, error, leadingIcon, trailingIcon, prefix, loading, className, id, disabled, ...props },
  ref
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </label>
      )}
      <div
        className={cn(
          fieldShell,
          error && "border-error focus-within:border-error",
          disabled && "cursor-not-allowed border-border bg-surface-secondary",
          prefix && "px-0 overflow-hidden",
          className
        )}
      >
        {prefix && (
          <span className="grid h-full place-items-center border-r border-border bg-surface-secondary px-2.5 font-mono text-body-sm text-fg-secondary">
            {prefix}
          </span>
        )}
        {leadingIcon && <span className="shrink-0 text-fg-muted">{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted disabled:cursor-not-allowed disabled:text-fg-disabled",
            prefix && "px-3"
          )}
          {...props}
        />
        {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />}
        {!loading && trailingIcon && <span className="shrink-0 text-fg-muted">{trailingIcon}</span>}
      </div>
      {error ? (
        <span id={`${inputId}-error`} className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span id={`${inputId}-help`} className="text-caption text-fg-muted">{helperText}</span>
      ) : null}
    </div>
  );
});

/** Money field. Always right-aligned mono digits, always ₹ prefixed. */
export const CurrencyInput = React.forwardRef<HTMLInputElement, InputProps>(function CurrencyInput(props, ref) {
  return <Input ref={ref} inputMode="decimal" prefix="₹" className="font-mono" {...props} />;
});

export const SearchInput = React.forwardRef<HTMLInputElement, InputProps & { shortcut?: string }>(
  function SearchInput({ shortcut = "⌘K", ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="search"
        placeholder="Search students, batches, invoices"
        leadingIcon={<SearchGlyph />}
        trailingIcon={
          <kbd className="rounded-[4px] border border-border px-1.5 font-mono text-[10.5px] text-fg-muted">{shortcut}</kbd>
        }
        {...props}
      />
    );
  }
);

function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="m10.6 10.6 3 3" strokeLinecap="round" />
    </svg>
  );
}
