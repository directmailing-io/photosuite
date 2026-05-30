import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { CalendarDays, MapPin, Cake, Plus, Camera, CheckSquare, Users, TrendingUp, Inbox, FileQuestion, Sparkles, ChevronRight } from "lucide-react";
import { formatDateTime, formatEUR, formatDate, relativeDate } from "@/lib/utils";

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

export default async function Dashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [upcoming, openTasks, customers, monthShootings, allShootingsWithRevenue, recentSubmissions] = await Promise.all([
    prisma.shooting.findMany({
      where: { scheduledAt: { gte: now } },
      include: { customer: true, status: true, package: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.task.findMany({
      where: { done: false },
      include: { customer: true, shooting: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    prisma.customer.findMany({
      where: { birthday: { not: null } },
      orderBy: { birthday: "asc" },
    }),
    prisma.shooting.count({
      where: { scheduledAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.shooting.findMany({
      where: { scheduledAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.questionnaire.findMany({
      where: { status: "SUBMITTED" },
      include: { shooting: { include: { customer: true } } },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
  ]);
  const newSubmissions = recentSubmissions.filter(
    (q) => !q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt),
  );

  const monthRevenue = allShootingsWithRevenue.reduce((sum, s) => sum + s.price, 0);
  const openDeposits = allShootingsWithRevenue
    .filter((s) => !s.depositPaid && (s.depositAmount ?? 0) > 0)
    .reduce((sum, s) => sum + (s.depositAmount ?? 0), 0);

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

  return (
    <>
      <PageHeader
        eyebrow={now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting}, Lisa.`}
        subtitle="Dein Überblick für heute und die kommenden Wochen."
      >
        <Link href="/shootings/neu" className="btn-secondary">
          <Plus size={15} /> Shooting
        </Link>
        <Link href="/kunden/neu" className="btn-accent">
          <Plus size={15} /> Kundin
        </Link>
      </PageHeader>

      {/* KPI-Kacheln */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KPI label="Diesen Monat" value={String(monthShootings)} sub="Shootings" icon={<Camera size={15} />} />
        <KPI label="Monatsumsatz" value={formatEUR(monthRevenue)} sub="Geplant" icon={<TrendingUp size={15} />} />
        <KPI label="Offene Anzahlungen" value={formatEUR(openDeposits)} sub="Ausstehend" icon={<CalendarDays size={15} />} accent={openDeposits > 0} />
        <KPI label="Neue Antworten" value={String(newSubmissions.length)} sub="Fragebögen" icon={<Inbox size={15} />} accent={newSubmissions.length > 0} />
      </div>

      {/* Fragebogen-Inbox bei neuen Antworten */}
      {newSubmissions.length > 0 && (
        <section className="card mb-6 overflow-hidden border-l-4" style={{ borderLeftColor: "var(--accent)" }}>
          <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
            <div>
              <div className="font-serif text-xl flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                Neue Antworten
              </div>
              <div className="text-xs text-smoke mt-0.5">{newSubmissions.length} {newSubmissions.length === 1 ? "Fragebogen wurde" : "Fragebögen wurden"} ausgefüllt</div>
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
              <div className="text-xs text-smoke mt-0.5">Was als nächstes ansteht</div>
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
            {openTasks.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-smoke">Alles erledigt 🎉</div>
            ) : (
              <ul>
                {openTasks.map((t) => (
                  <li key={t.id} className="px-6 py-3 border-t border-stone/60 first:border-0 text-sm">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-smoke mt-0.5">
                      {t.dueAt && formatDate(t.dueAt)}
                      {t.dueAt && t.customer && " · "}
                      {t.customer && <span>{t.customer.firstName} {t.customer.lastName}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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

function KPI({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-smoke">{icon}<div className="eyebrow eyebrow-muted">{label}</div></div>
      <div className="font-serif text-3xl mt-2 tabular-nums" style={{ color: accent ? "var(--accent)" : undefined }}>{value}</div>
      <div className="text-xs text-smoke mt-1">{sub}</div>
    </div>
  );
}
