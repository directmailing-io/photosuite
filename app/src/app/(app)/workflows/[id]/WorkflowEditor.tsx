"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save, Trash2, Plus, X, Mail, CheckSquare, Clock, Zap, Pause,
  ArrowDown, AlertCircle, CheckCircle2, Tag as TagIcon, Eye, Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import {
  updateWorkflow, toggleWorkflowActive, deleteWorkflow,
  addWorkflowStep, deleteWorkflowStep,
} from "../actions";
import { VARIABLE_GROUPS, renderTemplate, getSampleVars } from "@/lib/workflow/variables";

type Step = {
  id: string;
  position: number;
  delayMinutes: number;
  actionType: string;
  config: string;
};

type Run = {
  id: string;
  triggeredAt: string;
  status: string;
  jobCount: number;
  doneCount: number;
  failedCount: number;
};

type Props = {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    trigger: string;
    triggerOffsetDays: number;
    isActive: boolean;
    steps: Step[];
    runs: Run[];
  };
  tags: Array<{ id: string; label: string; color: string }>;
};

const TRIGGER_LABELS: Record<string, string> = {
  invoice_paid: "Rechnung bezahlt",
  offer_accepted: "Angebot angenommen",
  lead_created: "Neue Anfrage eingegangen",
  booking_accepted: "Termin-Anfrage angenommen",
  shooting_before: "Vor einem Shooting",
  shooting_after: "Nach einem Shooting",
  manual: "Manuell starten",
};

const TIME_TRIGGERS = new Set(["shooting_before", "shooting_after"]);

const ACTION_META: Record<string, { label: string; Icon: typeof Mail }> = {
  email:      { label: "Email senden",     Icon: Mail },
  task:       { label: "Aufgabe anlegen",  Icon: CheckSquare },
  tag_add:    { label: "Tag hinzufügen",   Icon: TagIcon },
  tag_remove: { label: "Tag entfernen",    Icon: TagIcon },
};

type StepKind = "email" | "task" | "tag_add" | "tag_remove";

function fmtDelay(min: number): string {
  if (min === 0) return "sofort";
  if (min < 60) return `nach ${min} Min`;
  if (min < 1440) return `nach ${Math.round(min / 60)} Std`;
  return `nach ${Math.round(min / 1440)} Tagen`;
}

