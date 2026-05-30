import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { PackageForm } from "../PackageForm";
import { createPackage } from "../actions";

export default async function NeuPaketPage() {
  const [team, questionnaires] = await Promise.all([
    prisma.teamMember.findMany({ orderBy: [{ isOwner: "desc" }, { position: "asc" }] }),
    prisma.questionnaireTemplate.findMany({
      orderBy: [{ position: "asc" }],
      include: { _count: { select: { fields: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Neu" title="Neues Paket" subtitle="Definiere ein Shooting-Angebot mit Preis und Zahlungsbedingungen." />
      <PackageForm
        action={createPackage}
        team={team.map((m) => ({
          id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, avatarUrl: m.avatarUrl, isOwner: m.isOwner,
        }))}
        questionnaires={questionnaires.map((q) => ({ id: q.id, title: q.title, fieldCount: q._count.fields }))}
      />
    </>
  );
}
