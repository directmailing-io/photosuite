import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LeadForm as LegacyLeadForm } from "./LeadForm";
import { LeadFormRender } from "@/lib/leadForm/render";
import { loadFormById } from "@/lib/leadForm/load";

export const dynamic = "force-dynamic";

/**
 * Public-Anfrage-Seite. Auflösung in dieser Reihenfolge:
 *   1) Gibt es ein aktives LeadForm mit diesem Slug? → neuer Builder-Form
 *   2) Gibt es einen User mit diesem leadSlug? → Legacy-Form (hartkodiert)
 *   3) Sonst 404
 *
 * Studio-Header (Logo/Name) drumherum bleibt in beiden Fällen gleich.
 */
export default async function AnfragePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 1) Builder-Form zuerst — gewinnt bei Slug-Konflikt mit Legacy
  const builderForm = await prisma.leadForm.findFirst({
    where: { slug, isActive: true },
    select: { id: true, ownerId: true },
  });

  if (builderForm) {
    const [studio, fullForm] = await Promise.all([
      prisma.user.findUnique({
        where: { id: builderForm.ownerId },
        select: { studioName: true, studioTagline: true, logoUrl: true, name: true },
      }),
      loadFormById(builderForm.id),
    ]);
    if (!studio || !fullForm) return notFound();
    const name = studio.studioName ?? studio.name;

    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <header className="px-6 py-6 border-b border-stone/60">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {studio.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt={name} className="h-10 w-auto object-contain" />
            ) : (
              <div className="font-serif italic text-2xl" style={{ color: "rgb(var(--ink))" }}>
                {name}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1">
          <LeadFormRender form={fullForm} />
        </main>
        <footer className="px-6 py-4 text-xs text-smoke text-center">
          Deine Daten landen sicher bei {name} und werden ausschließlich für deine Anfrage genutzt.
        </footer>
      </div>
    );
  }

  // 2) Legacy-User-Slug (alte hartkodierte Form bleibt für Backwards-Compat aktiv)
  const studio = await prisma.user.findUnique({
    where: { leadSlug: slug },
    select: { studioName: true, studioTagline: true, studioWebsite: true, logoUrl: true, name: true },
  });
  if (!studio) return notFound();
  const name = studio.studioName ?? studio.name;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-6 py-6 border-b border-stone/60">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {studio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={name} className="h-10 w-auto object-contain" />
          ) : (
            <div className="font-serif italic text-2xl" style={{ color: "rgb(var(--ink))" }}>
              {name}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="eyebrow eyebrow-muted">Anfrage</div>
            <h1 className="font-serif text-4xl mt-2">Hi, schön dass du da bist.</h1>
            <p className="text-sm text-smoke mt-3 max-w-md mx-auto leading-relaxed">
              Erzähl mir kurz, was du dir vorstellst — ich melde mich persönlich bei dir
              und wir vereinbaren ein unverbindliches Erstgespräch.
              {studio.studioTagline && <><br /><em>{studio.studioTagline}</em></>}
            </p>
          </div>

          <LegacyLeadForm slug={slug} />

          <div className="text-xs text-smoke text-center mt-8 leading-relaxed">
            Deine Daten landen sicher bei {name} und werden ausschließlich für deine Anfrage genutzt.
            Du kannst jederzeit Auskunft oder Löschung verlangen.
          </div>
        </div>
      </main>
    </div>
  );
}
