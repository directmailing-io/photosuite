"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, CheckCircle2 } from "lucide-react";
import { Field, FormRow } from "@/components/form/Field";
import { submitPublicLead } from "./actions";

export function LeadForm({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitPublicLead(slug, fd);
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(res.reason);
        toast.error("Konnte nicht gesendet werden", { description: res.reason });
      }
    });
  }

  if (submitted) {
    return (
      <div className="card p-8 text-center">
        <CheckCircle2 size={48} strokeWidth={1.25} className="mx-auto" style={{ color: "rgb(var(--success))" }} />
        <h2 className="font-serif text-2xl mt-4">Danke, ich habe dich!</h2>
        <p className="text-sm text-smoke mt-2 leading-relaxed">
          Deine Anfrage ist angekommen. Ich melde mich in den nächsten Tagen persönlich
          bei dir per E-Mail — schau bitte auch gern in deinen Spam-Ordner.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      {/* Honeypot — versteckt für Menschen, bots tappen rein */}
      <input
        type="text"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-10000px", height: 0, width: 0, opacity: 0 }}
        aria-hidden="true"
      />

      <FormRow>
        <Field label="Vorname *">
          <input name="firstName" required maxLength={100} className="input" />
        </Field>
        <Field label="Nachname">
          <input name="lastName" maxLength={100} className="input" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="E-Mail *">
          <input name="email" type="email" required maxLength={200} className="input" />
        </Field>
        <Field label="Telefon" hint="Optional — für Rückruf">
          <input name="phone" maxLength={50} className="input" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Wofür interessierst du dich?">
          <input name="packageInterest" maxLength={100} placeholder="z.B. Boudoir, Akt, Couple, Paket-XY" className="input" />
        </Field>
        <Field label="Wunsch-Zeitraum" hint="Wann hättest du Zeit?">
          <input name="preferredDate" maxLength={30} placeholder="z.B. Frühjahr 2026, KW 12" className="input" />
        </Field>
      </FormRow>

      <Field label="Nachricht" hint="Erzähl mir kurz, was du dir vorstellst.">
        <textarea name="message" rows={4} maxLength={3000} className="textarea" placeholder="Warum möchtest du ein Shooting? Wie möchtest du dich auf deinen Bildern sehen?" />
      </Field>

      <Field label="Wie hast du mich gefunden?">
        <input name="source" maxLength={100} placeholder="Instagram, Empfehlung von …, Google" className="input" />
      </Field>

      {error && (
        <div
          className="text-xs p-3 rounded-lg"
          style={{
            background: "rgb(var(--accent-soft))",
            color: "rgb(var(--accent-deep))",
            border: "1px solid rgb(var(--accent) / 0.4)",
          }}
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-accent w-full">
        <Send size={15} /> {pending ? "Sende…" : "Anfrage senden"}
      </button>
    </form>
  );
}
