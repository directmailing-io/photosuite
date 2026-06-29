import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { FormBuilder } from "./FormBuilder";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FormularDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({
    where: { id, ownerId: userId },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!form) return notFound();

  return (
    <>
      <div className="mb-2">
        <Link href="/formulare" className="text-xs text-smoke hover:text-ink flex items-center gap-1">
          <ChevronLeft size={12} /> Zurück zu allen Formularen
        </Link>
      </div>

      <PageHeader eyebrow="Formular" title={form.name} subtitle={`/anfrage/${form.slug}`} />

      <FormBuilder
        form={{
          id: form.id,
          slug: form.slug,
          name: form.name,
          headline: form.headline,
          intro: form.intro,
          buttonText: form.buttonText,
          successMessage: form.successMessage,
          isActive: form.isActive,
          accentColor: form.accentColor,
          fontStyle: form.fontStyle,
          background: form.background,
          fields: form.fields.map((f) => ({
            id: f.id,
            type: f.type,
            systemKey: f.systemKey,
            label: f.label,
            helpText: f.helpText,
            placeholder: f.placeholder,
            required: f.required,
            options: f.options,
            position: f.position,
          })),
        }}
      />
    </>
  );
}
