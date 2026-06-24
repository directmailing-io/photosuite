import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { CustomerForm } from "../CustomerForm";
import { createCustomer } from "../actions";

export default async function NeuPage() {
  const userId = await requireUserId();
  const [statuses, tags] = await Promise.all([
    prisma.customerStatus.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
    prisma.tag.findMany({ where: { ownerId: userId }, orderBy: { label: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Neu" title="Neue Kundin" subtitle="Lege einen neuen Kontakt an." />
      <CustomerForm statuses={statuses} tags={tags} action={createCustomer} />
    </>
  );
}
