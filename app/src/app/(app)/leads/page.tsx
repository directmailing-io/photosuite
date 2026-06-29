import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Inbox, Phone, Mail, ChevronRight, Link as LinkIcon, Copy } from "lucide-react";
import { LeadSlugInput } from "./LeadSlugInput";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NEW: { label: "Neu", color: "#C8102E" },
  CONTACTED: { label: "Kontaktiert", color: "#7A746B" },
  CONSULTATION_BOOKED: { label: "Termin", color: "#2F6B3B" },
  CONSULTATION_DONE: { label: "Erstgespräch ✓", color: "#2F6B3B" },
  CONVERTED: { label: "Kundin", color: "#19191A" },
  LOST: { label: "Kein Fit", color: "#9F877F" },
};

function fmtDate(iso: Date): string {
  return iso.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const userId = await requireUserId();
  const filter = sp.status && STATUS_LABEL[sp.status] ? sp.status : "OPEN";

  const where = filter === "ALL"
    ? { ownerId: userId }
    : filter === "OPEN"
      ? { ownerId: userId, status: { notIn: ["CONVERTED", "LOST"] } }
      : { ownerId: userId, status: filter };

  const [user, leads, counts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { leadSlug: true } }),
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { convertedCustomer: { select: { id: true, firstName: true, lastName: true } } },
      take: 200,
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { ownerId: userId },
      _count: { status: true },
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count.status;
  const totalOpen = (countByStatus.NEW ?? 0) + (countByStatus.CONTACTED ?? 0)
    + (countByStatus.CONSULTATION_BOOKED ?? 0) + (countByStatus.CONSULTATION_DONE ?? 0);
  const totalAll = Object.values(countByStatus).reduce((s, n) => s + n, 0);

  const tabs = [
    { key: "OPEN", label: "Offen", count: totalOpen },
    { key: "NEW", label: "Neu", count: countByStatus.NEW ?? 0 },
    { key: "CONSULTATION_BOOKED", label: "Termine", count: countByStatus.CONSULTATION_BOOKED ?? 0 },
    { key: "CONVERTED", label: "Konvertiert", count: countByStatus.CONVERTED ?? 0 },
    { key: "LOST", label: "Kein Fit", count: countByStatus.LOST ?? 0 },
    { key: "ALL", label: "Alle", count: totalAll },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Anfragen"
        title="Leads"
        subtitle="Interessentinnen, die sich über dein öffentliches Formular gemeldet haben."
      />

      <LeadSlugInput initial={user?.leadSlug ?? ""} />

      <div className="flex items-center gap-1 mb-6 -mx-1 px-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = filter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "OPEN" ? "/leads" : `/leads?status=${t.key}`}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition whitespace-nowrap"
              style={{
                background: isActive ? "rgb(var(--ink))" : "transparent",
                color: isActive ? "rgb(var(--bg))" : "rgb(var(--taupe))",
                border: "1px solid",
                borderColor: isActive ? "rgb(var(--ink))" : "rgb(var(--stone))",
              }}
            >
              {t.label}{t.count > 0 ? ` · ${t.count}` : ""}
            </Link>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={<Inbox size={36} strokeWidth={1.25} />}
          title="Noch keine Anfragen"
          description={
            user?.leadSlug
              ? "Teile deinen Anfrage-Link auf Instagram, Website etc. — sobald sich jemand meldet, taucht der Lead hier auf."
              : "Lege oben einen Slug fest, um dein öffentliches Anfrage-Formular zu aktivieren."
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-stone/60">
            {leads.map((l) => {
              const status = STATUS_LABEL[l.status] ?? STATUS_LABEL.NEW;
              return (
                <li key={l.id}>
                  <Link
                    href={`/leads/${l.id}`}
                    className="px-5 py-4 flex items-center gap-4 hover:bg-linen/50 transition"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs shrink-0"
                      style={{ background: `${status.color}15`, color: status.color }}
                    >
                      {l.firstName[0]?.toUpperCase() ?? "?"}{l.lastName?.[0]?.toUpperCase() ?? ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">{l.firstName} {l.lastName ?? ""}</div>
                        <span
                          className="badge"
                          style={{ background: `${status.color}15`, color: status.color, border: "none" }}
                        >
                          {status.label}
                        </span>
                        {l.convertedCustomer && (
                          <span className="text-xs text-smoke">
                            → <Link href={`/kunden/${l.convertedCustomer.id}`} className="hover:underline">
                              {l.convertedCustomer.firstName} {l.convertedCustomer.lastName}
                            </Link>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-smoke mt-1 flex items-center gap-3 flex-wrap">
                        {l.email && <span className="flex items-center gap-1"><Mail size={11} /> {l.email}</span>}
                        {l.phone && <span className="flex items-center gap-1"><Phone size={11} /> {l.phone}</span>}
                        <span>{fmtDate(l.createdAt)}</span>
                      </div>
                      {l.message && (
                        <div className="text-xs text-ink/70 mt-1.5 line-clamp-1 max-w-2xl">{l.message}</div>
                      )}
                    </div>
                    <ChevronRight size={15} className="text-smoke shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