export function WorkflowEditor({ workflow, tags }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addingStep, setAddingStep] = useState<StepKind | null>(null);
  // Lokaler Trigger-State, damit das Offset-Feld bei Trigger-Wechsel direkt erscheint/verschwindet
  const [selectedTrigger, setSelectedTrigger] = useState(workflow.trigger);
  const isTimeTrigger = TIME_TRIGGERS.has(selectedTrigger);

  async function onSaveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await updateWorkflow(workflow.id, fd);
      toast.success("Gespeichert");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onToggleActive() {
    setBusy(true);
    try {
      await toggleWorkflowActive(workflow.id, !workflow.isActive);
      toast.success(workflow.isActive ? "Pausiert" : "Aktiviert");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!confirm(`Workflow „${workflow.name}" löschen? Bereits laufende Jobs werden mitgelöscht.`)) return;
    setBusy(true);
    try {
      await deleteWorkflow(workflow.id);
      toast.success("Workflow gelöscht");
      router.push("/workflows");
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  async function onDeleteStep(stepId: string) {
    if (!confirm("Schritt löschen?")) return;
    await deleteWorkflowStep(stepId);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={onSaveMeta} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="eyebrow eyebrow-muted">Workflow-Einstellungen</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleActive}
                disabled={busy}
                className="btn-secondary text-xs h-8"
              >
                {workflow.isActive ? <><Pause size={12} /> Pausieren</> : <><Zap size={12} /> Aktivieren</>}
              </button>
            </div>
          </div>
          <FormRow>
            <Field label="Name *">
              <input name="name" defaultValue={workflow.name} required maxLength={200} className="input" />
            </Field>
            <Field label="Trigger *">
              <select
                name="trigger"
                value={selectedTrigger}
                onChange={(e) => setSelectedTrigger(e.target.value)}
                className="select"
              >
                <optgroup label="Sofort beim Ereignis">
                  <option value="invoice_paid">Rechnung bezahlt</option>
                  <option value="offer_accepted">Angebot angenommen</option>
                  <option value="lead_created">Neue Anfrage eingegangen</option>
                  <option value="booking_accepted">Termin-Anfrage angenommen</option>
                </optgroup>
                <optgroup label="Zeitbasiert um ein Shooting">
                  <option value="shooting_before">Vor einem Shooting</option>
                  <option value="shooting_after">Nach einem Shooting</option>
                </optgroup>
                <optgroup label="Manuell">
                  <option value="manual">Manuell starten</option>
                </optgroup>
              </select>
            </Field>
          </FormRow>
          {isTimeTrigger && (
            <Field
              label={selectedTrigger === "shooting_before" ? "Tage VOR dem Shooting" : "Tage NACH dem Shooting"}
              hint={
                selectedTrigger === "shooting_before"
                  ? 'Beispiel: 14 = „2 Wochen vor dem Shooting wird der Trigger ausgelöst, dann starten die Schritte mit ihren Verzögerungen ab dem Zeitpunkt."'
                  : 'Beispiel: 3 = „3 Tage nach dem Shooting wird der Trigger ausgelöst, dann starten die Schritte mit ihren Verzögerungen ab dem Zeitpunkt."'
              }
            >
              <input
                type="number"
                min="0"
                name="triggerOffsetDays"
                defaultValue={workflow.triggerOffsetDays}
                className="input w-32"
              />
            </Field>
          )}
          <Field label="Beschreibung">
            <textarea
              name="description"
              defaultValue={workflow.description ?? ""}
              rows={2}
              className="textarea text-sm"
              placeholder="Wozu dient dieser Workflow?"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
            <button type="button" onClick={onDelete} disabled={busy} className="btn-ghost text-sm" style={{ color: "rgb(var(--accent))" }}>
              <Trash2 size={13} /> Löschen
            </button>
            <button type="submit" disabled={busy} className="btn-primary text-sm">
              <Save size={13} /> Speichern
            </button>
          </div>
        </form>

        <section className="card">
          <div className="px-5 py-4 border-b border-stone/60 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="eyebrow eyebrow-muted">Schritte</div>
              <p className="text-xs text-smoke mt-1">
                Reihenfolge: Schritte werden ausgehend vom Trigger-Zeitpunkt durch ihre Verzögerung gestaffelt.
                Variablen wie <code className="px-1 py-0.5 bg-linen rounded">{"{customer.firstName}"}</code> werden bei der Ausführung ersetzt.
              </p>
            </div>
            {!addingStep && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setAddingStep("email")} className="btn-secondary text-xs h-9">
                  <Mail size={12} /> E-Mail
                </button>
                <button onClick={() => setAddingStep("task")} className="btn-secondary text-xs h-9">
                  <CheckSquare size={12} /> Aufgabe
                </button>
                <button onClick={() => setAddingStep("tag_add")} className="btn-secondary text-xs h-9">
                  <TagIcon size={12} /> Tag setzen
                </button>
                <button onClick={() => setAddingStep("tag_remove")} className="btn-secondary text-xs h-9">
                  <TagIcon size={12} /> Tag entfernen
                </button>
              </div>
            )}
          </div>

          {addingStep && (
            <div className="px-5 py-4 bg-linen/40 border-b border-stone/60">
              <StepForm
                workflowId={workflow.id}
                actionType={addingStep}
                tags={tags}
                onCancel={() => setAddingStep(null)}
                onSaved={() => setAddingStep(null)}
              />
            </div>
          )}

          {workflow.steps.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-smoke italic">
              Noch keine Schritte. Füge oben den ersten hinzu.
            </div>
          ) : (
            <ul>
              {workflow.steps.map((step, idx) => (
                <li key={step.id}>
                  <StepRow step={step} onDelete={() => onDeleteStep(step.id)} tags={tags} />
                  {idx < workflow.steps.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown size={14} className="text-smoke" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-2">Status</div>
          <div className="text-sm mb-3">
            Trigger: <strong>{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</strong>
          </div>
          <div className="text-sm">
            Status:{" "}
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: workflow.isActive ? "rgb(var(--success-soft))" : "rgb(var(--linen))",
                color: workflow.isActive ? "rgb(var(--success-deep))" : "rgb(var(--taupe))",
              }}
            >
              {workflow.isActive ? "Aktiv" : "Pausiert"}
            </span>
          </div>
        </div>

        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Letzte Läufe</div>
          {workflow.runs.length === 0 ? (
            <div className="text-xs text-smoke italic text-center py-4">
              Noch keine Läufe.
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {workflow.runs.map((r) => {
                const tone =
                  r.status === "done" ? { bg: "rgb(var(--success-soft))", color: "rgb(var(--success-deep))", Icon: CheckCircle2 } :
                  r.status === "failed" ? { bg: "rgb(var(--danger-soft))", color: "rgb(var(--danger-deep))", Icon: AlertCircle } :
                  { bg: "rgb(var(--linen))", color: "rgb(var(--taupe))", Icon: Clock };
                const Icon = tone.Icon;
                return (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: tone.bg, color: tone.color }}>
                      <Icon size={10} /> {r.status}
                    </span>
                    <span className="text-smoke">
                      {new Date(r.triggeredAt).toLocaleDateString("de-DE")}
                    </span>
                    <span className="text-smoke ml-auto">
                      {r.doneCount}/{r.jobCount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function StepRow({ step, onDelete, tags }: { step: Step; onDelete: () => void; tags: Array<{ id: string; label: string; color: string }> }) {
  const meta = ACTION_META[step.actionType];
  const Icon = meta?.Icon ?? Mail;
  let summary = "";
  try {
    const cfg = JSON.parse(step.config);
    if (step.actionType === "email") {
      summary = `An ${cfg.to === "owner" ? "dich" : "Kundin"} · „${cfg.subject}"`;
    } else if (step.actionType === "task") {
      summary = `„${cfg.title}"${cfg.dueInDays ? ` · fällig in ${cfg.dueInDays} Tagen` : ""}`;
    } else if (step.actionType === "tag_add" || step.actionType === "tag_remove") {
      const tag = tags.find((t) => t.id === cfg.tagId);
      const verb = step.actionType === "tag_add" ? "hinzufügen" : "entfernen";
      summary = tag ? `„${tag.label}" ${verb}` : `Tag (gelöscht) ${verb}`;
    }
  } catch { summary = "Konfiguration unlesbar"; }

  return (
    <div className="px-5 py-3 flex items-start gap-3 border-t border-stone/60 first:border-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgb(var(--linen))" }}
      >
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{meta?.label ?? step.actionType}</div>
        <div className="text-xs text-smoke mt-0.5">{summary}</div>
        <div className="text-xs text-smoke mt-0.5 inline-flex items-center gap-1">
          <Clock size={10} /> {fmtDelay(step.delayMinutes)}
        </div>
      </div>
      <button onClick={onDelete} className="btn-icon shrink-0" style={{ color: "rgb(var(--accent))" }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Verzögerung in Minuten + Helper für Anzahl+Einheit-Splitting
type DelayUnit = "min" | "hour" | "day" | "week";
const UNIT_MIN: Record<DelayUnit, number> = { min: 1, hour: 60, day: 1440, week: 10080 };

function splitDelay(totalMin: number): { value: number; unit: DelayUnit } {
  if (totalMin === 0) return { value: 0, unit: "min" };
  if (totalMin % UNIT_MIN.week === 0) return { value: totalMin / UNIT_MIN.week, unit: "week" };
  if (totalMin % UNIT_MIN.day === 0) return { value: totalMin / UNIT_MIN.day, unit: "day" };
  if (totalMin % UNIT_MIN.hour === 0) return { value: totalMin / UNIT_MIN.hour, unit: "hour" };
  return { value: totalMin, unit: "min" };
}

function StepForm({
  workflowId, actionType, tags, onCancel, onSaved,
}: {
  workflowId: string;
  actionType: StepKind;
  tags: Array<{ id: string; label: string; color: string }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Verzögerungs-State (Anzahl + Einheit)
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<DelayUnit>("min");
  // Email-Felder als kontrollierter State, damit der Variablen-Picker einfügen kann
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {customer.firstName},\n\n…\n\nHerzliche Grüße\n{studio.name}");
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const [previewMode, setPreviewMode] = useState(false);
  // Task-Felder
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");

  const totalMinutes = Math.max(0, Math.round(delayValue)) * UNIT_MIN[delayUnit];

  function insertVar(token: string) {
    if (activeField === "subject") setSubject((s) => s + token);
    else setBody((b) => b + token);
  }
  function insertVarInto(field: "title" | "description", token: string) {
    if (field === "title") setTaskTitle((s) => s + token);
    else setTaskDesc((s) => s + token);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("actionType", actionType);
    fd.set("delayMinutes", String(totalMinutes));
    if (actionType === "email") {
      fd.set("subject", subject);
      fd.set("body", body);
    } else if (actionType === "task") {
      fd.set("title", taskTitle);
      fd.set("description", taskDesc);
    }
    startTransition(async () => {
      try {
        await addWorkflowStep(workflowId, fd);
        toast.success("Schritt hinzugefügt");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DelayInput value={delayValue} unit={delayUnit} onChange={(v, u) => { setDelayValue(v); setDelayUnit(u); }} />

      {actionType === "email" && (
        <EmailFields
          subject={subject} setSubject={setSubject}
          body={body} setBody={setBody}
          activeField={activeField} setActiveField={setActiveField}
          previewMode={previewMode} setPreviewMode={setPreviewMode}
          insertVar={insertVar}
        />
      )}

      {actionType === "task" && (
        <TaskFields
          title={taskTitle} setTitle={setTaskTitle}
          desc={taskDesc} setDesc={setTaskDesc}
          insertVar={insertVarInto}
        />
      )}

      {(actionType === "tag_add" || actionType === "tag_remove") && (
        <TagFields tags={tags} mode={actionType} />
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Plus size={13} /> Hinzufügen
        </button>
      </div>
    </form>
  );
}

function DelayInput({
  value, unit, onChange, label = "Verzögerung",
}: {
  value: number;
  unit: DelayUnit;
  onChange: (value: number, unit: DelayUnit) => void;
  label?: string;
}) {
  const summary = value === 0
    ? "sofort beim Trigger"
    : `${value} ${unit === "min" ? (value === 1 ? "Minute" : "Minuten") : unit === "hour" ? (value === 1 ? "Stunde" : "Stunden") : unit === "day" ? (value === 1 ? "Tag" : "Tagen") : (value === 1 ? "Woche" : "Wochen")} nach Trigger`;
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-smoke font-semibold mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)), unit)}
          className="input w-20"
        />
        <select
          value={unit}
          onChange={(e) => onChange(value, e.target.value as DelayUnit)}
          className="select w-40"
        >
          <option value="min">Minuten</option>
          <option value="hour">Stunden</option>
          <option value="day">Tagen</option>
          <option value="week">Wochen</option>
        </select>
        <span className="text-xs text-smoke">→ {summary}</span>
      </div>
    </div>
  );
}

function VariablePicker({ onPick }: { onPick: (token: string) => void }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-stone bg-paper px-3 py-2">
      <div className="text-[11px] text-smoke font-medium mb-2">Variable einfügen:</div>
      <div className="flex flex-wrap gap-1.5">
        {VARIABLE_GROUPS.map((g) => (
          <div key={g.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenGroup(openGroup === g.label ? null : g.label)}
              className="text-xs px-2 py-1 rounded border border-stone hover:bg-linen transition"
            >
              {g.label}
            </button>
            {openGroup === g.label && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
                <div
                  className="absolute left-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border shadow-md"
                  style={{ background: "rgb(var(--paper))", borderColor: "rgb(var(--stone))" }}
                >
                  {g.vars.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => { onPick(v.token); setOpenGroup(null); }}
                      className="w-full text-left px-3 py-2 hover:bg-linen transition border-t border-stone/40 first:border-0"
                    >
                      <div className="text-xs font-mono">{v.token}</div>
                      <div className="text-[10px] text-smoke">{v.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailFields({
  subject, setSubject, body, setBody,
  activeField, setActiveField,
  previewMode, setPreviewMode, insertVar,
}: {
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  activeField: "subject" | "body";
  setActiveField: (f: "subject" | "body") => void;
  previewMode: boolean;
  setPreviewMode: (b: boolean) => void;
  insertVar: (token: string) => void;
}) {
  const samples = getSampleVars();
  const renderedSubject = renderTemplate(subject, samples);
  const renderedBody = renderTemplate(body, samples);

  return (
    <>
      <Field label="Empfänger">
        <select name="to" defaultValue="customer" className="select">
          <option value="customer">An die Kundin</option>
          <option value="owner">An dich selbst</option>
        </select>
      </Field>

      {/* Editor / Vorschau Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs uppercase tracking-wider text-smoke font-semibold">
          E-Mail-Inhalt
        </div>
        <div className="inline-flex rounded-full border border-stone bg-paper p-0.5">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={`text-xs px-3 py-1 rounded-full transition flex items-center gap-1 ${!previewMode ? "bg-ink text-paper" : "text-ink hover:bg-linen"}`}
          >
            <Edit3 size={11} /> Bearbeiten
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={`text-xs px-3 py-1 rounded-full transition flex items-center gap-1 ${previewMode ? "bg-ink text-paper" : "text-ink hover:bg-linen"}`}
          >
            <Eye size={11} /> Vorschau
          </button>
        </div>
      </div>

      {previewMode ? (
        <div className="rounded-lg border border-stone bg-paper p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">Betreff</div>
          <div className="text-base font-medium border-b border-stone/60 pb-2" style={{ color: "rgb(var(--ink))" }}>
            {renderedSubject || <span className="text-smoke italic">— (leer)</span>}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold pt-1">Text</div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "rgb(var(--ink))" }}>
            {renderedBody || <span className="text-smoke italic">— (leer)</span>}
          </div>
          <div className="text-[10px] text-smoke italic pt-2 border-t border-stone/40">
            Vorschau mit Beispieldaten — beim Versand werden die echten Werte der jeweiligen Kundin eingefügt.
          </div>
        </div>
      ) : (
        <>
          <VariablePicker onPick={insertVar} />
          <Field label="Betreff *">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField("subject")}
              required
              maxLength={200}
              className="input"
              placeholder='z.B. "Danke für deine Zahlung, {customer.firstName}"'
            />
          </Field>
          <Field label="Text *" hint="Klicke oben auf eine Variable, um sie an der Cursor-Position einzufügen.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setActiveField("body")}
              required
              maxLength={10000}
              rows={10}
              className="textarea text-sm font-mono"
            />
          </Field>
        </>
      )}
    </>
  );
}

function TaskFields({
  title, setTitle, desc, setDesc, insertVar,
}: {
  title: string;
  setTitle: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  insertVar: (field: "title" | "description", token: string) => void;
}) {
  const [active, setActive] = useState<"title" | "description">("title");
  return (
    <>
      <VariablePicker onPick={(t) => insertVar(active, t)} />
      <Field label="Titel *" hint="Klick oben auf Variable → wird in das gerade fokussierte Feld eingefügt.">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setActive("title")}
          required
          maxLength={500}
          className="input"
          placeholder='z.B. "{customer.firstName} an Review erinnern"'
        />
      </Field>
      <Field label="Beschreibung">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onFocus={() => setActive("description")}
          maxLength={2000}
          rows={3}
          className="textarea text-sm"
        />
      </Field>
      <Field label="Fällig in (Tagen)" hint="Wird ab Trigger-Zeitpunkt berechnet. Leer/0 = keine Fälligkeit.">
        <input
          type="number"
          min="0"
          name="dueInDays"
          defaultValue={0}
          className="input w-32"
        />
      </Field>
    </>
  );
}

function TagFields({
  tags, mode,
}: {
  tags: Array<{ id: string; label: string; color: string }>;
  mode: "tag_add" | "tag_remove";
}) {
  if (tags.length === 0) {
    return (
      <div className="rounded-lg border border-stone bg-linen/40 p-4 text-sm text-smoke">
        Noch keine Tags angelegt. Lege Tags zuerst unter{" "}
        <a href="/einstellungen?tab=tags" className="underline text-ink hover:text-accent">Einstellungen → Tags</a> an.
      </div>
    );
  }
  return (
    <Field
      label="Tag *"
      hint={mode === "tag_add"
        ? "Dieser Tag wird der Kundin hinzugefügt, wenn der Workflow läuft."
        : "Dieser Tag wird von der Kundin entfernt (falls vorhanden)."}
    >
      <select name="tagId" required defaultValue="" className="select">
        <option value="" disabled>— Tag auswählen —</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </Field>
  );
}
