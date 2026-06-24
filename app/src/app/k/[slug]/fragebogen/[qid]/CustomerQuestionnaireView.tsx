"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft, Check, Send, Star, Upload, FileText, Image as ImageIcon, X,
  Loader2, CheckCircle2,
} from "lucide-react";
import { saveAnswers, trackOpen, uploadAnswerFile } from "./actions";
import { compressImage } from "./compressImage";

type FieldUI = {
  id: string;
  type: string;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string[] | null;
};

type Props = {
  slug: string;
  qid: string;
  title: string;
  description: string | null;
  status: string;
  submittedAt: string | null;
  coverUrl: string | null;
  customerFirstName: string;
  studioName: string | null;
  fields: FieldUI[];
  initialAnswers: Record<string, any>;
};

export function CustomerQuestionnaireView(props: Props) {
  const { slug, qid, status, fields, initialAnswers, customerFirstName, title, description, coverUrl, studioName } = props;

  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(status === "SUBMITTED");
  const dirtyRef = useRef(false);

  // Open-Tracking + Auto-Save
  useEffect(() => {
    trackOpen(slug, qid).catch(() => {});
  }, [slug, qid]);

  const saveDraft = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaving(true);
    try {
      const payload = fields.map((f) => ({ fieldId: f.id, type: f.type, value: answers[f.id] ?? null }));
      await saveAnswers(slug, qid, payload, false);
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  }, [fields, answers, slug, qid]);

  // debounced auto-save
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => { saveDraft(); }, 1500);
    return () => clearTimeout(t);
  }, [answers, done, saveDraft]);

  // save on tab close
  useEffect(() => {
    function onBeforeUnload() {
      if (dirtyRef.current) saveDraft();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveDraft]);

  function setVal(id: string, v: any) {
    dirtyRef.current = true;
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  // Progress
  const filledCount = fields.filter((f) => {
    const v = answers[f.id];
    if (v == null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;
  const requiredMissing = fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = answers[f.id];
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    });

  async function onSubmit() {
    if (requiredMissing.length > 0) {
      toast.error(`Bitte fülle: ${requiredMissing[0].label}`);
      const el = document.getElementById(`field-${requiredMissing[0].id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = fields.map((f) => ({ fieldId: f.id, type: f.type, value: answers[f.id] ?? null }));
      await saveAnswers(slug, qid, payload, true);
      setDone(true);
      toast.success("Vielen Dank! Wir haben alles erhalten.");
    } catch (e: any) {
      toast.error(e?.message ?? "Konnte nicht absenden");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ReadOnlyView
        slug={slug}
        title={props.title}
        description={props.description}
        coverUrl={coverUrl}
        customerFirstName={customerFirstName}
        studioName={studioName}
        submittedAt={props.submittedAt}
        fields={fields}
        answers={answers}
      />
    );
  }

  const progress = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-bg">
      {/* Sticky Progress */}
      <div className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm border-b border-stone/60">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link href={`/k/${slug}`} className="text-xs text-smoke hover:text-ink flex items-center gap-1 shrink-0">
            <ChevronLeft size={13} /> Zurück
          </Link>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-linen overflow-hidden">
              <div className="h-full transition-all duration-500" style={{ background: "rgb(var(--accent))", width: `${progress}%` }} />
            </div>
          </div>
          <div className="text-xs text-smoke tabular-nums shrink-0">
            {filledCount}/{fields.length}
          </div>
          <div className="text-[11px] text-smoke shrink-0 w-20 text-right">
            {saving ? (
              <span className="flex items-center gap-1 justify-end"><Loader2 size={11} className="animate-spin" /> Speichert</span>
            ) : (
              <span className="flex items-center gap-1 justify-end opacity-60"><Check size={11} /> Gespeichert</span>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative isolate overflow-hidden" style={{ minHeight: "40vh" }}>
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: coverUrl
              ? `url("${coverUrl}") center/cover no-repeat`
              : "linear-gradient(135deg, #19191A 0%, #2a2526 100%)",
          }}
        />
        <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(25,25,26,0.6) 0%, rgba(25,25,26,0.85) 100%)" }} />
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 min-h-[40vh] flex flex-col justify-end" style={{ color: "rgb(var(--bg))" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.85)" }}>Fragebogen</div>
          <h1 className="font-serif font-medium mt-3 leading-[1.05]" style={{ fontSize: "clamp(36px, 5.5vw, 56px)" }}>
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-xl text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.92)" }}>
              {description}
            </p>
          ) : (
            <p className="mt-5 max-w-xl text-base" style={{ color: "rgba(255,255,255,0.85)" }}>
              Hi {customerFirstName} — wir freuen uns auf das Shooting. Beantworte uns vorher noch ein paar Dinge, damit alles perfekt vorbereitet ist.
            </p>
          )}
          <div className="text-xs mt-4 opacity-75">
            ~{Math.max(1, Math.ceil(fields.length * 0.5))} Min · {fields.length} {fields.length === 1 ? "Frage" : "Fragen"} · Alles wird automatisch gespeichert
          </div>
        </div>
      </section>

      {/* Felder */}
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        {fields.map((f, idx) => (
          <FieldBlock
            key={f.id}
            index={idx + 1}
            field={f}
            value={answers[f.id]}
            onChange={(v) => setVal(f.id, v)}
            slug={slug}
            qid={qid}
          />
        ))}

        <div className="card p-6 text-center space-y-4 mt-12">
          <div className="font-serif text-2xl">Alles ausgefüllt?</div>
          <p className="text-sm text-smoke max-w-md mx-auto">
            Wenn du auf Absenden klickst, schickst du uns deine Antworten. Du kannst danach nichts mehr ändern.
          </p>
          {requiredMissing.length > 0 && (
            <div className="text-xs text-accent">
              Es {requiredMissing.length === 1 ? "fehlt noch 1 Pflichtfeld" : `fehlen noch ${requiredMissing.length} Pflichtfelder`}.
            </div>
          )}
          <button
            onClick={onSubmit}
            disabled={submitting || requiredMissing.length > 0}
            className="btn-accent text-base px-8 h-12 disabled:opacity-50"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Wird gesendet…</> : <><Send size={16} /> Absenden</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyView({
  slug, title, description, coverUrl, customerFirstName, studioName, submittedAt, fields, answers,
}: {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  customerFirstName: string;
  studioName: string | null;
  submittedAt: string | null;
  fields: FieldUI[];
  answers: Record<string, any>;
}) {
  return (
    <div className="min-h-screen bg-bg">
      {/* Top-Bar */}
      <div className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm border-b border-stone/60">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href={`/k/${slug}`} className="text-xs text-smoke hover:text-ink flex items-center gap-1">
            <ChevronLeft size={13} /> Zurück
          </Link>
          <div className="flex-1" />
          <span className="badge" style={{ background: "rgb(var(--ink))", color: "rgb(var(--bg))", border: "none" }}>
            <CheckCircle2 size={11} /> Abgeschickt
          </span>
        </div>
      </div>

      {/* Hero */}
      <section className="relative isolate overflow-hidden" style={{ minHeight: "30vh" }}>
        <div className="absolute inset-0 -z-10" style={{
          background: coverUrl ? `url("${coverUrl}") center/cover no-repeat` : "linear-gradient(135deg, #19191A 0%, #2a2526 100%)",
        }} />
        <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(25,25,26,0.6) 0%, rgba(25,25,26,0.85) 100%)" }} />
        <div className="max-w-2xl mx-auto px-6 pt-12 pb-10 min-h-[30vh] flex flex-col justify-end" style={{ color: "rgb(var(--bg))" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.85)" }}>
            <CheckCircle2 size={12} className="inline mr-1.5" /> Vielen Dank, {customerFirstName}
          </div>
          <h1 className="font-serif font-medium mt-3 leading-[1.05]" style={{ fontSize: "clamp(30px, 4.5vw, 44px)" }}>
            {title}
          </h1>
          <div className="text-sm mt-3 opacity-85">
            Hier sind deine Antworten als Übersicht — falls dir später noch etwas einfällt, melde dich gern direkt bei uns.
            {submittedAt && <span className="block mt-1 opacity-70">Abgeschickt am {new Date(submittedAt).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</span>}
          </div>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-5">
        {fields.map((f, idx) => (
          <ReadOnlyField key={f.id} index={idx + 1} field={f} value={answers[f.id]} />
        ))}
        {studioName && (
          <div className="text-center text-xs text-smoke pt-8">— {studioName}</div>
        )}
      </div>
    </div>
  );
}

function ReadOnlyField({ index, field, value }: { index: number; field: FieldUI; value: any }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-smoke font-mono mb-2 tabular-nums">Frage {String(index).padStart(2, "0")}</div>
      <div className="font-serif text-lg leading-snug mb-3">{field.label}</div>
      <ReadOnlyAnswer field={field} value={value} />
    </div>
  );
}

function ReadOnlyAnswer({ field, value }: { field: FieldUI; value: any }) {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) {
    return <div className="text-sm text-smoke italic">— keine Antwort</div>;
  }
  switch (field.type) {
    case "TEXT":
    case "EMAIL":
    case "PHONE":
    case "SELECT_SINGLE":
      return <div className="text-base text-ink">{String(value)}</div>;
    case "TEXTAREA":
      return <div className="text-base text-ink whitespace-pre-wrap leading-relaxed">{String(value)}</div>;
    case "NUMBER":
      return <div className="text-base text-ink tabular-nums">{String(value)}</div>;
    case "DATE":
      return <div className="text-base text-ink">{new Date(value).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</div>;
    case "YES_NO":
      return <div className="text-base text-ink">{value ? "Ja" : "Nein"}</div>;
    case "RATING":
      return (
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map((n) => (
            <Star key={n} size={20} className={n <= Number(value) ? "text-accent fill-accent" : "text-stone"} />
          ))}
          <span className="text-sm text-smoke ml-2">{value} von 5</span>
        </div>
      );
    case "SELECT_MULTI":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((v, i) => (
            <span key={i} className="badge" style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}>{v}</span>
          ))}
        </div>
      );
    case "FILE":
      const isImg = value.mimeType?.startsWith("image/");
      return (
        <a href={value.url} target="_blank" className="inline-flex items-center gap-3 p-3 rounded-lg border border-stone hover:bg-linen transition">
          {isImg ? (
            <img src={value.url} className="w-12 h-12 rounded object-cover" />
          ) : (
            <FileText size={32} className="text-taupe" />
          )}
          <div>
            <div className="text-sm font-medium hover:underline">{value.filename}</div>
            <div className="text-xs text-smoke">{Math.round((value.sizeBytes ?? 0) / 1024)} KB</div>
          </div>
        </a>
      );
    default:
      return <div className="text-sm text-smoke">{String(value)}</div>;
  }
}

// ============= FIELDS =============

function FieldBlock({ index, field, value, onChange, slug, qid }: {
  index: number;
  field: FieldUI;
  value: any;
  onChange: (v: any) => void;
  slug: string;
  qid: string;
}) {
  return (
    <div id={`field-${field.id}`} className="card p-6 scroll-mt-32">
      <div className="text-xs text-smoke font-mono mb-2 tabular-nums">Frage {String(index).padStart(2, "0")}{field.required && <span className="text-accent ml-1">·  Pflicht</span>}</div>
      <label className="font-serif text-xl md:text-2xl leading-snug block mb-1">{field.label}</label>
      {field.helpText && <div className="text-sm text-smoke mb-4">{field.helpText}</div>}
      <div className="mt-4">
        <FieldInput field={field} value={value} onChange={onChange} slug={slug} qid={qid} />
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange, slug, qid }: {
  field: FieldUI; value: any; onChange: (v: any) => void; slug: string; qid: string;
}) {
  switch (field.type) {
    case "TEXT":
      return <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />;
    case "TEXTAREA":
      return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={5} className="textarea" />;
    case "NUMBER":
      return <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="input" />;
    case "EMAIL":
      return <input type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="du@beispiel.de" className="input" />;
    case "PHONE":
      return <input type="tel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="+49 …" className="input" />;
    case "DATE":
      return <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />;
    case "YES_NO":
      return <YesNo value={value} onChange={onChange} />;
    case "RATING":
      return <Rating value={value} onChange={onChange} />;
    case "SELECT_SINGLE":
      return <SelectSingle options={field.options ?? []} value={value} onChange={onChange} />;
    case "SELECT_MULTI":
      return <SelectMulti options={field.options ?? []} value={value ?? []} onChange={onChange} />;
    case "FILE":
      return <FileField field={field} value={value} onChange={onChange} slug={slug} qid={qid} />;
    default:
      return <div className="text-sm text-smoke">Unbekannter Feldtyp</div>;
  }
}

function YesNo({ value, onChange }: { value: any; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { v: true, label: "Ja" },
        { v: false, label: "Nein" },
      ].map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className="card p-5 text-center text-base font-medium transition"
            style={{
              borderColor: active ? "rgb(var(--accent))" : "rgb(var(--stone))",
              background: active ? "rgb(var(--accent))" : "rgb(var(--paper))",
              color: active ? "#fff" : "rgb(var(--ink))",
              boxShadow: active ? "0 0 0 3px rgba(200,16,46,0.12)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Rating({ value, onChange }: { value: any; onChange: (v: number) => void }) {
  const v = Number(value) || 0;
  const [hover, setHover] = useState(0);
  const show = hover || v;
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-1 transition-transform hover:scale-110"
          aria-label={`${n} Sterne`}
        >
          <Star
            size={36}
            strokeWidth={1.5}
            className={n <= show ? "text-accent fill-accent" : "text-stone"}
          />
        </button>
      ))}
      {v > 0 && <span className="text-sm text-smoke ml-3">{v} von 5</span>}
    </div>
  );
}

function SelectSingle({ options, value, onChange }: { options: string[]; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="w-full text-left p-4 rounded-xl2 border flex items-center gap-3 transition"
            style={{
              borderColor: active ? "rgb(var(--accent))" : "rgb(var(--stone))",
              background: active ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
              boxShadow: active ? "0 0 0 2px rgba(200,16,46,0.15)" : "none",
            }}
          >
            <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: active ? "rgb(var(--accent))" : "rgb(var(--stone))" }}>
              {active && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
            </span>
            <span className="text-sm">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function SelectMulti({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  }
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className="w-full text-left p-4 rounded-xl2 border flex items-center gap-3 transition"
            style={{
              borderColor: active ? "rgb(var(--accent))" : "rgb(var(--stone))",
              background: active ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
              boxShadow: active ? "0 0 0 2px rgba(200,16,46,0.15)" : "none",
            }}
          >
            <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
              style={{
                borderColor: active ? "rgb(var(--accent))" : "rgb(var(--stone))",
                background: active ? "rgb(var(--accent))" : "transparent",
              }}>
              {active && <Check size={13} className="text-white" strokeWidth={3} />}
            </span>
            <span className="text-sm">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function FileField({ field, value, onChange, slug, qid }: {
  field: FieldUI; value: any; onChange: (v: any) => void; slug: string; qid: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let upload: File = file;
      if (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif") {
        setProgress("Bild wird komprimiert…");
        upload = await compressImage(file, 2000, 0.82);
      }
      setProgress("Wird hochgeladen…");
      const fd = new FormData();
      fd.append("file", upload, upload.name);
      const result = await uploadAnswerFile(slug, qid, field.id, fd);
      onChange(result);
      toast.success("Datei hochgeladen");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeFile() {
    onChange(null);
  }

  if (value && value.url) {
    const isImage = value.mimeType?.startsWith("image/");
    return (
      <div className="card p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-lg bg-linen overflow-hidden shrink-0 flex items-center justify-center">
          {isImage ? <img src={value.url} className="w-full h-full object-cover" /> : <FileText size={28} className="text-taupe" />}
        </div>
        <div className="flex-1 min-w-0">
          <a href={value.url} target="_blank" className="text-sm font-medium hover:underline truncate block">{value.filename}</a>
          <div className="text-xs text-smoke">{Math.round((value.sizeBytes ?? 0) / 1024)} KB</div>
        </div>
        <button onClick={removeFile} className="btn-icon" title="Entfernen"><X size={16} /></button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={onFile}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full p-6 rounded-xl2 border-2 border-dashed flex flex-col items-center justify-center gap-2 transition hover:border-ink/40"
        style={{ borderColor: "rgb(var(--stone))", background: "rgb(var(--paper))" }}
      >
        {uploading ? <Loader2 size={28} className="animate-spin text-taupe" /> : <Upload size={28} className="text-taupe" />}
        <div className="text-sm font-medium">{uploading ? progress : "Datei auswählen"}</div>
        {!uploading && <div className="text-xs text-smoke">JPG, PNG, WebP oder PDF · max 10 MB · Bilder werden automatisch komprimiert</div>}
      </button>
    </div>
  );
}
