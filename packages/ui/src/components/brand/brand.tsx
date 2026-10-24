import * as React from "react";
import { cn } from "../../lib/cn";

export const BRAND_NAME = "Campus Engine";
export const BRAND_PRODUCT = "Coaching";

export interface BrandMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * The Campus Engine core monogram — an open "C" with an engine core.
 * Paints in `currentColor`, so it follows `text-primary` (the default) and
 * flips with the theme like every other token-driven surface.
 */
export function BrandMark({ size = 24, className, ...rest }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={cn("shrink-0 text-primary", className)}
      {...rest}
    >
      <path
        d="M67.2 74.6 A30 30 0 1 1 67.2 25.4"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <circle cx="72" cy="50" r="9" fill="currentColor" />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 20, gap: "gap-2", name: "text-[13px]", chip: "px-1.5 py-[2px] text-[10px]" },
  md: { mark: 28, gap: "gap-2.5", name: "text-[16px]", chip: "px-2 py-[3px] text-[11px]" },
  lg: { mark: 40, gap: "gap-3", name: "text-[22px]", chip: "px-2.5 py-1 text-[12px]" },
} as const;

export interface BrandLogoProps {
  size?: keyof typeof SIZES;
  /** Show only the monogram — e.g. on a collapsed rail. */
  markOnly?: boolean;
  /** The product chip beside the wordmark. */
  product?: string;
  className?: string;
}

/** Monogram + "Campus Engine" wordmark + the product chip. */
export function BrandLogo({ size = "md", markOnly, product = BRAND_PRODUCT, className }: BrandLogoProps) {
  const s = SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap", s.gap, className)}
      aria-label={`${BRAND_NAME} ${product}`}
      role="img"
    >
      <BrandMark size={s.mark} />
      {!markOnly && (
        <>
          <span className={cn("font-bold tracking-[-0.02em] text-brand-ink", s.name)}>{BRAND_NAME}</span>
          {product && (
            <span
              className={cn(
                "rounded-full border border-primary bg-primary-soft font-semibold leading-none text-primary",
                s.chip
              )}
            >
              {product}
            </span>
          )}
        </>
      )}
    </span>
  );
}
