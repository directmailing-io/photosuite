import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import {
  Receipt, ChevronRight, AlertCircle, FileCheck2, CircleDashed, Send,
  ClipboardX, Inbox, CircleSlash,
} from "lucide-react";
import { eurFromCents } from "@/lib/money";
import { formatDate, relativeDate, cn } from "@/lib/utils";
import { InvoiceQuickActions } from "./InvoiceQuickActions";
import { SearchBar } from "./SearchBar";

export const dynamic = "force-dynamic";

type FilterKey = "ALL" | "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "CANCELLED";

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Anzahlung",
  INTERIM: "Teilrechnung",
  FINAL: "Rechnung",
  CANCEL: "Storno",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: "Entwurf",     color: "#9F877F" },
  ISSUED:    { label: "Versendet",   color: "#19191A" },
  PAID:      { label: "Bezahlt",     color: "#2F6B4A" },
  OVERDUE:   { label: "Überfällig",  color: "#C8102E" },
  CANCELLED: { label: "Storniert",   color: "#7D7878" },
};

export default async function BuchhaltungPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const filter = (sp.filter as FilterKey) ?? "ALL";
  const q = (sp.q ?? "").trim().toLowerCase();
  const fromDate = sp.from ? new Date(sp.from + "T00:00:00") : null;
  // "bis" inklusiv: bis Tagesende
  const toDate = sp.to ? new Date(sp.to + "T23:59:59") : null;

  const userId = await requireUserId();
  const [user, all] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.invoice.findMany({
      where: { ownerId: userId },
      include: { customer: true, shooting: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const now = new Date();
  const isOverdue = (i: typeof all[number]) =>
    i.status === "ISSUED" && i.dueDate < now;

  function matchesText(i: typeof all[number]) {
    if (!q) return true;
    const haystack = [
      i.number,
      `${i.customer.firstName} ${i.customer.lastName}`,
      i.shooting?.title,
      i.recipientName,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  }
  function matchesDate(i: typeof all[number]) {
    if (fromDate && i.issueDate < fromDate) return false;
    if (toDate && i.issueDate > toDate) return false;
    return true;
  }

  const filtered = all.filter((i) => {
    if (!matchesText(i) || !matchesDate(i)) return false;
    if (filter === "ALL") return true;
    if (filter === "DRAFT") return i.status === "DRAFT";
    if (filter === "OPEN") return i.status === "ISSUED" && !isOverdue(i);
    if (filter === "PAID") return i.status === "PAID";
    if (filter === "OVERDUE") return isOverdue(i);
    if (filter === "CANCELLED") return i.status === "CANCELLED";
    return true;
  });

  // Counts spiegeln den aktuellen Such-/Datums-Filter (NICHT den Status-Filter, weil die
  // Chips ja gerade ihn umschalten). Wenn man „Anna" sucht, zeigen die Chips, wie viele
  // Anna-Rechnungen pro Status existieren.
  const scoped = all.filter((i) => matchesText(i) && matchesDate(i));
  const counts = {
    ALL: scoped.length,
    DRAFT: scoped.filter((i) => i.status === "DRAFT").length,
    OPEN: scoped.filter((i) => i.status === "ISSUED" && !isOverdue(i)).length,
    PAID: scoped.filter((i) => i.status === "PAID").length,
    OVERDUE: scoped.filter(isOverdue).length,
    CANCELLED: scoped.filter((i) => i.status === "CANCELLED").length,
  };

  // KPIs (nur nicht-stornierte)
  const openSum = all
    .filter((i) => i.status === "ISSUED")
    .reduce((s, i) => s + i.amountDueCents, 0);
  const overdueSum = all.filter(isOverdue).reduce((s, i) => s + i.amountDueCents, 0);
  const paidThisMonth = all
    .filter((i) => i.status === "PAID" && i.paidAt && i.paidAt.getMonth() === now.getMonth() && i.paidAt.getFullYear() === now.getFullYear())
    .reduce((s, i) => s + i.totalCents, 0);

  const profileMissing =
    !user?.invoiceCompanyName ||
    !user?.invoiceStreet ||
    !user?.invoiceZip ||
    (!user?.invoiceTaxId && !user?.invoiceVatId);

  return (
    <>
      <PageHeader
        eyebrow="Buchhaltung"
        title="Rechnungen"
        subtitle="Alle Rechnungen, Anzahlungen und Stornos — auf einen Klick als PDF, ohne juristisches Risiko."
      />

      {profileMissing && (
        <div className="card p-4 mb-6 flex items-start gap-3" style={{ background: "rgb(var(--accent-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--accent))" }}>
          <AlertCircle size={18} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">Rechnungs-Profil unvollständig</div>
            <div className="text-smoke text-xs mt-0.5">
              Firmenname, Adresse und Steuernummer (oder USt-IdNr) sind Pflicht, bevor du Rechnungen ausstellen kannst.
            </div>
          </div>
          <Link href="/einstellungen" className="btn-secondary text-xs h-9 shrink-0">
            Jetzt vervollständigen
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <KPI label="Offen" value={eurFromCents(openSum)} sub={`${counts.OPEN} Rechnung${counts.OPEN === 1 ? "" : "en"}`} icon={<Send size={15} />} />
        <KPI label="Überfällig" value={eurFromCents(overdueSum)} sub={`${counts.OVERDUE} Rechnung${counts.OVERDUE === 1 ? "" : "en"}`} icon={<AlertCircle size={15} />} accent={overdueSum > 0} />
        <KPI label="Bezahlt diesen Monat" value={eurFromCents(paidThisMonth)} sub="Brutto" icon={<FileCheck2 size={15} />} />
      </div>

      <SearchBar />

      {/* Filter-Chips — behalten q/from/to beim Statuswechsel */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip current={filter} value="ALL" label="Alle" count={counts.ALL} preserve={sp} />
        <FilterChip current={filter} value="DRAFT" label="Entwurf" count={counts.DRAFT} icon={<CircleDashed size={11} />} preserve={sp} />
        <FilterChip current={filter} value="OPEN" label="Offen" count={counts.OPEN} icon={<Send size={11} />} preserve={sp} />
        <FilterChip current={filter} value="OVERDUE" label="Überfällig" count={counts.OVERDUE} accent icon={<AlertCircle size={11} />} preserve={sp} />
        <FilterChip current={filter} value="PAID" label="Bezahlt" count={counts.PAID} icon={<FileCheck2 size={11} />} preserve={sp} />
        <FilterChip current={filter} value="CANCELLED" label="Storniert" count={counts.CANCELLED} icon={<CircleSlash size={11} />} preserve={sp} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox size={36} strokeWidth={1.25} />}
          title={filter === "ALL" ? "Noch keine Rechnungen" : "Nichts in dieser Auswahl"}
          description={
            filter === "ALL"
              ? `Rechnungen entstehen direkt aus Shootings oder Kunden — einfach im jeweiligen Detail auf „Rechnung erstellen" klicken.`
              : "Schalte oben einen anderen Filter ein."
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <ul>
            {filtered.map((inv) => {
              const c = inv.customer;
              const isOver = isOverdue(inv);
              const statusKey = isOver ? "OVERDUE" : inv.status;
              const meta = STATUS_META[statusKey] ?? STATUS_META.DRAFT;
              return (
                <li key={inv.id} className="border-t border-stone/60 first:border-0 group hover:bg-linen/50 transition">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <Link
                      href={`/buchhaltung/${inv.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <Avatar url={c.avatarUrl} firstName={c.firstName} lastName={c.lastName} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium text-sm font-mono">{inv.number ?? "(Entwurf)"}</div>
                          <span className="badge" style={{ background: "rgb(var(--linen))", color: "rgb(var(--smoke))" }}>
                            {KIND_LABEL[inv.kind] ?? inv.kind}
                          </span>
                        </div>
                        <div className="text-xs text-smoke mt-0.5">
                          {c.firstName} {c.lastName}
                          {inv.shooting && <span> · {inv.shooting.title}</span>}
                        </div>
                        <div className="text-xs text-smoke mt-1">
                          Ausgestellt {formatDate(inv.issueDate)}
                          {inv.status === "ISSUED" && (
                            <span style={{ color: isOver ? "rgb(var(--accent))" : "rgb(var(--smoke))" }}>
                              {" "}· fällig {formatDate(inv.dueDate)}
                            </span>
                          )}
                          {inv.paidAt && <span> · bezahlt {relativeDate(inv.paidAt)}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium tabular-nums">{eurFromCents(inv.totalCents)}</div>
                        <span className="badge mt-1" style={{ background: `${meta.color}15`, color: meta.color }}>
                          {meta.label}
                        </span>
                      </div>
                    </Link>
                    <InvoiceQuickActions
                      invoiceId={inv.id}
                      status={inv.status}
                      sentAt={inv.sentAt?.toISOString() ?? null}
                      kind={inv.kind}
                    />
                    <Link href={`/buchhaltung/${inv.id}`} aria-label="Öffnen" className="shrink-0">
                      <ChevronRight size={16} className="text-smoke" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function KPI({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-smoke">{icon}<div className="eyebrow eyebrow-muted">{label}</div></div>
      <div className="font-serif text-2xl mt-2 tabular-nums" style={{ color: accent ? "rgb(var(--accent))" : undefined }}>{value}</div>
      <div className="text-xs text-smoke mt-1">{sub}</div>
    </div>
  );
}

function FilterChip({
  current, value, label, count, accent, icon, preserve,
}: {
  current: string; value: string; label: string; count: number; accent?: boolean; icon?: React.ReactNode;
  preserve?: { q?: string; from?: string; to?: string };
}) {
  const active = current === value;
  const params = new URLSearchParams();
  if (value !== "ALL") params.set("filter", value);
  if (preserve?.q) params.set("q", preserve.q);
  if (preserve?.from) params.set("from", preserve.from);
  if (preserve?.to) params.set("to", preserve.to);
  const qs = params.toString();
  return (
    <Link
      href={qs ? `/buchhaltung?${qs}` : "/buchhaltung"}
      className="badge transition"
      style={{
        background: active ? "rgb(var(--ink))" : accent && count > 0 ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
        color: active ? "rgb(var(--bg))" : accent && count > 0 ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))",
        border: active ? "none" : "1px solid rgb(var(--stone))",
        padding: "6px 12px",
      }}
    >
      {icon}
      {label}
      <span className="tabular-nums" style={{ opacity: 0.7 }}>{count}</span>
    </Link>
  );
}
