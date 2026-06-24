"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, X, ArrowRight, Check } from "lucide-react";
import { dismissOnboarding } from "@/lib/onboardingActions";

type Step = {
  key: string;
  label: string;
  href: string;
  done: boolean;
};

/**
 * Onboarding-Banner: erscheint nach Sign-Up und führt durch die Erstkonfiguration.
 * Schritte sind tatsächlich-erledigt-checks aus der DB (z.B. „hat User mind. 1 Paket?").
 * Lisa kann ihn dauerhaft schließen — kommt nicht zurück.
 */
export function OnboardingBanner({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  function onDismiss() {
    if (!allDone && !confirm("Onboarding wirklich ausblenden? Du kannst es nicht wieder einblenden.")) return;
    startTransition(async () => {
      await dismissOnboarding();
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="card px-4 py-2 mb-6 flex items-center gap-2 text-xs text-smoke hover:text-ink transition"
      >
        <Sparkles size={12} style={{ color: "rgb(var(--accent))" }} />
        Onboarding ({doneCount} von {steps.length} erledigt) — wieder anzeigen
      </button>
    );
  }

  return (
    <div
      className="card p-6 mb-6 relative"
      style={{ background: "linear-gradient(135deg, rgb(var(--accent-soft)) 0%, rgb(var(--paper)) 100%)", borderColor: "rgb(var(--accent))" }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="eyebrow flex items-center gap-1.5" style={{ color: "rgb(var(--accent))" }}>
            <Sparkles size={12} /> Willkommen
          </div>
          <h2 className="font-serif text-2xl mt-1 leading-tight">
            Richte dein Studio in {steps.length} Schritten ein
          </h2>
          <div className="text-sm text-smoke mt-1">
            {allDone
              ? "Alles erledigt! Du kannst das Onboarding jetzt ausblenden."
              : `${doneCount} von ${steps.length} erledigt — die restlichen Schritte machen den Einstieg leichter.`}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setCollapsed(true)}
            className="btn-icon"
            title="Minimieren"
            disabled={pending}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 p-3 rounded-lg border transition hover:bg-paper"
              style={{
                borderColor: step.done ? "rgba(120, 167, 119, 0.4)" : "rgb(var(--stone))",
                background: step.done ? "rgba(120, 167, 119, 0.08)" : "rgb(var(--paper))",
                opacity: step.done ? 0.7 : 1,
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: step.done ? "rgb(70, 115, 70)" : "rgb(var(--linen))",
                  color: step.done ? "#fff" : "rgb(var(--smoke))",
                }}
              >
                {step.done ? <Check size={13} /> : <span className="text-xs font-medium">{steps.indexOf(step) + 1}</span>}
              </div>
              <span className={`text-sm flex-1 ${step.done ? "line-through" : "font-medium"}`}>
                {step.label}
              </span>
              {!step.done && <ArrowRight size={14} className="text-smoke" />}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-3 border-t border-stone/60 flex items-center justify-between">
        <div className="text-xs text-smoke">
          {allDone
            ? "Du brauchst das Banner nicht mehr."
            : "Wenn du das Banner nicht brauchst, kannst du es dauerhaft ausblenden."}
        </div>
        <button
          onClick={onDismiss}
          disabled={pending}
          className="btn-ghost text-xs h-8"
          style={{ color: allDone ? "rgb(var(--accent))" : "rgb(var(--smoke))" }}
        >
          {pending ? "…" : allDone ? "Fertig — Banner ausblenden" : "Banner dauerhaft ausblenden"}
        </button>
      </div>
    </div>
  );
}
