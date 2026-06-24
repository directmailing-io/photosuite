import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { TemplateEditor } from "./TemplateEditor";
import { ChevronLeft, Package as PackageIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const tpl = await prisma.questionnaireTemplate.findFirst({
    where: { id, ownerId: userId },
    include: {
      fields: { orderBy: { position: "asc" } },
      packages: { orderBy: { position: "asc" } },
    },
  });
  if (!tpl) return notFound();

  return (
    <>
      <div className="mb-2">
        <Link
          href="/fragebogen/vorlagen"
          className="text-xs text-smoke hover:text-ink flex items-center gap-1"
        >
          <ChevronLeft size={12} /> Zurück zu allen Vorlagen
        </Link>
      </div>

      <PageHeader
        eyebrow="Vorlage"
        title={tpl.title}
        subtitle={tpl.description ?? "Wird bei jedem Shooting kopiert, das diese Vorlage nutzt — die Original-Vorlage bleibt unverändert."}
      />

      <TemplateEditor
        templateId={id}
        initial={{
          title: tpl.title,
          description: tpl.description,
        }}
        fields={tpl.fields.map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          helpText: f.helpText,
          required: f.required,
          options: f.options,
        }))}
        usedInPackages={tpl.packages.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
