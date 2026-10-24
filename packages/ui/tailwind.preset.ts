import type { Config } from "tailwindcss";

/**
 * Campus Engine UI Tailwind preset.
 *
 * Apps consume this via `presets: [acadiaPreset]` and supply their own `content`.
 * Every colour here resolves to a CSS variable defined in `src/styles/tokens.css`,
 * so theming (light/dark) never requires a Tailwind rebuild.
 */
const preset: Omit<Config, "content"> = {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", secondary: "var(--surface-2)" },
        card: "var(--card)",
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        fg: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          disabled: "var(--text-disabled)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          soft: "var(--primary-soft)",
          fg: "var(--primary-fg)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        error: { DEFAULT: "var(--error)", soft: "var(--error-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        "brand-ink": "var(--brand-ink)",
      },
      borderRadius: { sm: "8px", md: "10px", lg: "14px", xl: "18px" },
      boxShadow: {
        soft: "var(--shadow-soft)",
        medium: "var(--shadow-medium)",
        elevated: "var(--shadow-elevated)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        /**
         * `font-mono` now marks figures rather than a monospace face. A
         * proportional font would let a column of numbers wobble, so the
         * `tnum` feature forces every digit to the same advance width —
         * which is the property that actually kept money columns aligned.
         */
        mono: [
          ["var(--font-mono)", "system-ui", "sans-serif"],
          { fontFeatureSettings: '"tnum"' },
        ],
      },
      fontSize: {
        display: ["36px", { lineHeight: "1.1", letterSpacing: "-0.035em", fontWeight: "650" }],
        h1: ["28px", { lineHeight: "1.15", letterSpacing: "-0.03em", fontWeight: "650" }],
        h2: ["22px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "620" }],
        h3: ["17px", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "600" }],
        h4: ["15px", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["15px", { lineHeight: "1.55" }],
        body: ["14px", { lineHeight: "1.55" }],
        "body-sm": ["13px", { lineHeight: "1.5" }],
        caption: ["11.5px", { lineHeight: "1.45" }],
        label: ["12.5px", { lineHeight: "1.4", fontWeight: "600" }],
        button: ["13.5px", { lineHeight: "1", fontWeight: "600" }],
        th: ["11px", { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "sheet-up": { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "none" } },
        "slide-left": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        shimmer: { "0%,100%": { opacity: ".55" }, "50%": { opacity: "1" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "fade-up": "fade-up .2s ease-out",
        "sheet-up": "sheet-up .22s ease-out",
        "slide-left": "slide-left .22s ease-out",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        "spin-slow": "spin-slow .7s linear infinite",
      },
    },
  },
  plugins: [],
};

export default preset;
