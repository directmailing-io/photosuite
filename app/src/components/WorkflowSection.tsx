"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Workflow as WorkflowIcon, Play, CheckCircle2, AlertCircle, Clock, X, CircleSlash, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { triggerManualWorkflow } from "@/app/(app)/workflows/actions";

/**
 * Workflow-Sektion für Shooting- und Kunden-Detail.
 *
 * Zwei Teile:
 *  1) „Workflow starten"-Button mit Dropdown aller manuellen Workflows (nur wenn welche existieren)
 *  2) Run-Historie: zeigt die letzten 8 Workflow-Runs für diesen Kontext mit Status
 *
 * Kontext = customerId und/oder shootingId. Beide werden an die Server-Action
 * weitergegeben, damit Variablen im Template (z.B. {customer.firstName}) aufgelöst
 * werden können.
 */

export type ManualWorkflowOption = {
  id: string;
  name: string;
  description: string | null;
};

export type RunHistoryItem = {
  id: string;
  workflowName: string;
  workflowId: string;
  trigger: string;
  triggeredAt: string;
  status: string;
  jobsDone: number;
  jobsTotal: number;
  nextRunAt: string | null;
};

const TRIGGER_LABELS: Record<string, string> = {
  invoice_paid: "Rechnung bezahlt",
  offer_accepted: "Angebot angenommen",
  lead_created: "Neue Anfrage",
  booking_accepted: "Termin angenommen",
  shooting_before: "Vor Shooting",
  shooting_after: "Nach Shooting",
  manual: "Manuell gestartet",
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function WorkflowSection({
  customerId,
  shootingId,
  manualWorkflows,
  runs,
}: {
  customerId?: string | null;
  shootingId?: string | null;
  manualWorkflows: ManualWorkflowOption[];
  runs: RunHistoryItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function onTrigger(workflowId: string) {
    setOpen(false);
    startTransition(async () => {
      try {
        await triggerManualWorkflow(workflowId, { customerId, shootingId });
        toast.success("Workflow gestartet");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht starten");
      }
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <WorkflowIcon size={13} /> Automatisierungen
        </div>
        {manualWorkflows.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={pending}
              className="btn-secondary text-xs h-8"
            >
              <Play size={12} /> Workflow starten <ChevronDown size={12} />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div
                  className="absolute right-0 mt-1 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border shadow-md"
                  style={{ background: "rgb(var(--paper))", borderColor: "rgb(var(--stone))" }}
                >
                  {manualWorkflows.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => onTrigger(wf.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-linen transition border-t border-stone/40 first:border-0"
                    >
                      <div className="font-medium text-sm">{wf.name}</div>
                      {wf.description && (
                        <div className="text-xs text-smoke mt-0.5 line-clamp-2">{wf.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="text-sm text-smoke italic text-center py-6">
          {manualWorkflows.length === 0
            ? "Noch keine Automatisierungen für diesen Kontext aktiv."
            : "Noch keine Workflow-Läufe — starte den ersten oben oder warte auf einen Auto-Trigger."}
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => <RunRow key={r.id} run={r} />)}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-stone/60 text-xs text-smoke">
        Workflows anlegen und konfigurieren unter{" "}
        <Link href="/workflows" className="underline hover:text-ink">/workflows</Link>.
      </div>
    </section>
  );
}

function RunRow({ run }: { run: RunHistoryItem }) {
  const tone =
    run.status === "done" ? { bg: "rgb(var(--success-soft))", color: "rgb(var(--success-deep))", Icon: CheckCircle2, label: "Fertig" } :
    run.status === "failed" ? { bg: "rgb(var(--danger-soft))", color: "rgb(var(--danger-deep))", Icon: AlertCircle, label: "Fehler" } :
    run.status === "cancelled" ? { bg: "rgb(var(--linen))", color: "rgb(var(--taupe))", Icon: CircleSlash, label: "Abgebrochen" } :
    { bg: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))", Icon: Clock, label: "Läuft" };
  const Icon = tone.Icon;

  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
        style={{ background: tone.bg, color: tone.color }}
      >
        <Icon size={10} /> {tone.label}
      </span>
      <div className="flex-1 min-w-0">
        <Link
          href={`/workflows/${run.workflowId}`}
          className="font-medium hover:underline truncate block"
        >
          {run.workflowName}
        </Link>
        <div className="text-xs text-smoke">
          {TRIGGER_LABELS[run.trigger] ?? run.trigger} · {fmtDateTime(run.triggeredAt)}
          {run.status === "pending" && run.nextRunAt && (
            <> · nächster Schritt {fmtDateTime(run.nextRunAt)}</>
          )}
        </div>
      </div>
      <div className="text-xs text-smoke tabular-nums shrink-0">
        {run.jobsDone}/{run.jobsTotal}
      </div>
    </li>
  );
}
