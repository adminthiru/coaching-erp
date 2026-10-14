import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const cardVariants = cva("rounded-lg border bg-card", {
  variants: {
    variant: {
      default: "border-border",
      elevated: "border-border shadow-medium",
      interactive: "border-border transition-colors hover:border-border-strong hover:shadow-soft cursor-pointer",
      info: "border-border border-l-[3px] border-l-info bg-info-soft",
      warning: "border-border border-l-[3px] border-l-warning bg-warning-soft",
      success: "border-border border-l-[3px] border-l-success bg-success-soft",
      error: "border-border border-l-[3px] border-l-error bg-error-soft",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-h4 text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-caption text-fg-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2.5 border-t border-border bg-surface-secondary px-5 py-3", className)} {...props} />;
}
