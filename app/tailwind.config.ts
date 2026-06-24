import type { Config } from "tailwindcss";

/**
 * Multi-Theme via CSS-Variablen:
 * Tokens werden als RGB-Triplets (z.B. "246 246 242") in globals.css gespeichert,
 * damit Tailwind Opacity-Modifier (bg-linen/40, border-stone/60) korrekt mit
 * `rgb(var(--xyz) / <alpha-value>)` auflösen kann.
 * Theme-Switch via `<html data-theme="lisa|studio|midnight">`.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        linen: "rgb(var(--linen) / <alpha-value>)",
        stone: "rgb(var(--stone) / <alpha-value>)",
        smoke: "rgb(var(--taupe) / <alpha-value>)", // text-smoke ist semantisch muted-text
        taupe: "rgb(var(--taupe) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          deep: "rgb(var(--accent-deep) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          soft: "rgb(var(--success-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "-apple-system", "sans-serif"],
        ui: ["var(--font-ui)", "-apple-system", "sans-serif"],
      },
      letterSpacing: {
        eyebrow: "0.24em",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-md)",
        xl: "var(--radius-lg)",
        xl2: "var(--radius-lg)",
        full: "var(--radius-full)",
      },
    },
  },
  plugins: [],
};
export default config;
