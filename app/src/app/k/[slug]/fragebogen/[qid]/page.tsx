import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CustomerQuestionnaireView } from "./CustomerQuestionnaireView";

export const dynamic = "force-dynamic";

export default async function PublicQuestionnaire({
  params,
}: {
  params: Promise<{ slug: string; qid: string }>;
}) {
  const { slug, qid } = await params;
  // Public-Route: kein Auth. publicSlug ist composite-unique → findFirst (Token ist krypto-eindeutig).
  // Tenant-Bindung: qid MUSS zum Shooting mit diesem slug gehören (sonst IDOR).
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    include: {
      customer: true,
      package: true,
      questionnaires: {
        where: { id: qid },
        include: {
          fields: { orderBy: { position: "asc" } },
          answers: true,
        },
      },
    },
  });
  if (!shooting || shooting.questionnaires.length === 0) return notFound();
  const q = shooting.questionnaires[0];

  // Nur freigegebene Bögen erreichen die Kundin
  if (q.status === "DRAFT") return notFound();

  // Studio aus shooting.ownerId — NICHT findFirst, sonst falscher Tenant.
  const studio = await prisma.user.findUnique({ where: { id: shooting.ownerId } });

  // Map answers to fieldId for prefilling
  const initialAnswers: Record<string, any> = {};
  for (const a of q.answers) {
    const field = q.fields.find((f) => f.id === a.fieldId);
    if (!field) continue;
    switch (field.type) {
      case "TEXT": case "TEXTAREA": case "EMAIL": case "PHONE": case "SELECT_SINGLE":
        initialAnswers[a.fieldId] = a.textValue ?? "";
        break;
      case "NUMBER": case "RATING":
        initialAnswers[a.fieldId] = a.numberValue ?? "";
        break;
      case "DATE":
        initialAnswers[a.fieldId] = a.dateValue ? a.dateValue.toISOString().slice(0, 10) : "";
        break;
      case "YES_NO":
        initialAnswers[a.fieldId] = a.boolValue;
        break;
      case "SELECT_MULTI":
        initialAnswers[a.fieldId] = a.jsonValue ? JSON.parse(a.jsonValue) : [];
        break;
      case "FILE":
        initialAnswers[a.fieldId] = a.jsonValue ? JSON.parse(a.jsonValue) : null;
        break;
    }
  }

  return (
    <CustomerQuestionnaireView
      slug={slug}
      qid={qid}
      title={q.title}
      description={q.description}
      status={q.status}
      submittedAt={q.submittedAt?.toISOString() ?? null}
      coverUrl={shooting.package?.coverUrl ?? null}
      customerFirstName={shooting.customer.firstName}
      studioName={studio?.studioName ?? null}
      fields={q.fields.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        helpText: f.helpText,
        required: f.required,
        options: f.options ? (JSON.parse(f.options) as string[]) : null,
      }))}
      initialAnswers={initialAnswers}
    />
  );
}
