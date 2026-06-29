import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Workflow as WorkflowIcon, ChevronRight, Plus, CheckCircle2, Pause, Zap } from "lucide-react";
import { NewWorkflowButton } from "./NewWorkflowButton";

export const dynamic = "force-dynamic";

const TRIGGER_LABELS: Record<string, string> = {
  invoice_paid: "Rechnung bezahlt",
  offer_accepted: "Angebot angenommen",
  lead_created: "Neue Anfrage eingegangen",
  manual: "Manuell starten",
};

export default async function WorkflowsPage() {
  const userId = await requireUserId();
  const workflows = await prisma.workflow.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { steps: true, runs: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        eyebrow="Automation"
        title="Workflows"
        subtitle="Lass die Routine für dich laufen — Auto-Mails, Folge-Aufgaben, Termin-Reminder. Trigger + Schritte + Verzögerung."
      >
        <NewWorkflowButton />
      </PageHeader>

      {workflows.length === 0 ? (
        <EmptyState
          title="Noch keine Workflows"
          description='Beispiel: „Wenn Rechnung bezahlt → 7 Tage später Folgemail mit Anfrage nach Review."'
        />
      ) : (
        <ul className="space-y-2">
          {workflows.map((wf) => (
            <li key={wf.id}>
              <Link
                href={`/workflows/${wf.id}`}
                className="card flex items-center gap-4 p-4 hover:bg-linen/50 transition"
                style={{ opacity: wf.isActive ? 1 : 0.6 }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: wf.isActive ? "rgb(var(--accent-soft))" : "rgb(var(--linen))",
                    color: wf.isActive ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))",
                  }}
                >
                  {wf.isActive ? <Zap size={15} /> : <Pause size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{wf.name}</div>
                  <div className="text-xs text-smoke mt-0.5">
                    Trigger: {TRIGGER_LABELS[wf.trigger] ?? wf.trigger}
                    {" · "}
                    {wf._count.steps} {wf._count.steps === 1 ? "Schritt" : "Schritte"}
                    {" · "}
                    {wf._count.runs} {wf._count.runs === 1 ? "Lauf" : "Läufe"}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-full shrink-0"
                  style={{
                    background: wf.isActive ? "#E6F3EC" : "#F2F1EE",
                    color: wf.isActive ? "#2F6B4A" : "#7D7878",
                  }}
                >
                  {wf.isActive ? "Aktiv" : "Pausiert"}
                </span>
                <ChevronRight size={15} className="text-smoke shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
