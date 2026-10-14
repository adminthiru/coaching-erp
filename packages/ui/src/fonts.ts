import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * The typeface layer of the design system.
 *
 * Both apps load their fonts from here rather than each calling
 * `next/font/google` themselves: the weights, the `display` strategy and the
 * CSS variable names are part of the design system, and when they were
 * duplicated per app the two could silently drift apart.
 *
 * `next/font` is a build-time transform, so these calls must sit at module
 * scope with literal arguments — which is why this exports the *loaded fonts*
 * rather than a config object for each app to spread.
 *
 * Kept out of the package's main barrel deliberately: importing this pulls the
 * font loader into anything that touches `@acadia/ui`, and only the two root
 * layouts need it.
 */

/** The one typeface. Body text, labels, headings and figures all use it. */
export const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * Put this on `<html>`. It declares `--font-jakarta`, which
 * `@acadia/ui/tokens.css` maps onto both `--font-sans` and `--font-mono` —
 * one typeface for the whole product. Numbers stay aligned through the `tnum`
 * feature on the `font-mono` family, not through a second font.
 */
export const fontVariables = sans.variable;
