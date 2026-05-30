import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { CustomerForm } from "../CustomerForm";
import { createCustomer } from "../actions";

export default async function NeuPage() {
  const [statuses, tags] = await Promise.all([
    prisma.customerStatus.findMany({ orderBy: { position: "asc" } }),
    prisma.tag.findMany({ orderBy: { label: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Neu" title="Neue Kundin" subtitle="Lege einen neuen Kontakt an." />
      <CustomerForm statuses={statuses} tags={tags} action={createCustomer} />
    </>
  );
}
