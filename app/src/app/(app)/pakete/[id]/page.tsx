import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { PackageForm } from "../PackageForm";
import { ChecklistTemplates } from "./ChecklistTemplates";
import { updatePackage, deletePackage } from "../actions";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pkg, team, questionnaires, addons] = await Promise.all([
    prisma.package.findUnique({
      where: { id },
      include: {
        defaultTeam: true,
        defaultQuestionnaires: true,
        addons: true,
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
    prisma.addon.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
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
          availableAddonIds: pkg.addons.map((a) => a.id),
        }}
        team={team.map((m) => ({
          id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, avatarUrl: m.avatarUrl, isOwner: m.isOwner,
        }))}
        questionnaires={questionnaires.map((q) => ({ id: q.id, title: q.title, fieldCount: q._count.fields }))}
        addons={addons.map((a) => ({ id: a.id, name: a.name, price: a.price, imageUrl: a.imageUrl }))}
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
