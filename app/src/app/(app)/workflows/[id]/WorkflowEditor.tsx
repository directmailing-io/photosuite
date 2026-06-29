"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save, Trash2, Plus, X, Mail, CheckSquare, Clock, Zap, Pause,
  ArrowDown, AlertCircle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import {
  updateWorkflow, toggleWorkflowActive, deleteWorkflow,
  addWorkflowStep, deleteWorkflowStep,
} from "../actions";

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
  email: { label: "Email senden", Icon: Mail },
  task: { label: "Aufgabe anlegen", Icon: CheckSquare },
};

function fmtDelay(min: number): string {
  if (min === 0) return "sofort";
  if (min < 60) return `nach ${min} Min`;
  if (min < 1440) return `nach ${Math.round(min / 60)} Std`;
  return `nach ${Math.round(min / 1440)} Tagen`;
}

export function WorkflowEditor({ workflow }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addingStep, setAddingStep] = useState<"email" | "task" | null>(null);
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
              <div className="flex gap-2">
                <button onClick={() => setAddingStep("email")} className="btn-secondary text-xs h-9">
                  <Mail size={12} /> Email-Schritt
                </button>
                <button onClick={() => setAddingStep("task")} className="btn-secondary text-xs h-9">
                  <CheckSquare size={12} /> Aufgaben-Schritt
                </button>
              </div>
            )}
          </div>

          {addingStep && (
            <div className="px-5 py-4 bg-linen/40 border-b border-stone/60">
              <StepForm
                workflowId={workflow.id}
                actionType={addingStep}
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
                  <StepRow step={step} onDelete={() => onDeleteStep(step.id)} />
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
                background: workflow.isActive ? "#E6F3EC" : "#F2F1EE",
                color: workflow.isActive ? "#2F6B4A" : "#7D7878",
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
                  r.status === "done" ? { bg: "#E6F3EC", color: "#2F6B4A", Icon: CheckCircle2 } :
                  r.status === "failed" ? { bg: "#FBE9EC", color: "#C8102E", Icon: AlertCircle } :
                  { bg: "#F2F1EE", color: "#7D7878", Icon: Clock };
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

function StepRow({ step, onDelete }: { step: Step; onDelete: () => void }) {
  const meta = ACTION_META[step.actionType];
  const Icon = meta?.Icon ?? Mail;
  let summary = "";
  try {
    const cfg = JSON.parse(step.config);
    if (step.actionType === "email") {
      summary = `An ${cfg.to === "owner" ? "dich" : "Kundin"} · „${cfg.subject}"`;
    } else if (step.actionType === "task") {
      summary = `„${cfg.title}"${cfg.dueInDays ? ` · fällig in ${cfg.dueInDays} Tagen` : ""}`;
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

function StepForm({
  workflowId, actionType, onCancel, onSaved,
}: {
  workflowId: string;
  actionType: "email" | "task";
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("actionType", actionType);
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
    <form onSubmit={onSubmit} className="space-y-3">
      <FormRow>
        <Field label="Verzögerung (Minuten)" hint="0 = sofort. 1440 = 1 Tag. 10080 = 1 Woche.">
          <input
            type="number"
            min="0"
            name="delayMinutes"
            defaultValue={0}
            className="input w-32"
          />
        </Field>
      </FormRow>

      {actionType === "email" ? (
        <>
          <Field label="Empfänger">
            <select name="to" defaultValue="customer" className="select">
              <option value="customer">An die Kundin</option>
              <option value="owner">An dich selbst</option>
            </select>
          </Field>
          <Field label="Betreff *">
            <input name="subject" required maxLength={200} className="input" placeholder='z.B. "Danke für deine Zahlung"' />
          </Field>
          <Field label="Text *" hint="Variablen: {customer.firstName}, {invoice.number}, {invoice.total}, {studio.name}">
            <textarea
              name="body"
              required
              maxLength={10000}
              rows={8}
              className="textarea text-sm font-mono"
              defaultValue={`Hi {customer.firstName},\n\n…\n\nHerzliche Grüße\n{studio.name}`}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Titel *" hint="Variablen wie {customer.firstName} sind erlaubt.">
            <input name="title" required maxLength={500} className="input" placeholder='z.B. "{customer.firstName} an Review-Anfrage erinnern"' />
          </Field>
          <Field label="Beschreibung">
            <textarea
              name="description"
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
