"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Package as PackageIcon, Layers } from "lucide-react";
import { toast } from "sonner";
import { setPackageMode } from "./actions";

type Mode = "all_in_one" | "modular";

const OPTIONS: Array<{
  key: Mode;
  title: string;
  Icon: typeof PackageIcon;
  tagline: string;
  description: string;
  example: string;
}> = [
  {
    key: "all_in_one",
    title: "Komplettpakete",
    Icon: PackageIcon,
    tagline: "Ein Paket pro Shooting",
    description: "Jedes Paket enthält Aufnahme + Bildauswahl + Lieferung in einem Preis. Klassisch, einfach.",
    example: 'z.B. „Boudoir Classic — 590 €" inkl. 10 bearbeitete Bilder.',
  },
  {
    key: "modular",
    title: "Modular: Anzahlung + Bildpaket",
    Icon: Layers,
    tagline: "Erst Anzahlung, später Bildpaket",
    description: "Kundinnen buchen zunächst ein Anzahlungs-Paket (Solo / Couple / Reise). Das Bildpaket wird bei der Bildauswahl separat gewählt.",
    example: 'z.B. Anzahlung „Solo Bamberg — 150 €" + Bildpaket „10 Bilder — 440 €".',
  },
];

/**
 * Toggle für die Paket-Struktur. Speichert sofort beim Klick.
 * Sicherheit: Server-Action validiert Whitelist serverseitig — Client-Wert ist nur
 * Convenience, keine Trust-Boundary.
 */
export function PackageModePicker({ initial }: { initial: Mode }) {
  const router = useRouter();
  const [active, setActive] = useState<Mode>(initial);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<Mode | null>(null);

  function pick(key: Mode) {
    if (key === active || pending) return;
    setPendingKey(key);
    startTransition(async () => {
      try {
        await setPackageMode(key);
        setActive(key);
        toast.success(
          key === "modular"
            ? "Modular-Struktur aktiviert"
            : "Komplettpaket-Struktur aktiviert",
        );
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht ändern");
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <section className="card p-6 space-y-4">
      <div>
        <div className="eyebrow eyebrow-muted">Paket-Struktur</div>
        <h3 className="font-serif text-xl mt-1">Wie strukturierst du deine Angebote?</h3>
        <p className="text-xs text-smoke mt-1 max-w-2xl">
          Bestimmt, wie Pakete in der Pakete-Übersicht gruppiert werden und welche
          Auswahl Lisa im Shooting-Wizard bekommt. Du kannst jederzeit umschalten.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {OPTIONS.map((o) => {
          const isActive = o.key === active;
          const isPending = pendingKey === o.key;
          const Icon = o.Icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => pick(o.key)}
              disabled={pending}
              aria-pressed={isActive}
              className="text-left rounded-xl border-2 p-4 transition disabled:cursor-progress"
              style={{
                borderColor: isActive ? "rgb(var(--accent))" : "rgb(var(--stone))",
                background: isActive ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: isActive ? "rgb(var(--accent))" : "rgb(var(--linen))",
                    color: isActive ? "rgb(var(--accent-on))" : "rgb(var(--ink))",
                  }}
                >
                  <Icon size={18} />
                </div>
                {isActive && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                    style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-on))" }}
                  >
                    {isPending ? "…" : <><Check size={11} strokeWidth={3} /> Aktiv</>}
                  </span>
                )}
              </div>
              <div className="mt-3 font-medium text-sm" style={{ color: "rgb(var(--ink))" }}>
                {o.title}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgb(var(--taupe))" }}>
                {o.tagline}
              </div>
              <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "rgb(var(--ink))" }}>
                {o.description}
              </p>
              <p className="text-[11px] mt-2 italic" style={{ color: "rgb(var(--taupe))" }}>
                {o.example}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
