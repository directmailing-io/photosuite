import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { QuestionnaireEditor } from "./QuestionnaireEditor";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { STATUS_LABELS, type StatusKey } from "@/lib/questionnaire";

export const dynamic = "force-dynamic";

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ id: string; qid: string }>;
}) {
  const { id, qid } = await params;
  const q = await prisma.questionnaire.findUnique({
    where: { id: qid },
    include: {
      fields: { orderBy: { position: "asc" } },
      answers: true,
      shooting: { include: { customer: true } },
    },
  });
  if (!q || q.shootingId !== id) return notFound();

  // Mark as seen by studio
  if (q.status === "SUBMITTED" && (!q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt))) {
    await prisma.questionnaire.update({ where: { id: qid }, data: { seenByStudioAt: new Date() } });
  }

  const meta = STATUS_LABELS[q.status as StatusKey] ?? STATUS_LABELS.DRAFT;
  const publicUrl = q.shooting.publicSlug ? `/k/${q.shooting.publicSlug}/fragebogen/${q.id}` : null;

  return (
    <>
      <div className="mb-2">
        <Link href={`/shootings/${id}`} className="text-xs text-smoke hover:text-ink flex items-center gap-1">
          <ChevronLeft size={12} /> Zurück zum Shooting
        </Link>
      </div>

      <PageHeader
        eyebrow="Fragebogen"
        title={q.title}
        subtitle={`für ${q.shooting.customer.firstName} ${q.shooting.customer.lastName}`}
      >
        <span className="badge" style={{ background: `${meta.color}15`, color: meta.color }}>
          {meta.label}
        </span>
        {publicUrl && q.status !== "DRAFT" && (
          <a href={publicUrl} target="_blank" className="btn-secondary text-xs h-9">
            <ExternalLink size={13} /> Kundenansicht
          </a>
        )}
      </PageHeader>

      <QuestionnaireEditor
        questionnaireId={qid}
        initial={{
          title: q.title,
          description: q.description,
          status: q.status,
          sentAt: q.sentAt?.toISOString() ?? null,
          openedAt: q.openedAt?.toISOString() ?? null,
          lastSavedAt: q.lastSavedAt?.toISOString() ?? null,
          submittedAt: q.submittedAt?.toISOString() ?? null,
        }}
        fields={q.fields.map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          helpText: f.helpText,
          required: f.required,
          options: f.options,
        }))}
        answers={q.answers.map((a) => ({
          fieldId: a.fieldId,
          textValue: a.textValue,
          numberValue: a.numberValue,
          dateValue: a.dateValue?.toISOString() ?? null,
          boolValue: a.boolValue,
          jsonValue: a.jsonValue,
        }))}
        publicUrl={publicUrl}
      />
    </>
  );
}
