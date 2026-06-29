import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Receipt, Send, AlertCircle, FileCheck2, Percent, ListFilter, TrendingUp } from "lucide-react";
import { eurFromCents } from "@/lib/money";
import { RevenueChart, StatusDonut } from "./Charts";

export const dynamic = "force-dynamic";

/**
 * Finanz-Übersicht (Dashboard). Aggregiert alle Rechnungen über die letzten 12 Monate.
 *
 * Performance: Eine Query ohne Customer-Include (nicht gebraucht für Aggregates).
 * Charts werden auf der Client-Seite mit recharts gerendert.
 */
export default async function FinanzenPage() {
  const userId = await requireUserId();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const invoices = await prisma.invoice.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      kind: true,
      status: true,
      issueDate: true,
      paidAt: true,
      dueDate: true,
      totalCents: true,
      vatAmountCents: true,
      amountDueCents: true,
      shooting: { select: { package: { select: { name: true } } } },
    },
    orderBy: { issueDate: "desc" },
  });

  const isOverdue = (i: typeof invoices[number]) => i.status === "ISSUED" && i.dueDate < now;

  // Top-level KPIs
  const ytdPaid = invoices
    .filter((i) => i.status === "PAID" && i.paidAt && i.paidAt >= yearStart)
    .reduce((s, i) => s + i.totalCents, 0);
  const ytdTaxes = invoices
    .filter((i) => i.status === "PAID" && i.paidAt && i.paidAt >= yearStart)
    .reduce((s, i) => s + i.vatAmountCents, 0);
  const openSum = invoices.filter((i) => i.status === "ISSUED").reduce((s, i) => s + i.amountDueCents, 0);
  const overdueSum = invoices.filter(isOverdue).reduce((s, i) => s + i.amountDueCents, 0);

  // Umsatz pro Monat (letzte 12 Monate) — bezahlte Rechnungen nach paidAt.
  const monthData: { month: string; paid: number; taxes: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const monthLabel = d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
    const inMonth = invoices.filter((i) => i.status === "PAID" && i.paidAt && i.paidAt >= d && i.paidAt < next);
    const paid = inMonth.reduce((s, i) => s + i.totalCents, 0) / 100;
    const taxes = inMonth.reduce((s, i) => s + i.vatAmountCents, 0) / 100;
    monthData.push({ month: monthLabel, paid, taxes });
  }

  // Status-Verteilung (für Donut)
  const statusData = [
    { name: "Bezahlt", value: invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0) / 100, color: "#2F6B3B" },
    { name: "Offen", value: invoices.filter((i) => i.status === "ISSUED" && !isOverdue(i)).reduce((s, i) => s + i.amountDueCents, 0) / 100, color: "#7A746B" },
    { name: "Überfällig", value: overdueSum / 100, color: "#C8102E" },
    { name: "Entwurf", value: invoices.filter((i) => i.status === "DRAFT").reduce((s, i) => s + i.totalCents, 0) / 100, color: "#B0A096" },
  ].filter((d) => d.value > 0);

  // Top 5 Pakete nach Umsatz YTD
  const packageMap = new Map<string, number>();
  for (const i of invoices) {
    if (i.status !== "PAID" || !i.paidAt || i.paidAt < yearStart) continue;
    const name = i.shooting?.package?.name ?? "Ohne Paket";
    packageMap.set(name, (packageMap.get(name) ?? 0) + i.totalCents);
  }
  const topPackages = Array.from(packageMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Finanzen"
        title="Übersicht"
        subtitle="Umsatz, Steuern, offene und überfällige Beträge auf einen Blick."
      >
        <Link href="/buchhaltung" className="btn-secondary">
          <ListFilter size={15} /> Rechnungen-Liste
        </Link>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KPI label="Einnahmen YTD" value={eurFromCents(ytdPaid)} sub={`${new Date().getFullYear()}`} icon={<TrendingUp size={15} />} />
        <KPI label="Steuern YTD" value={eurFromCents(ytdTaxes)} sub="USt eingenommen" icon={<Percent size={15} />} />
        <KPI label="Offen" value={eurFromCents(openSum)} sub="Nicht überfällig" icon={<Send size={15} />} />
        <KPI label="Überfällig" value={eurFromCents(overdueSum)} sub="Sofort eintreiben" icon={<AlertCircle size={15} />} tint={overdueSum > 0 ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 card p-6">
          <div className="eyebrow eyebrow-muted mb-1">Umsatz pro Monat</div>
          <div className="text-xs text-smoke mb-4">Bezahlte Rechnungen, letzte 12 Monate.</div>
          <RevenueChart data={monthData} />
        </div>
        <div className="card p-6">
          <div className="eyebrow eyebrow-muted mb-1">Status-Verteilung</div>
          <div className="text-xs text-smoke mb-4">Aktuell aktive Beträge.</div>
          {statusData.length === 0 ? (
            <div className="text-sm text-smoke text-center py-12">Noch keine Daten.</div>
          ) : (
            <StatusDonut data={statusData} />
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="eyebrow eyebrow-muted mb-1">Top-Pakete YTD</div>
        <div className="text-xs text-smoke mb-4">Welche Pakete bringen am meisten ein?</div>
        {topPackages.length === 0 ? (
          <div className="text-sm text-smoke text-center py-6">Noch keine Daten in diesem Jahr.</div>
        ) : (
          <ul className="space-y-2">
            {topPackages.map(([name, cents], idx) => {
              const maxCents = topPackages[0][1];
              const pct = maxCents > 0 ? (cents / maxCents) * 100 : 0;
              return (
                <li key={name} className="flex items-center gap-3">
                  <div className="text-xs text-smoke w-5 text-right">{idx + 1}.</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{name}</span>
                      <span className="tabular-nums font-medium">{eurFromCents(cents)}</span>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: "rgb(var(--linen))" }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: "rgb(var(--accent))" }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function KPI({
  label, value, sub, icon, tint,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode; tint?: "danger";
}) {
  const bg = tint === "danger" ? "rgb(var(--accent-soft))" : undefined;
  const border = tint === "danger" ? "rgb(var(--accent) / 0.3)" : undefined;
  return (
    <div className="card p-4" style={{ background: bg, borderColor: border }}>
      <div className="flex items-center gap-2" style={{ color: tint === "danger" ? "rgb(var(--accent))" : "rgb(var(--taupe))" }}>
        {icon}<div className="eyebrow eyebrow-muted" style={{ color: tint === "danger" ? "rgb(var(--accent))" : undefined }}>{label}</div>
      </div>
      <div className="font-serif text-2xl mt-2 tabular-nums" style={{ color: tint === "danger" ? "rgb(var(--accent-deep))" : undefined }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: tint === "danger" ? "rgb(var(--accent))" : "rgb(var(--taupe))" }}>{sub}</div>
    </div>
  );
}
