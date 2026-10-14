import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
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
        error:   { DEFAULT: "var(--error)",   soft: "var(--error-soft)" },
        info:    { DEFAULT: "var(--info)",    soft: "var(--info-soft)" },
      },
      borderRadius: { sm: "8px", md: "10px", lg: "14px", xl: "18px" },
      boxShadow: {
        soft: "var(--shadow-soft)",
        medium: "var(--shadow-medium)",
        elevated: "var(--shadow-elevated)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        display:  ["36px", { lineHeight: "1.1",  letterSpacing: "-0.035em", fontWeight: "650" }],
        h1:       ["28px", { lineHeight: "1.15", letterSpacing: "-0.03em",  fontWeight: "650" }],
        h2:       ["22px", { lineHeight: "1.2",  letterSpacing: "-0.02em",  fontWeight: "620" }],
        h3:       ["17px", { lineHeight: "1.3",  letterSpacing: "-0.015em", fontWeight: "600" }],
        h4:       ["15px", { lineHeight: "1.4",  fontWeight: "600" }],
        "body-lg":["15px", { lineHeight: "1.55" }],
        body:     ["14px", { lineHeight: "1.55" }],
        "body-sm":["13px", { lineHeight: "1.5" }],
        caption:  ["11.5px",{ lineHeight: "1.45" }],
        label:    ["12.5px",{ lineHeight: "1.4", fontWeight: "600" }],
        button:   ["13.5px",{ lineHeight: "1", fontWeight: "600" }],
        th:       ["11px",  { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "sheet-up": { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "none" } },
        "slide-left": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        shimmer: { "0%,100%": { opacity: ".55" }, "50%": { opacity: "1" } },
      },
      animation: {
        "fade-up": "fade-up .2s ease-out",
        "sheet-up": "sheet-up .22s ease-out",
        "slide-left": "slide-left .22s ease-out",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
