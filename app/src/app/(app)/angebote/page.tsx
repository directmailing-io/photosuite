import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { FileSignature, Plus, ChevronRight, Send, CheckCircle2, XCircle, CircleDashed, Hourglass, ArrowLeftRight } from "lucide-react";
import { eurFromCents } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";
import { NewOfferButton } from "./NewOfferButton";

export const dynamic = "force-dynamic";

type FilterKey = "ALL" | "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";

const STATUS_META: Record<string, { label: string; color: string; Icon: typeof Send }> = {
  DRAFT:     { label: "Entwurf",       color: "rgb(var(--taupe))",        Icon: CircleDashed },
  SENT:      { label: "Versendet",     color: "rgb(var(--ink))",          Icon: Send },
  ACCEPTED:  { label: "Angenommen",    color: "rgb(var(--success-deep))", Icon: CheckCircle2 },
  DECLINED:  { label: "Abgelehnt",     color: "rgb(var(--danger-deep))",  Icon: XCircle },
  EXPIRED:   { label: "Abgelaufen",    color: "rgb(var(--taupe))",        Icon: Hourglass },
  WITHDRAWN: { label: "Zurückgezogen", color: "rgb(var(--taupe))",        Icon: XCircle },
};

export default async function AngebotePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = (sp.filter as FilterKey) ?? "ALL";
  const userId = await requireUserId();

  // Lazy-Auto-Expire: SENT-Angebote mit abgelaufenem validUntil → EXPIRED
  const now = new Date();
  await prisma.offer.updateMany({
    where: {
      ownerId: userId,
      status: "SENT",
      validUntil: { lt: now },
    },
    data: { status: "EXPIRED" },
  });

  const [customers, offers] = await Promise.all([
    prisma.customer.findMany({
      where: { ownerId: userId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.offer.findMany({
      where: { ownerId: userId },
      include: { customer: true, convertedInvoice: { select: { id: true, number: true } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  function matchesFilter(o: typeof offers[number]) {
    if (filter === "ALL") return true;
    return o.status === filter;
  }
  const filtered = offers.filter(matchesFilter);

  const counts = {
    ALL: offers.length,
    DRAFT: offers.filter((o) => o.status === "DRAFT").length,
    SENT: offers.filter((o) => o.status === "SENT").length,
    ACCEPTED: offers.filter((o) => o.status === "ACCEPTED").length,
    DECLINED: offers.filter((o) => o.status === "DECLINED").length,
    EXPIRED: offers.filter((o) => o.status === "EXPIRED").length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Vor der Rechnung"
        title="Angebote"
        subtitle="Sende der Kundin einen Vorschlag, lasse sie online annehmen — und konvertiere ihn dann in eine Rechnung."
      >
        <NewOfferButton customers={customers.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email,
        }))} />
      </PageHeader>

      {/* Filter-Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        {(["ALL", "DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"] as FilterKey[]).map((k) => (
          <Link
            key={k}
            href={k === "ALL" ? "/angebote" : `/angebote?filter=${k}`}
            className={cn(
              "px-3 py-1.5 rounded-full border transition",
              filter === k ? "bg-ink text-paper border-ink" : "border-stone hover:bg-linen",
            )}
          >
            {k === "ALL" ? "Alle" : STATUS_META[k]?.label} · {counts[k] ?? 0}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={filter === "ALL" ? "Noch keine Angebote" : `Keine Angebote in „${STATUS_META[filter]?.label ?? filter}"`}
          description={filter === "ALL"
            ? "Erstelle ein erstes Angebot — z.B. nach dem Erstgespräch mit einer Lead."
            : "Sobald sich der Status ändert, erscheinen die Angebote hier."}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((o) => {
            const meta = STATUS_META[o.status] ?? STATUS_META.DRAFT;
            const Icon = meta.Icon;
            return (
              <li key={o.id}>
                <Link
                  href={`/angebote/${o.id}`}
                  className="card flex items-center gap-4 p-4 hover:bg-linen/50 transition"
                >
                  <Avatar firstName={o.customer.firstName} lastName={o.customer.lastName} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {o.customer.firstName} {o.customer.lastName}
                      </span>
                      <span className="text-xs text-smoke">
                        {o.number ?? "Entwurf"}
                      </span>
                      {o.convertedInvoice && (
                        <span className="badge inline-flex items-center gap-1" style={{ background: "rgb(var(--success-soft))", color: "rgb(var(--success-deep))" }}>
                          <ArrowLeftRight size={10} /> Rechnung {o.convertedInvoice.number ?? "—"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-smoke mt-0.5 flex flex-wrap gap-3">
                      <span>{formatDate(o.issueDate)}</span>
                      {o.validUntil && (
                        <span>gültig bis {formatDate(o.validUntil)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium tabular-nums">{eurFromCents(o.totalCents)}</div>
                    <div className="inline-flex items-center gap-1 text-xs mt-0.5" style={{ color: meta.color }}>
                      <Icon size={11} /> {meta.label}
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-smoke shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
