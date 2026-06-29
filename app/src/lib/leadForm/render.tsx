/**
 * Geteilte Render-Logik für ein LeadForm — wird sowohl von /anfrage/[slug]
 * (mit Studio-Header) als auch von /embed/[id] (schlank, iframe-tauglich) genutzt.
 *
 * Verarbeitet das Submit-Result und zeigt die Erfolgs- / Fehler-Meldung.
 */
"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { submitPublicLeadForm } from "./submit";

export type PublicField = {
  id: string;
  type: string;
  systemKey: string | null;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  required: boolean;
  options: string[] | null;
};

export type PublicForm = {
  id: string;
  slug: string;
  headline: string | null;
  intro: string | null;
  buttonText: string;
  successMessage: string | null;
  accentColor: string;
  fontStyle: string;
  background: string;
  fields: PublicField[];
};

const BG_MAP: Record<string, string> = {
  paper: "#FBFAF7",
  linen: "#F3EFEC",
  transparent: "transparent",
};

export function LeadFormRender({
  form,
  isEmbed = false,
}: {
  form: PublicForm;
  isEmbed?: boolean;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // ResizeObserver für iframe-Höhe (postMessage an Parent-Page)
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isEmbed) return;
    const send = () => {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "photosuite-resize", formId: form.id, height: h }, "*");
    };
    send();
    const ro = new ResizeObserver(send);
    if (containerRef.current) ro.observe(containerRef.current);
    // Initial-Update verzögert nach Layout
    const t = setTimeout(send, 100);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [isEmbed, form.id, submitted]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitPublicLeadForm(form.id, fd);
      if (res.ok) setSubmitted(true);
      else setError(res.message ?? "Etwas ist schiefgelaufen — bitte später erneut versuchen.");
    });
  }

  const fontFamily = form.fontStyle === "serif" ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, sans-serif";
  const bg = BG_MAP[form.background] ?? "#FBFAF7";

  if (submitted) {
    return (
      <div
        ref={containerRef}
        className="px-6 py-12 text-center"
        style={{ background: bg, fontFamily }}
      >
        <div
          className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-4"
          style={{ background: form.accentColor, color: "#fff", fontSize: 28 }}
        >
          ✓
        </div>
        <h2 className="text-2xl font-semibold mb-2" style={{ color: "#19191A" }}>
          Vielen Dank!
        </h2>
        <p className="text-sm max-w-md mx-auto" style={{ color: "#7D7878" }}>
          {form.successMessage ?? "Wir haben deine Anfrage erhalten und melden uns bald."}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-6 py-8" style={{ background: bg, fontFamily }}>
      <div className="max-w-xl mx-auto">
        {form.headline && (
          <h1 className="text-2xl mb-2" style={{ fontWeight: 700, color: "#19191A" }}>
            {form.headline}
          </h1>
        )}
        {form.intro && (
          <p className="text-sm mb-6 leading-relaxed" style={{ color: "#5C5654" }}>
            {form.intro}
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Honeypot — versteckt vor echten Nutzer:innen */}
          <input
            type="text"
            name="_honeypot"
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: -10000, opacity: 0, pointerEvents: "none" }}
          />
          {form.fields.map((f) => (
            <FieldRenderer key={f.id} field={f} accent={form.accentColor} />
          ))}
          {error && (
            <div
              className="text-sm p-3 rounded"
              style={{ background: "#FBE9EC", color: "#C8102E", border: "1px solid #C8102E" }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded py-3 px-5 text-sm font-medium transition disabled:opacity-50"
            style={{ background: form.accentColor, color: "#fff" }}
          >
            {pending ? "Wird gesendet…" : form.buttonText}
          </button>
          <div className="text-xs text-center" style={{ color: "#9A938F" }}>
            Übermittelt via Photosuite
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldRenderer({ field, accent }: { field: PublicField; accent: string }) {
  const focusStyle = {
    "--tw-ring-color": accent,
    borderColor: "#CFCEC9",
    background: "#fff",
  } as React.CSSProperties;
  const name = `field_${field.id}`;
  const labelEl = (
    <label htmlFor={name} className="block text-sm mb-1" style={{ color: "#19191A", fontWeight: 500 }}>
      {field.label}
      {field.required && <span style={{ color: accent }}> *</span>}
    </label>
  );
  const helpEl = field.helpText ? (
    <div className="text-xs mt-1" style={{ color: "#7D7878" }}>{field.helpText}</div>
  ) : null;
  const baseInputClass = "w-full px-3 py-2 rounded border text-sm focus:outline-none focus:ring-2";

  switch (field.type) {
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            id={name}
            name={name}
            required={field.required}
            placeholder={field.placeholder ?? ""}
            rows={4}
            style={focusStyle}
            className={baseInputClass}
          />
          {helpEl}
        </div>
      );
    case "select":
      return (
        <div>
          {labelEl}
          <select id={name} name={name} required={field.required} style={focusStyle} className={baseInputClass}>
            <option value="">{field.placeholder ?? "Bitte wählen…"}</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {helpEl}
        </div>
      );
    case "consent":
      return (
        <label className="flex items-start gap-2 text-sm cursor-pointer" htmlFor={name}>
          <input
            type="checkbox"
            id={name}
            name={name}
            required={field.required}
            className="mt-0.5 w-4 h-4 shrink-0"
            style={{ accentColor: accent }}
          />
          <span style={{ color: "#19191A" }}>
            {field.label}
            {field.required && <span style={{ color: accent }}> *</span>}
          </span>
        </label>
      );
    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            id={name}
            name={name}
            required={field.required}
            style={focusStyle}
            className={baseInputClass}
          />
          {helpEl}
        </div>
      );
    case "email":
    case "phone":
    case "text":
    default: {
      const type = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
      return (
        <div>
          {labelEl}
          <input
            type={type}
            id={name}
            name={name}
            required={field.required}
            placeholder={field.placeholder ?? ""}
            autoComplete={
              field.systemKey === "firstName" ? "given-name" :
              field.systemKey === "lastName" ? "family-name" :
              field.systemKey === "email" ? "email" :
              field.systemKey === "phone" ? "tel" : undefined
            }
            style={focusStyle}
            className={baseInputClass}
          />
          {helpEl}
        </div>
      );
    }
  }
}
