import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { QuickTaskList } from "@/components/QuickTaskList";
import { DashboardWidgetPicker } from "@/components/DashboardWidgetPicker";
import {
  CalendarDays, MapPin, Cake, Plus, Camera, TrendingUp,
  Inbox, Sparkles, ChevronRight, Wallet, PiggyBank, BarChart3,
} from "lucide-react";
import { formatDateTime, formatEUR, formatDate, relativeDate } from "@/lib/utils";
import {
  parseDashboardWidgets,
  WIDGET_DEFS,
  type WidgetKey,
} from "@/lib/dashboardWidgets";

export const dynamic = "force-dynamic";

function upcomingBirthday(birthday: Date | null): { date: Date; daysAway: number } | null {
  if (!birthday) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
  if (next < today) next.setFullYear(next.getFullYear() + 1);
  const days = Math.round((next.getTime() - today.getTime()) / 86400_000);
  if (days > 30) return null;
  return { date: next, daysAway: days };
}

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

export default async function Dashboard() {
  const userId = await requireUserId();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const qStart = quarterStart(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [
    user,
    upcoming,
    openTasks,
    customers,
    monthShootings,
    plannedMonthShootings,
    recentSubmissions,
    paidYear, paidQuarter, paidMonth,
    openInvoices,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.shooting.findMany({
      where: { ownerId: userId, scheduledAt: { gte: now } },
      include: { customer: true, status: true, package: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.task.findMany({
      where: { ownerId: userId, done: false },
      include: { customer: true, shooting: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    prisma.customer.findMany({
      where: { ownerId: userId, birthday: { not: null } },
      orderBy: { birthday: "asc" },
    }),
    prisma.shooting.count({
      where: { ownerId: userId, scheduledAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.shooting.findMany({
      where: { ownerId: userId, scheduledAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true, price: true, invoices: { select: { totalCents: true, status: true } } },
    }),
    prisma.questionnaire.findMany({
      where: { status: "SUBMITTED", shooting: { ownerId: userId } },
      include: { shooting: { include: { customer: true } } },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    // YTD bezahlt
    prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: { ownerId: userId, status: "PAID", paidAt: { gte: yearStart } },
    }),
    // Quartal bezahlt
    prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: { ownerId: userId, status: "PAID", paidAt: { gte: qStart } },
    }),
    // Monat bezahlt
    prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: { ownerId: userId, status: "PAID", paidAt: { gte: monthStart, lt: monthEnd } },
    }),
    // Offene Rechnungen (nicht PAID, nicht CANCELLED, mit amountDue>0)
    prisma.invoice.findMany({
      where: {
        ownerId: userId,
        status: { notIn: ["PAID", "CANCELLED"] },
        amountDueCents: { gt: 0 },
      },
      select: { id: true, amountDueCents: true, dueDate: true },
    }),
  ]);

  const newSubmissions = recentSubmissions.filter(
    (q) => !q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt),
  );

  // KPI-Berechnungen
  const plannedRevenueMonth = plannedMonthShootings.reduce((sum, s) => sum + s.price, 0);
  const collectedThisMonthCents = plannedMonthShootings.reduce(
    (sum, s) => sum + s.invoices.filter((i) => i.status === "PAID").reduce((is, i) => is + i.totalCents, 0),
    0,
  );
  const openPaymentsCents = openInvoices.reduce((s, i) => s + i.amountDueCents, 0);
  const overduePaymentsCents = openInvoices
    .filter((i) => i.dueDate && i.dueDate < now)
    .reduce((s, i) => s + i.amountDueCents, 0);

  const birthdays = customers
    .map((c) => ({ c, b: upcomingBirthday(c.birthday) }))
    .filter((x) => x.b !== null)
    .sort((a, b) => (a.b!.daysAway - b.b!.daysAway))
    .slice(0, 4);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 11) return "Guten Morgen";
    if (h < 18) return "Hallo";
    return "Guten Abend";
  })();

  // Widget-Auswahl (safe-parsed mit Default-Fallback)
  const widgets = parseDashboardWidgets(user?.dashboardWidgets);

  // Onboarding-Logik: nur laden, wenn noch nicht dismissed
  let showOnboarding = !user?.onboardingDismissed;
  let onboardingSteps: Array<{ key: string; label: string; href: string; done: boolean }> = [];

  if (showOnboarding) {
    const [pkgCount, teamCount, statusCount, custCount, invoiceProfileOk] = await Promise.all([
      prisma.package.count({ where: { ownerId: userId } }),
      prisma.teamMember.count({ where: { ownerId: userId } }),
      prisma.customerStatus.count({ where: { ownerId: userId } }),
      prisma.customer.count({ where: { ownerId: userId } }),
      prisma.user
        .findUnique({ where: { id: userId }, select: { invoiceCompanyName: true } })
        .then((u) => !!u?.invoiceCompanyName),
    ]);

    onboardingSteps = [
      { key: "studio", label: "Studio-Profil + Rechnungsdaten ausfüllen", href: "/einstellungen?tab=studio", done: invoiceProfileOk },
      { key: "team", label: "Team-Mitglied(er) anlegen", href: "/team", done: teamCount > 0 },
      { key: "status", label: "Status & Tags einrichten", href: "/einstellungen?tab=status", done: statusCount > 0 },
      { key: "pakete", label: "Erstes Paket erstellen", href: "/pakete/neu", done: pkgCount > 0 },
      { key: "kunde", label: "Erste Kundin anlegen", href: "/kunden/neu", done: custCount > 0 },
    ];

    // Auto-Dismiss: alle Schritte erledigt → Banner komplett ausblenden (irreversibel, idempotent).
    // Damit kein Flash-of-Banner beim nächsten Render.
    const allDone = onboardingSteps.every((s) => s.done);
    if (allDone) {
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingDismissed: true },
      });
      showOnboarding = false;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting}, ${user?.name?.split(" ")[0] ?? "Lisa"}.`}
        subtitle="Dein Überblick für heute und die kommenden Wochen."
      >
        <Link href="/shootings/neu" className="btn-secondary">
          <Plus size={15} /> Shooting
        </Link>
        <Link href="/kunden/neu" className="btn-accent">
          <Plus size={15} /> Kundin
        </Link>
      </PageHeader>

      {showOnboarding && <OnboardingBanner steps={onboardingSteps} />}

      {/* KPI-Bereich mit Konfigurations-Button */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="eyebrow eyebrow-muted">Kennzahlen</div>
          <DashboardWidgetPicker initial={widgets} />
        </div>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(widgets.length, 1), 4)}, minmax(0, 1fr))`,
          }}
        >
          {widgets.map((w) => (
            <WidgetCard
              key={w}
              widget={w}
              data={{
                revenueYearCents: paidYear._sum.totalCents ?? 0,
                revenueQuarterCents: paidQuarter._sum.totalCents ?? 0,
                revenueMonthCents: paidMonth._sum.totalCents ?? 0,
                plannedRevenueMonth,
                collectedThisMonthCents,
                monthShootings,
                openPaymentsCents,
                overduePaymentsCents,
                newSubmissionsCount: newSubmissions.length,
              }}
            />
          ))}
        </div>
      </section>

      {/* Fragebogen-Inbox bei neuen Einreichungen */}
      {newSubmissions.length > 0 && (
        <section className="card mb-6 overflow-hidden border-l-4" style={{ borderLeftColor: "rgb(var(--accent))" }}>
          <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
            <div>
              <div className="font-serif text-xl flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                Neue Einreichungen
              </div>
              <div className="text-xs text-smoke mt-0.5">
                {newSubmissions.length} {newSubmissions.length === 1 ? "Fragebogen wurde" : "Fragebögen wurden"} ausgefüllt
              </div>
            </div>
            <Link href="/fragebogen?filter=NEW" className="text-xs hover:underline">Alle ansehen →</Link>
          </div>
          <ul>
            {newSubmissions.slice(0, 3).map((q) => (
              <li key={q.id}>
                <Link
                  href={`/shootings/${q.shooting.id}/fragebogen/${q.id}`}
                  className="px-6 py-3 flex items-center gap-3 border-t border-stone/60 first:border-0 hover:bg-linen/50"
                >
                  <Avatar url={q.shooting.customer.avatarUrl} firstName={q.shooting.customer.firstName} lastName={q.shooting.customer.lastName} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{q.title}</div>
                    <div className="text-xs text-smoke mt-0.5">
                      {q.shooting.customer.firstName} {q.shooting.customer.lastName} · abgeschickt {q.submittedAt ? relativeDate(q.submittedAt) : ""}
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-smoke" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Nächste Shootings */}
        <div className="lg:col-span-2 card">
          <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
            <div>
              <div className="font-serif text-xl">Nächste Shootings</div>
              <div className="text-xs text-smoke mt-0.5">In der Pipeline</div>
            </div>
            <Link href="/shootings" className="text-xs hover:underline">Alle ansehen →</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-smoke">Keine geplanten Shootings.</div>
          ) : (
            <ul>
              {upcoming.map((s) => (
                <li key={s.id} className="px-6 py-4 border-t border-stone/60 first:border-0 hover:bg-linen/50">
                  <Link href={`/shootings/${s.id}`} className="flex items-start gap-4">
                    <Avatar url={s.customer.avatarUrl} firstName={s.customer.firstName} lastName={s.customer.lastName} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{s.title}</div>
                        {s.status && <StatusBadge label={s.status.label} color={s.status.color} />}
                      </div>
                      <div className="text-xs text-smoke mt-0.5">
                        {s.customer.firstName} {s.customer.lastName}
                        {s.package && <span> · {s.package.name}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-smoke">
                        <span className="flex items-center gap-1"><CalendarDays size={12} /> {formatDateTime(s.scheduledAt)}</span>
                        {s.location && <span className="flex items-center gap-1"><MapPin size={12} /> {s.location}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">{formatEUR(s.price)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Aufgaben + Geburtstage */}
        <div className="space-y-6">
          <div className="card">
            <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
              <div className="font-serif text-xl">Offene Aufgaben</div>
              <Link href="/aufgaben" className="text-xs hover:underline">Alle →</Link>
            </div>
            <QuickTaskList
              tasks={openTasks.map((t) => ({
                id: t.id,
                title: t.title,
                dueAt: t.dueAt?.toISOString() ?? null,
                customerId: t.customerId ?? null,
                customerName: t.customer ? `${t.customer.firstName} ${t.customer.lastName}` : null,
                shootingId: t.shootingId ?? null,
                shootingTitle: t.shooting?.title ?? null,
              }))}
            />
          </div>

          {birthdays.length > 0 && (
            <div className="card">
              <div className="px-6 py-4 border-b border-stone/60">
                <div className="font-serif text-xl flex items-center gap-2"><Cake size={18} /> Geburtstage</div>
                <div className="text-xs text-smoke mt-0.5">In den nächsten 30 Tagen</div>
              </div>
              <ul>
                {birthdays.map(({ c, b }) => (
                  <li key={c.id} className="px-6 py-3 border-t border-stone/60 first:border-0">
                    <Link href={`/kunden/${c.id}`} className="flex items-center gap-3 hover:underline">
                      <Avatar url={c.avatarUrl} firstName={c.firstName} lastName={c.lastName} size={32} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-smoke">
                          {b!.daysAway === 0 ? "Heute!" : b!.daysAway === 1 ? "Morgen" : `in ${b!.daysAway} Tagen`} · {formatDate(b!.date)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type WidgetData = {
  revenueYearCents: number;
  revenueQuarterCents: number;
  revenueMonthCents: number;
  plannedRevenueMonth: number;
  collectedThisMonthCents: number;
  monthShootings: number;
  openPaymentsCents: number;
  overduePaymentsCents: number;
  newSubmissionsCount: number;
};

function WidgetCard({ widget, data }: { widget: WidgetKey; data: WidgetData }) {
  const def = WIDGET_DEFS.find((w) => w.key === widget);
  if (!def) return null;

  switch (widget) {
    case "revenue_year":
      return <KPI label={def.label} value={formatEUR(data.revenueYearCents)} sub={def.sub} icon={<BarChart3 size={15} />} />;
    case "revenue_quarter":
      return <KPI label={def.label} value={formatEUR(data.revenueQuarterCents)} sub={def.sub} icon={<BarChart3 size={15} />} />;
    case "revenue_month":
      return <KPI label={def.label} value={formatEUR(data.revenueMonthCents)} sub={def.sub} icon={<PiggyBank size={15} />} />;
    case "revenue_planned_month":
      return (
        <KPI
          label={def.label}
          value={formatEUR(data.plannedRevenueMonth)}
          sub={`davon ${formatEUR(data.collectedThisMonthCents)} bezahlt`}
          icon={<TrendingUp size={15} />}
        />
      );
    case "shootings_month":
      return <KPI label={def.label} value={String(data.monthShootings)} sub="Shootings" icon={<Camera size={15} />} />;
    case "payments_open":
      return (
        <KPI
          label={def.label}
          value={formatEUR(data.openPaymentsCents)}
          sub={
            data.overduePaymentsCents > 0
              ? `${formatEUR(data.overduePaymentsCents)} überfällig`
              : "alles im Soll"
          }
          icon={<Wallet size={15} />}
          accent={data.openPaymentsCents > 0}
          warn={data.overduePaymentsCents > 0}
        />
      );
    case "submissions_new":
      return (
        <KPI
          label={def.label}
          value={String(data.newSubmissionsCount)}
          sub={def.sub}
          icon={<Inbox size={15} />}
          accent={data.newSubmissionsCount > 0}
        />
      );
  }
}

function KPI({
  label, value, sub, icon, accent, warn,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-smoke">{icon}<div className="eyebrow eyebrow-muted">{label}</div></div>
      <div
        className="font-serif text-3xl mt-2 tabular-nums"
        style={{ color: accent ? "rgb(var(--accent))" : undefined }}
      >
        {value}
      </div>
      <div
        className="text-xs mt-1"
        style={{ color: warn ? "rgb(var(--accent))" : "rgb(var(--taupe))" }}
      >
        {sub}
      </div>
    </div>
  );
}
