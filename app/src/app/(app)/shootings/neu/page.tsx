import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { ShootingWizard } from "./ShootingWizard";
import { createShooting } from "../actions";

export default async function NeuShootingPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const sp = await searchParams;
  const userId = await requireUserId();
  const [customers, packages, statuses] = await Promise.all([
    prisma.customer.findMany({ where: { ownerId: userId }, orderBy: [{ firstName: "asc" }] }),
    prisma.package.findMany({
      where: { ownerId: userId, isActive: true },
      orderBy: { position: "asc" },
      include: { _count: { select: { checklistTemplates: true } } },
    }),
    prisma.shootingStatus.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Neu"
        title="Neues Shooting"
        subtitle="In zwei Schritten — erst Paket, dann Kundin & Eckdaten."
      />
      <ShootingWizard
        customers={customers.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, avatarUrl: c.avatarUrl }))}
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          coverUrl: p.coverUrl,
          price: p.price,
          depositAmount: p.depositAmount,
          paymentTerms: p.paymentTerms,
          durationMin: p.durationMin,
          checklistCount: p._count.checklistTemplates,
        }))}
        statuses={statuses}
        defaultCustomerId={sp.customerId}
        action={createShooting}
      />
    </>
  );
}
