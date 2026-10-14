import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system names its type scale with words (`text-button`, `text-body-sm`,
 * `text-h3`) rather than t-shirt sizes. tailwind-merge cannot tell those apart from
 * colour utilities — it classifies any unrecognised `text-*` as a colour — so
 * `text-primary-fg text-button` collapsed to just `text-button`, silently dropping
 * the colour and leaving primary buttons with dark body text on a blue fill.
 *
 * Declaring the scale here restores the two as distinct groups, so a size and a
 * colour can coexist on the same element. Any new entry in the preset's `fontSize`
 * map must be added to this list too.
 */
const FONT_SIZES = [
  "display", "h1", "h2", "h3", "h4",
  "body-lg", "body", "body-sm",
  "caption", "label", "button", "th",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": FONT_SIZES.map((size) => `text-${size}`),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
