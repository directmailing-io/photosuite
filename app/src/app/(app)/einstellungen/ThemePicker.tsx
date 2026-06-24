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
};

const THEMES: ThemeDef[] = [
  {
    key: "lisa",
    name: "Lisa",
    tagline: "Editorial. Warm. Zurückgenommen.",
    description: "Cormorant Garamond + Open Sans, cremefarbenes Papier, gedecktes Bordeauxrot. Die Vogue-Doppelseite unter den Themes — für stille Eleganz und viel Raum um die Bilder.",
  },
  {
    key: "studio",
    name: "Studio",
    tagline: "Hell, freundlich, großzügig.",
    description: "Plus Jakarta Sans, voll-runde Buttons, Airbnb-Rauschrot. Modern und zugänglich. Cards heben sich beim Hover sanft an, alles wirkt anfassbar.",
  },
  {
    key: "midnight",
    name: "Midnight",
    tagline: "Dunkel wie ein Plattenladen um Mitternacht.",
    description: "Fraunces + Inter, tiefes Anthrazit, warmes Gold als Akzent. Edel, präzise, mit einem schmalen Akzent-Strich am aktiven Menüpunkt. Kein Standard-Darkmode — ein Statement.",
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
        toast.success(`Theme „${THEMES.find((t) => t.key === key)?.name}" aktiviert`);
        // Hard reload, damit das Layout (Server-Component) das neue data-theme rendert.
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
            className="text-left transition-all disabled:cursor-progress"
          >
            <div
              data-theme={t.key}
              className="rounded-xl2 overflow-hidden border-2 transition-all"
              style={{
                borderColor: isActive ? "rgb(var(--accent))" : "rgb(var(--stone))",
                background: "rgb(var(--bg))",
                color: "rgb(var(--ink))",
                fontFamily: "var(--font-body)",
                boxShadow: isActive ? "var(--shadow-md)" : "var(--shadow-soft)",
              }}
            >
              {/* Preview-Bereich — zeigt die Theme-Atmosphäre */}
              <div className="p-5" style={{ background: "rgb(var(--bg))" }}>
                <div className="flex items-center justify-between mb-3">
                  <div
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--eyebrow-size)",
                      letterSpacing: "var(--eyebrow-tracking)",
                      textTransform: "var(--eyebrow-transform)" as any,
                      color: "var(--eyebrow-color)",
                      fontWeight: 700,
                    }}
                  >
                    Theme · {t.key}
                  </div>
                  {isActive && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: "rgb(var(--accent))",
                        color: "rgb(var(--accent-on))",
                        borderRadius: "var(--radius-full)",
                      }}
                    >
                      <Check size={11} strokeWidth={3} />
                      Aktiv
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as any,
                    lineHeight: "var(--display-line)",
                    letterSpacing: "var(--display-tracking)",
                    fontSize: "32px",
                    margin: 0,
                  }}
                >
                  {t.name}
                </h3>
                <p
                  style={{
                    color: "rgb(var(--taupe))",
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    marginTop: "4px",
                    marginBottom: "16px",
                  }}
                >
                  {t.tagline}
                </p>

                {/* Mini-Card im Theme-Look */}
                <div
                  style={{
                    background: "rgb(var(--paper))",
                    border: "1px solid rgb(var(--stone))",
                    borderRadius: "var(--radius-lg)",
                    padding: "14px",
                    boxShadow: "var(--shadow-soft)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      style={{
                        background: "rgb(var(--accent-soft))",
                        color: "rgb(var(--accent))",
                        fontFamily: "var(--font-ui)",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: "var(--radius-full)",
                        letterSpacing: t.key === "midnight" ? "0.08em" : 0,
                        textTransform: t.key === "midnight" ? "uppercase" : "none",
                      }}
                    >
                      Boudoir
                    </span>
                    <span style={{ color: "rgb(var(--taupe))", fontSize: "12px" }}>14:00</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: "var(--display-weight)" as any }}>
                    Anna Kraus
                  </div>
                  <div style={{ color: "rgb(var(--taupe))", fontSize: "12px", marginTop: "2px" }}>
                    Klassik-Paket · Studio
                  </div>
                </div>

                {/* Buttons-Demo */}
                <div className="flex items-center gap-2 mt-4">
                  <span
                    style={{
                      background: "rgb(var(--accent))",
                      color: "rgb(var(--accent-on))",
                      fontFamily: "var(--font-ui)",
                      fontWeight: t.key === "studio" ? 600 : 500,
                      fontSize: "12px",
                      padding: t.key === "studio" ? "8px 18px" : "7px 14px",
                      borderRadius: t.key === "studio" ? "var(--radius-full)" : "var(--radius-md)",
                      letterSpacing: t.key === "studio" ? 0 : "0.03em",
                    }}
                  >
                    Buchen
                  </span>
                  <span
                    style={{
                      background: "rgb(var(--paper))",
                      border: "1px solid rgb(var(--stone))",
                      color: "rgb(var(--ink))",
                      fontFamily: "var(--font-ui)",
                      fontSize: "12px",
                      padding: t.key === "studio" ? "8px 18px" : "7px 14px",
                      borderRadius: t.key === "studio" ? "var(--radius-full)" : "var(--radius-md)",
                    }}
                  >
                    Details
                  </span>
                </div>
              </div>

              {/* Beschreibung im Klartext (immer Default-Theme, lesbar) */}
              <div
                className="px-5 py-4 border-t"
                style={{
                  background: "rgb(var(--smoke))",
                  borderColor: "rgb(var(--stone))",
                  color: "rgb(var(--taupe))",
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
