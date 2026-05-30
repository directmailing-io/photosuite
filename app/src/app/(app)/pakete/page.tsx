import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Package as PackageIcon, Plus, Clock } from "lucide-react";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaketePage() {
  const packages = await prisma.package.findMany({
    orderBy: [{ isActive: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { shootings: true } } },
  });

  return (
    <>
      <PageHeader
        eyebrow="Dein Angebot"
        title="Pakete"
        subtitle="Vordefinierte Shooting-Pakete mit Preisen und Zahlungsbedingungen."
      >
        <Link href="/pakete/neu" className="btn-accent">
          <Plus size={16} /> Neues Paket
        </Link>
      </PageHeader>

      {packages.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={36} strokeWidth={1.25} />}
          title="Noch keine Pakete"
          description={`Lege z.B. „Boudoir Classic", „Premium" oder eine Editorial-Edition an.`}
          action={
            <Link href="/pakete/neu" className="btn-accent">
              <Plus size={16} /> Erstes Paket anlegen
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {packages.map((p) => (
            <Link
              key={p.id}
              href={`/pakete/${p.id}`}
              className="card card-hover overflow-hidden flex flex-col"
              style={{ opacity: p.isActive ? 1 : 0.55 }}
            >
              <div className="aspect-[16/9] bg-linen relative overflow-hidden">
                {p.coverUrl ? (
                  <img src={p.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-taupe">
                    <PackageIcon size={42} strokeWidth={1} />
                  </div>
                )}
                {!p.isActive && (
                  <div className="absolute top-3 right-3 badge bg-paper text-smoke">
                    Archiviert
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="font-serif text-2xl text-ink">{p.name}</div>
                {p.description && (
                  <div className="text-sm text-smoke mt-2 line-clamp-2">{p.description}</div>
                )}
                <div className="hairline mt-4 pt-4 flex items-end justify-between">
                  <div>
                    <div className="font-serif text-2xl tabular-nums">{formatEUR(p.price)}</div>
                    {p.durationMin && (
                      <div className="text-xs text-smoke mt-1 flex items-center gap-1">
                        <Clock size={12} /> {p.durationMin} min
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-smoke">
                    <div>{p._count.shootings} Shootings</div>
                    {p.depositAmount && <div className="mt-0.5">{formatEUR(p.depositAmount)} Anzahlung</div>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
