"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setUserTheme } from "./themeActions";
import { toast } from "sonner";

type ThemeKey = "lisa" | "studio" | "midnight";

type ThemeDef = {
  key: ThemeKey;
  name: string;
  tagline: string;
  description: string;
  // Hardcoded Preview-Tokens — unabhängig vom aktuellen aktiven Theme.
  bg: string;
  paper: string;
  ink: string;
  accent: string;
  taupe: string;
  swatches: string[];
  displayFont: string;
  bodyFont: string;
  displayWeight: number;
  // Bezeichner-Style (Eyebrow oben in der Card)
  eyebrowTransform: "uppercase" | "none";
  eyebrowTracking: string;
};

const THEMES: ThemeDef[] = [
  {
    key: "lisa",
    name: "Velours",
    tagline: "Editorial. Warm. Zurückgenommen.",
    description: "Cormorant Garamond mit Open Sans, cremefarbenes Papier, gedecktes Bordeauxrot. Das Vogue-Doppelseiten-Theme für ruhige Eleganz und viel Raum um die Bilder.",
    bg: "#F6F6F2",
    paper: "#FFFCF8",
    ink: "#19191A",
    accent: "#C8102E",
    taupe: "#7A746B",
    swatches: ["#F6F6F2", "#FFFCF8", "#E4E2DA", "#C8102E", "#19191A"],
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"Open Sans", sans-serif',
    displayWeight: 500,
    eyebrowTransform: "uppercase",
    eyebrowTracking: "0.24em",
  },
  {
    key: "studio",
    name: "Lumière",
    tagline: "Hell, freundlich, großzügig.",
    description: "Plus Jakarta Sans, voll-runde Buttons, Airbnb-Rauschrot auf reinem Weiß. Modern und zugänglich — Cards heben sich beim Hover sanft an, alles wirkt anfassbar.",
    bg: "#FFFFFF",
    paper: "#FFFFFF",
    ink: "#222222",
    accent: "#FF5A5F",
    taupe: "#717171",
    swatches: ["#FFFFFF", "#F7F7F7", "#EBEBEB", "#FF5A5F", "#222222"],
    displayFont: '"Plus Jakarta Sans", -apple-system, sans-serif',
    bodyFont: '"Plus Jakarta Sans", -apple-system, sans-serif',
    displayWeight: 700,
    eyebrowTransform: "none",
    eyebrowTracking: "0",
  },
  {
    key: "midnight",
    name: "Schokolade",
    tagline: "Sinnlicher Schokoladentraum der Verführung.",
    description: "Fraunces mit Inter, tiefe Kakaobraun-Töne, beige-rosa als zarter Akzent. Warm, intim und unwiderstehlich — ein Statement für Abendsessions und intime Boudoir-Stimmung.",
    bg: "#1F1410",
    paper: "#2A1D17",
    ink: "#EFE3D9",
    accent: "#D4A5A0",
    taupe: "#B0A096",
    swatches: ["#1F1410", "#2A1D17", "#4A352B", "#D4A5A0", "#EFE3D9"],
    displayFont: '"Fraunces", Georgia, serif',
    bodyFont: '"Inter", system-ui, sans-serif',
    displayWeight: 500,
    eyebrowTransform: "uppercase",
    eyebrowTracking: "0.2em",
  },
];

export function ThemePicker({ initial }: { initial: ThemeKey }) {
  const [active, setActive] = useState<ThemeKey>(initial);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<ThemeKey | null>(null);

  function selectTheme(key: ThemeKey) {
    if (key === active || pending) return;
    setPendingKey(key);
    startTransition(async () => {
      try {
        await setUserTheme(key);
        setActive(key);
        const name = THEMES.find((t) => t.key === key)?.name ?? key;
        toast.success(`Theme „${name}" aktiviert`);
        setTimeout(() => window.location.reload(), 250);
      } catch (e: any) {
        toast.error(e?.message ?? "Fehler beim Wechseln des Themes");
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {THEMES.map((t) => {
        const isActive = t.key === active;
        const isPending = pendingKey === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTheme(t.key)}
            disabled={pending}
            aria-pressed={isActive}
            className="text-left transition-all disabled:cursor-progress group"
          >
            <div
              className="rounded-xl2 overflow-hidden border-2 transition-all h-full flex flex-col"
              style={{
                borderColor: isActive ? t.accent : "transparent",
                background: t.bg,
                color: t.ink,
                fontFamily: t.bodyFont,
                boxShadow: isActive
                  ? `0 0 0 1px ${t.accent}, 0 8px 24px rgba(0,0,0,0.06)`
                  : "0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)",
              }}
            >
              {/* Hauptbereich — Name groß im echten Theme-Font */}
              <div className="px-6 py-8 flex-1">
                <div className="flex items-center justify-between mb-6">
                  <div
                    style={{
                      fontFamily: t.bodyFont,
                      fontSize: "10.5px",
                      letterSpacing: t.eyebrowTracking,
                      textTransform: t.eyebrowTransform,
                      color: t.taupe,
                      fontWeight: 700,
                    }}
                  >
                    Theme
                  </div>
                  {isActive && (
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        background: t.accent,
                        color: t.bg,
                        borderRadius: 9999,
                        letterSpacing: "0.04em",
                      }}
                    >
                      <Check size={11} strokeWidth={3} />
                      Aktiv
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    fontFamily: t.displayFont,
                    fontWeight: t.displayWeight,
                    lineHeight: 1.05,
                    letterSpacing: t.key === "studio" ? "-0.02em" : "-0.015em",
                    fontSize: "44px",
                    margin: 0,
                    color: t.ink,
                  }}
                >
                  {t.name}
                </h3>
                <p
                  style={{
                    color: t.taupe,
                    fontFamily: t.bodyFont,
                    fontSize: "13.5px",
                    marginTop: "8px",
                    marginBottom: "24px",
                    lineHeight: 1.5,
                  }}
                >
                  {t.tagline}
                </p>

                {/* Farb-Palette — Border-Hint je nach Hex-Helligkeit, damit
                    weiße/schwarze Swatches auf gleichfarbigem Hintergrund sichtbar bleiben. */}
                <div className="flex items-center gap-1.5">
                  {t.swatches.map((c, i) => {
                    const lum = hexLuminance(c);
                    return (
                      <div
                        key={i}
                        className="w-7 h-7"
                        style={{
                          background: c,
                          borderRadius: 8,
                          border: lum > 0.92 ? "1px solid rgba(0,0,0,0.08)" : "none",
                          boxShadow: lum < 0.18 ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
                        }}
                        aria-label={c}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Beschreibung in App-Theme (lesbar im aktuellen Look) */}
              <div
                className="px-6 py-4 text-xs leading-relaxed"
                style={{
                  background: "rgb(var(--smoke))",
                  borderTop: "1px solid rgb(var(--stone))",
                  color: "rgb(var(--taupe))",
                  fontFamily: "var(--font-body)",
                  fontSize: "12.5px",
                  lineHeight: 1.55,
                }}
              >
                {t.description}
                {isPending && (
                  <div className="flex items-center gap-2 mt-2" style={{ color: "rgb(var(--accent))" }}>
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-[11px]">Wird gewechselt…</span>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Berechnet relative Luminance eines Hex-Codes (0..1) — für UI-Entscheidungen
// (z.B. "Border sichtbar machen, wenn fast-weiß").
function hexLuminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return 0.5;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
