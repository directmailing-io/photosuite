import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FileQuestion, Plus, Package as PackageIcon, ChevronRight } from "lucide-react";
import { FragebogenTabs } from "../FragebogenTabs";
import { NewTemplateButton } from "./NewTemplateButton";

export const dynamic = "force-dynamic";

export default async function VorlagenPage() {
  const templates = await prisma.questionnaireTemplate.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { fields: true, packages: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Wiederverwendbar"
        title="Fragebögen"
        subtitle="Vorlagen, die du an Pakete hängst oder direkt am Shooting auswählst — kein doppeltes Tippen mehr."
      >
        <NewTemplateButton />
      </PageHeader>

      <FragebogenTabs active="vorlagen" />

      {templates.length === 0 ? (
        <EmptyState
          icon={<FileQuestion size={36} strokeWidth={1.25} />}
          title="Noch keine Vorlagen"
          description={`Lege z.B. „Briefing Boudoir", „Feedback nach dem Shooting" oder „Erstkontakt-Fragebogen" als Vorlage an.`}
          action={<NewTemplateButton />}
        />
      ) : (
        <div className="card overflow-hidden">
          <ul>
            {templates.map((t) => (
              <li key={t.id} className="border-t border-stone/60 first:border-0">
                <Link
                  href={`/fragebogen/vorlagen/${t.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-linen/50 transition group"
                >
                  <div className="w-10 h-10 rounded-xl bg-linen flex items-center justify-center shrink-0 text-taupe">
                    <FileQuestion size={18} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{t.title}</div>
                    {t.description && (
                      <div className="text-xs text-smoke mt-0.5 line-clamp-1">{t.description}</div>
                    )}
                    <div className="text-xs text-smoke mt-1.5 flex items-center gap-3">
                      <span>{t._count.fields} {t._count.fields === 1 ? "Frage" : "Fragen"}</span>
                      {t._count.packages > 0 && (
                        <span className="flex items-center gap-1">
                          <PackageIcon size={11} /> in {t._count.packages} {t._count.packages === 1 ? "Paket" : "Paketen"}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-smoke group-hover:translate-x-0.5 transition" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
