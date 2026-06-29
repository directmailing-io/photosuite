import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { PackageForm } from "../PackageForm";
import { createPackage } from "../actions";

export default async function NeuPaketPage() {
  const userId = await requireUserId();
  const [user, team, questionnaires, addons] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { packageMode: true } }),
    prisma.teamMember.findMany({ where: { ownerId: userId }, orderBy: [{ isOwner: "desc" }, { position: "asc" }] }),
    prisma.questionnaireTemplate.findMany({
      where: { ownerId: userId },
      orderBy: [{ position: "asc" }],
      include: { _count: { select: { fields: true } } },
    }),
    prisma.addon.findMany({ where: { ownerId: userId, isActive: true }, orderBy: { position: "asc" } }),
  ]);
  const packageMode = (user?.packageMode ?? "all_in_one") as "all_in_one" | "modular";
  return (
    <>
      <PageHeader eyebrow="Neu" title="Neues Paket" subtitle="Definiere ein Shooting-Angebot mit Preis und Zahlungsbedingungen." />
      <PackageForm
        action={createPackage}
        packageMode={packageMode}
        team={team.map((m) => ({
          id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, avatarUrl: m.avatarUrl, isOwner: m.isOwner,
        }))}
        questionnaires={questionnaires.map((q) => ({ id: q.id, title: q.title, fieldCount: q._count.fields }))}
        addons={addons.map((a) => ({ id: a.id, name: a.name, price: a.price, imageUrl: a.imageUrl }))}
      />
    </>
  );
}
