import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { CustomerForm } from "../../CustomerForm";
import { updateCustomer, deleteCustomer } from "../../actions";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, statuses, tags] = await Promise.all([
    prisma.customer.findUnique({ where: { id }, include: { tags: true } }),
    prisma.customerStatus.findMany({ orderBy: { position: "asc" } }),
    prisma.tag.findMany({ orderBy: { label: "asc" } }),
  ]);
  if (!customer) return notFound();

  const update = updateCustomer.bind(null, id);
  const del = deleteCustomer.bind(null, id);

  return (
    <>
      <PageHeader
        eyebrow="Bearbeiten"
        title={`${customer.firstName} ${customer.lastName}`}
        subtitle="Stammdaten, Adresse, Status und Tags pflegen."
      />
      <CustomerForm
        initial={{
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          birthday: customer.birthday,
          avatarUrl: customer.avatarUrl,
          billingStreet: customer.billingStreet,
          billingZip: customer.billingZip,
          billingCity: customer.billingCity,
          billingCountry: customer.billingCountry,
          instagram: customer.instagram,
          facebook: customer.facebook,
          tiktok: customer.tiktok,
          website: customer.website,
          statusId: customer.statusId,
          source: customer.source,
          internalNotes: customer.internalNotes,
          tagIds: customer.tags.map((t) => t.id),
        }}
        statuses={statuses}
        tags={tags}
        action={update}
        deleteAction={del}
      />
    </>
  );
}
