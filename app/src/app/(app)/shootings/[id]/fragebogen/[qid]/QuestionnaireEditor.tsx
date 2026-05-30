"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Pencil, Send, Lock, Copy, Check, ArrowUp, ArrowDown, Eye, Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateQuestionnaireMeta,
  deleteQuestionnaire,
  sendQuestionnaire,
  reopenQuestionnaire,
  addField,
  updateField,
  deleteField,
  moveField,
} from "../../questionnaireActions";
import { FIELD_TYPES, type FieldType } from "@/lib/questionnaire";
import { formatDateTime } from "@/lib/utils";

type FieldUI = {
  id: string;
  type: string;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string | null;
};
type AnswerUI = {
  fieldId: string;
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  boolValue: boolean | null;
  jsonValue: string | null;
};

type Props = {
  questionnaireId: string;
  initial: {
    title: string;
    description: string | null;
    status: string;
    sentAt: string | null;
    openedAt: string | null;
    lastSavedAt: string | null;
    submittedAt: string | null;
  };
  fields: FieldUI[];
  answers: AnswerUI[];
  publicUrl: string | null;
};

export function QuestionnaireEditor({ questionnaireId, initial, fields, answers, publicUrl }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [addingField, setAddingField] = useState(false);

  const submitted = initial.status === "SUBMITTED";
  const sent = initial.status !== "DRAFT";

  async function onSaveMeta(fd: FormData) {
    await updateQuestionnaireMeta(questionnaireId, fd);
    setEditingMeta(false);
    toast.success("Gespeichert");
    router.refresh();
  }
  async function onSend() {
    setBusy(true);
    try {
      await sendQuestionnaire(questionnaireId);
      toast.success("Bogen ist jetzt für die Kundin freigegeben");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Konnte nicht versenden");
    }
    setBusy(false);
  }
  async function onReopen() {
    setBusy(true);
    try {
      await reopenQuestionnaire(questionnaireId);
      toast.success("Bogen wieder als Entwurf");
      router.refresh();
    } finally { setBusy(false); }
  }
  async function onDelete() {
    if (!confirm("Fragebogen wirklich löschen?")) return;
    setBusy(true);
    try { await deleteQuestionnaire(questionnaireId); } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error("Konnte nicht löschen");
      setBusy(false);
    }
  }
  async function onCopyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`);
      toast.success("Link kopiert");
    } catch { toast.error("Konnte nicht kopieren"); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Meta */}
        <section className="card p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="eyebrow eyebrow-muted">Titel & Begrüßung</div>
            {!editingMeta && !submitted && (
              <button onClick={() => setEditingMeta(true)} className="btn-icon"><Pencil size={13} /></button>
            )}
          </div>
          {editingMeta ? (
            <form onSubmit={(e) => { e.preventDefault(); onSaveMeta(new FormData(e.currentTarget)); }} className="space-y-3">
              <input name="title" defaultValue={initial.title} className="input" required />
              <textarea name="description" defaultValue={initial.description ?? ""} rows={3} placeholder="Optionaler Begrüßungstext für die Kundin" className="textarea" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setEditingMeta(false)} className="btn-ghost">Abbrechen</button>
                <button className="btn-primary">Speichern</button>
              </div>
            </form>
          ) : (
            <>
              <div className="font-serif text-2xl">{initial.title}</div>
              {initial.description && <div className="text-sm text-smoke mt-2 whitespace-pre-wrap">{initial.description}</div>}
            </>
          )}
        </section>

        {/* Felder */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow eyebrow-muted">Fragen</div>
            {!submitted && (
              <button onClick={() => setAddingField(true)} className="btn-secondary text-xs h-8">
                <Plus size={13} /> Frage hinzufügen
              </button>
            )}
          </div>

          {fields.length === 0 && !addingField && (
            <div className="text-sm text-smoke text-center py-8">
              Noch keine Fragen. Klick rechts oben auf „Frage hinzufügen".
            </div>
          )}

          <ol className="space-y-3">
            {fields.map((f, idx) => {
              const ans = answers.find((a) => a.fieldId === f.id);
              return (
                <FieldRow
                  key={f.id}
                  index={idx}
                  total={fields.length}
                  field={f}
                  answer={ans}
                  locked={submitted}
                  onUpdate={() => router.refresh()}
                />
              );
            })}
          </ol>

          {addingField && (
            <FieldForm
              onCancel={() => setAddingField(false)}
              onSubmit={async (fd) => {
                try { await addField(questionnaireId, fd); }
                catch (e: any) { toast.error(e?.message ?? "Fehler"); return; }
                setAddingField(false);
                toast.success("Frage hinzugefügt");
                router.refresh();
              }}
            />
          )}
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button onClick={onDelete} className="btn-ghost" style={{ color: "var(--accent)" }} disabled={busy}>
            <Trash2 size={15} /> Löschen
          </button>
          <div className="flex gap-2">
            {submitted ? (
              <span className="text-sm text-smoke italic">Abgeschickt — keine Änderungen mehr möglich.</span>
            ) : sent ? (
              <button onClick={onReopen} className="btn-secondary" disabled={busy}>
                <Lock size={15} /> Auf Entwurf zurücksetzen
              </button>
            ) : (
              <button onClick={onSend} className="btn-accent" disabled={busy || fields.length === 0}>
                <Send size={15} /> Für Kundin freigeben
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar: Status + Link + Antworten */}
      <div className="space-y-5">
        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Status</div>
          <ul className="space-y-2 text-sm">
            <Timeline label="Erstellt" date={null} active />
            <Timeline label="Versendet" date={initial.sentAt} active={!!initial.sentAt} />
            <Timeline label="Geöffnet" date={initial.openedAt} active={!!initial.openedAt} />
            <Timeline label="Zwischengespeichert" date={initial.lastSavedAt} active={!!initial.lastSavedAt} muted />
            <Timeline label="Abgeschickt" date={initial.submittedAt} active={!!initial.submittedAt} accent />
          </ul>
        </div>

        {publicUrl && sent && (
          <div className="card p-5">
            <div className="eyebrow eyebrow-muted mb-3">Link für die Kundin</div>
            <div className="text-xs text-smoke break-all bg-linen/60 p-2 rounded mb-3 font-mono">{publicUrl}</div>
            <button onClick={onCopyLink} className="btn-secondary w-full">
              <Copy size={14} /> Link kopieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ label, date, active, accent, muted }: { label: string; date: string | null; active: boolean; accent?: boolean; muted?: boolean }) {
  const color = accent ? "var(--accent)" : muted ? "var(--smoke)" : "var(--ink)";
  return (
    <li className="flex items-start gap-3">
      <span
        className="w-2 h-2 rounded-full mt-2 shrink-0"
        style={{ background: active ? color : "var(--stone)" }}
      />
      <div className="flex-1">
        <div className={active ? "text-ink" : "text-smoke"}>{label}</div>
        {date && <div className="text-[11px] text-smoke">{formatDateTime(date)}</div>}
        {!date && active && <div className="text-[11px] text-smoke">jetzt</div>}
      </div>
    </li>
  );
}

function FieldRow({
  index, total, field, answer, locked, onUpdate,
}: {
  index: number; total: number; field: FieldUI; answer?: AnswerUI; locked: boolean; onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const typeMeta = FIELD_TYPES.find((t) => t.value === field.type);

  async function onMove(dir: "up" | "down") {
    await moveField(field.id, dir);
    onUpdate();
  }
  async function onDel() {
    if (!confirm("Frage löschen?")) return;
    await deleteField(field.id);
    onUpdate();
  }

  if (editing) {
    return (
      <li>
        <FieldForm
          initial={field}
          onCancel={() => setEditing(false)}
          onSubmit={async (fd) => {
            try { await updateField(field.id, fd); }
            catch (e: any) { toast.error(e?.message ?? "Fehler"); return; }
            setEditing(false);
            onUpdate();
          }}
        />
      </li>
    );
  }

  return (
    <li className="card p-4 group">
      <div className="flex items-start gap-3">
        <div className="text-xs text-smoke font-mono mt-1 tabular-nums w-6 shrink-0">{String(index + 1).padStart(2, "0")}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-sm">
              {field.label}
              {field.required && <span className="text-accent ml-0.5">*</span>}
            </div>
            <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)" }}>
              {typeMeta?.label ?? field.type}
            </span>
          </div>
          {field.helpText && <div className="text-xs text-smoke mt-1">{field.helpText}</div>}
          {(field.type === "SELECT_SINGLE" || field.type === "SELECT_MULTI") && field.options && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(JSON.parse(field.options) as string[]).map((o, i) => (
                <span key={i} className="badge" style={{ background: "var(--bg)", color: "var(--smoke)", border: "1px solid var(--stone)" }}>
                  {o}
                </span>
              ))}
            </div>
          )}
          {answer && <AnswerPreview field={field} answer={answer} />}
        </div>
        {!locked && (
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
            <button onClick={() => onMove("up")} disabled={index === 0} className="btn-icon h-7 w-7 disabled:opacity-30"><ArrowUp size={12} /></button>
            <button onClick={() => onMove("down")} disabled={index === total - 1} className="btn-icon h-7 w-7 disabled:opacity-30"><ArrowDown size={12} /></button>
            <button onClick={() => setEditing(true)} className="btn-icon h-7 w-7"><Pencil size={12} /></button>
            <button onClick={onDel} className="btn-icon h-7 w-7"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
    </li>
  );
}

function AnswerPreview({ field, answer }: { field: FieldUI; answer: AnswerUI }) {
  let display: React.ReactNode = null;
  switch (field.type) {
    case "TEXT":
    case "TEXTAREA":
    case "EMAIL":
    case "PHONE":
    case "SELECT_SINGLE":
      display = answer.textValue;
      break;
    case "NUMBER":
      display = answer.numberValue?.toString();
      break;
    case "DATE":
      display = answer.dateValue ? new Date(answer.dateValue).toLocaleDateString("de-DE") : null;
      break;
    case "YES_NO":
      display = answer.boolValue == null ? null : (answer.boolValue ? "Ja" : "Nein");
      break;
    case "RATING":
      display = answer.numberValue ? (
        <span className="flex items-center gap-0.5">
          {[1,2,3,4,5].map((n) => (
            <Star key={n} size={12} className={n <= (answer.numberValue ?? 0) ? "text-accent fill-accent" : "text-stone"} />
          ))}
          <span className="text-xs text-smoke ml-1">({answer.numberValue}/5)</span>
        </span>
      ) : null;
      break;
    case "SELECT_MULTI":
      if (answer.jsonValue) {
        const arr = JSON.parse(answer.jsonValue) as string[];
        display = (
          <div className="flex flex-wrap gap-1">
            {arr.map((v, i) => <span key={i} className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>{v}</span>)}
          </div>
        );
      }
      break;
    case "FILE":
      if (answer.jsonValue) {
        const f = JSON.parse(answer.jsonValue);
        display = <a href={f.url} target="_blank" className="text-accent hover:underline text-xs">📎 {f.filename}</a>;
      }
      break;
  }

  if (!display) return null;
  return (
    <div className="mt-3 p-3 rounded-lg border-l-2 text-sm" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
      <div className="text-[10px] uppercase tracking-wider text-accent-deep font-semibold mb-1">Antwort</div>
      <div className="text-ink whitespace-pre-wrap">{display}</div>
    </div>
  );
}

function FieldForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FieldUI;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<FieldType>((initial?.type as FieldType) ?? "TEXT");
  const [busy, setBusy] = useState(false);
  const typeMeta = FIELD_TYPES.find((t) => t.value === type);
  const hasOptions = typeMeta?.hasOptions ?? false;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(new FormData(e.currentTarget));
        setBusy(false);
      }}
      className="card p-4 bg-linen/40 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Feldtyp</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value as FieldType)} className="select">
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="text-xs text-smoke mt-1">{typeMeta?.hint}</div>
        </div>
        <div>
          <label className="label">Frage *</label>
          <input name="label" defaultValue={initial?.label} placeholder="Wie heißt du?" className="input" required />
        </div>
      </div>

      <div>
        <label className="label">Hinweis (optional)</label>
        <input name="helpText" defaultValue={initial?.helpText ?? ""} placeholder="Kleiner Hilfetext unter der Frage" className="input" />
      </div>

      {hasOptions && (
        <div>
          <label className="label">Optionen — eine pro Zeile</label>
          <textarea
            name="options"
            defaultValue={initial?.options ? (JSON.parse(initial.options) as string[]).join("\n") : ""}
            rows={4}
            placeholder={"Option 1\nOption 2\nOption 3"}
            className="textarea"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={initial?.required} className="w-4 h-4" />
        <span>Pflichtfeld</span>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Abbrechen</button>
        <button disabled={busy} className="btn-primary">{busy ? "…" : "Speichern"}</button>
      </div>
    </form>
  );
}
