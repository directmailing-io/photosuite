import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Package as PackageIcon, Plus, Clock, Coins, Image as ImageIcon } from "lucide-react";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  durationMin: number | null;
  depositAmount: number | null;
  isActive: boolean;
  kind: string;
  _count: { shootings: number };
};

export default async function PaketePage() {
  const userId = await requireUserId();
  const [user, packages] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { packageMode: true } }),
    prisma.package.findMany({
      where: { ownerId: userId },
      orderBy: [{ isActive: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { shootings: true } } },
    }),
  ]);
  const mode = (user?.packageMode ?? "all_in_one") as "all_in_one" | "modular";

  return (
    <>
      <PageHeader
        eyebrow="Dein Angebot"
        title="Pakete"
        subtitle={
          mode === "modular"
            ? "Modular: Anzahlungs-Pakete + Bildpakete getrennt verwaltet."
            : "Vordefinierte Shooting-Pakete mit Preisen und Zahlungsbedingungen."
        }
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
      ) : mode === "modular" ? (
        <ModularView packages={packages} />
      ) : (
        <PackageGrid packages={packages} />
      )}
    </>
  );
}

function ModularView({ packages }: { packages: PackageRow[] }) {
  const deposits = packages.filter((p) => p.kind === "deposit");
  const imagePacks = packages.filter((p) => p.kind === "image_pack");
  const unsorted = packages.filter((p) => p.kind !== "deposit" && p.kind !== "image_pack");

  return (
    <div className="space-y-10">
      <Group
        eyebrow="Anzahlungs-Pakete"
        Icon={Coins}
        description="Was die Kundin bei Buchung wählt — z.B. Solo / Couple / Reise."
        packages={deposits}
        emptyHint='Noch kein Anzahlungs-Paket. Lege z.B. „Solo Bamberg 150 €" an.'
      />
      <Group
        eyebrow="Bildpakete"
        Icon={ImageIcon}
        description="Was die Kundin bei der Bildauswahl wählt — z.B. 10 / 20 / 30 Bilder."
        packages={imagePacks}
        emptyHint='Noch kein Bildpaket. Lege z.B. „10 Bilder 440 €" an.'
      />
      {unsorted.length > 0 && (
        <Group
          eyebrow="Komplettpakete (klassisch)"
          Icon={PackageIcon}
          description="All-in-One — bleibt bestehen, falls du gemischte Pakete anbietest."
          packages={unsorted}
          emptyHint=""
        />
      )}
    </div>
  );
}

function Group({
  eyebrow, Icon, description, packages, emptyHint,
}: {
  eyebrow: string;
  Icon: typeof PackageIcon;
  description: string;
  packages: PackageRow[];
  emptyHint: string;
}) {
  return (
    <section>
      <div className="mb-4">
        <div className="eyebrow flex items-center gap-2"><Icon size={11} /> {eyebrow}</div>
        <div className="text-sm text-smoke mt-1">{description}</div>
      </div>
      {packages.length === 0 ? (
        <div className="card p-6 text-center text-sm text-smoke italic">{emptyHint}</div>
      ) : (
        <PackageGrid packages={packages} />
      )}
    </section>
  );
}

function PackageGrid({ packages }: { packages: PackageRow[] }) {
  return (
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
              // eslint-disable-next-line @next/next/no-img-element
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
  );
}
