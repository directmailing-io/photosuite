import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FileText, ChevronRight, ExternalLink, Pause, Zap } from "lucide-react";
import { NewFormButton } from "./NewFormButton";

export const dynamic = "force-dynamic";

export default async function FormularePage() {
  const userId = await requireUserId();
  const forms = await prisma.leadForm.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { fields: true, leads: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        eyebrow="Formular-Builder"
        title="Formulare"
        subtitle="Lege beliebig viele Anfrage-Formulare an — jedes mit eigenen Feldern, Design und URL. Auf der Subdomain teilen oder per Snippet auf der eigenen Website einbetten."
      >
        <NewFormButton />
      </PageHeader>

      {forms.length === 0 ? (
        <EmptyState
          title="Noch keine Formulare"
          description='Beginne mit einem ersten Formular — z.B. „Boudoir-Anfrage" oder „Erstgespräch".'
        />
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link
                href={`/formulare/${f.id}`}
                className="card flex items-center gap-4 p-4 hover:bg-linen/50 transition"
                style={{ opacity: f.isActive ? 1 : 0.6 }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: f.isActive ? "rgb(var(--accent-soft))" : "rgb(var(--linen))",
                    color: f.isActive ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))",
                  }}
                >
                  {f.isActive ? <Zap size={15} /> : <Pause size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-smoke mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="font-mono">/anfrage/{f.slug}</span>
                    <span>{f._count.fields} {f._count.fields === 1 ? "Feld" : "Felder"}</span>
                    <span>{f._count.leads} {f._count.leads === 1 ? "Anfrage" : "Anfragen"}</span>
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-full shrink-0"
                  style={{
                    background: f.isActive ? "#E6F3EC" : "#F2F1EE",
                    color: f.isActive ? "#2F6B4A" : "#7D7878",
                  }}
                >
                  {f.isActive ? "Aktiv" : "Pausiert"}
                </span>
                <ChevronRight size={15} className="text-smoke shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
