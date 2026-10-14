"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors " +
    "outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] " +
    "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-secondary disabled:text-fg-disabled",
  {
    variants: {
      variant: {
        primary: "border border-primary bg-primary text-primary-fg shadow-soft hover:bg-primary-hover hover:border-primary-hover",
        secondary: "border border-border bg-surface-secondary text-fg hover:border-border-strong",
        outline: "border border-border-strong bg-transparent text-fg hover:bg-surface-secondary",
        ghost: "border border-transparent bg-transparent text-fg-secondary hover:bg-surface-secondary hover:text-fg",
        destructive: "border border-error bg-error text-white hover:opacity-90",
        success: "border border-success bg-success text-white hover:opacity-90",
        link: "border-none bg-transparent text-primary underline underline-offset-[3px] hover:text-primary-hover",
      },
      size: {
        xs: "h-[26px] rounded-sm px-2.5 text-[11.5px]",
        sm: "h-8 rounded-md px-3 text-[12.5px]",
        md: "h-9 rounded-md px-[15px] text-button",
        lg: "h-11 rounded-md px-5 text-[14.5px]",
      },
      iconOnly: { true: "px-0 aspect-square", false: "" },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", iconOnly: false, fullWidth: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

/**
 * The only button in the product. Configure it — never fork it.
 * Icon-only buttons must always carry an aria-label and a <Tooltip>.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, iconOnly, fullWidth, loading, leadingIcon, trailingIcon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, iconOnly, fullWidth }), className)}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/35 border-t-current"
    />
  );
}
