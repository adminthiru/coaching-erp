"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, required, helperText, error, className, id, ...props },
  ref
) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={3}
        aria-invalid={!!error || undefined}
        className={cn(
          "resize-y rounded-md border border-border-strong bg-surface px-3 py-2.5 text-body-sm text-fg outline-none",
          "placeholder:text-fg-muted focus:border-primary focus:ring-[3px] focus:ring-[var(--ring)]",
          error && "border-error",
          className
        )}
        {...props}
      />
      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : helperText ? (
        <span className="text-caption text-fg-muted">{helperText}</span>
      ) : null}
    </div>
  );
});
