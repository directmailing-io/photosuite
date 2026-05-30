import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { PackageForm } from "../PackageForm";
import { ChecklistTemplates } from "./ChecklistTemplates";
import { updatePackage, deletePackage } from "../actions";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pkg, team, questionnaires] = await Promise.all([
    prisma.package.findUnique({
      where: { id },
      include: {
        defaultTeam: true,
        defaultQuestionnaires: true,
        checklistTemplates: {
          orderBy: [{ audience: "asc" }, { position: "asc" }],
          include: { items: { orderBy: { position: "asc" } } },
        },
      },
    }),
    prisma.teamMember.findMany({ orderBy: [{ isOwner: "desc" }, { position: "asc" }] }),
    prisma.questionnaireTemplate.findMany({
      orderBy: [{ position: "asc" }],
      include: { _count: { select: { fields: true } } },
    }),
  ]);
  if (!pkg) return notFound();

  return (
    <>
      <PageHeader eyebrow="Paket" title={pkg.name} subtitle="Stammdaten, Preise, Standard-Team und Checklisten-Vorlagen." />
      <PackageForm
        initial={{
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          coverUrl: pkg.coverUrl,
          price: pkg.price,
          depositAmount: pkg.depositAmount,
          paymentTerms: pkg.paymentTerms,
          durationMin: pkg.durationMin,
          isActive: pkg.isActive,
          primaryContactId: pkg.primaryContactId,
          defaultTeamIds: pkg.defaultTeam.map((m) => m.id),
          defaultQuestionnaireIds: pkg.defaultQuestionnaires.map((q) => q.id),
        }}
        team={team.map((m) => ({
          id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, avatarUrl: m.avatarUrl, isOwner: m.isOwner,
        }))}
        questionnaires={questionnaires.map((q) => ({ id: q.id, title: q.title, fieldCount: q._count.fields }))}
        action={updatePackage.bind(null, id)}
        deleteAction={deletePackage.bind(null, id)}
      />
      <div className="mt-6">
        <ChecklistTemplates
          packageId={id}
          templates={pkg.checklistTemplates.map((t) => ({
            id: t.id,
            title: t.title,
            audience: t.audience,
            items: t.items.map((i) => ({ id: i.id, label: i.label })),
          }))}
        />
      </div>
    </>
  );
}
