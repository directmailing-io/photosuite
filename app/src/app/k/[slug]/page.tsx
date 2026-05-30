import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatEUR } from "@/lib/utils";
import Link from "next/link";
import {
  Calendar, MapPin, Clock, Phone, Mail, Globe, Instagram,
  ListChecks, CreditCard, Check, Heart, Star, UsersRound,
  FileQuestion, ChevronRight, CheckCircle2, Receipt, Download,
  AlertCircle, Hourglass,
} from "lucide-react";
import { CalendarDownloadButton } from "./CalendarDownloadButton";
import { LandingNav } from "./LandingNav";
import { Avatar } from "@/components/Avatar";
import { STATUS_LABELS, type StatusKey } from "@/lib/questionnaire";
import { eurFromCents } from "@/lib/money";
import { generateUrlToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function CustomerView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shooting = await prisma.shooting.findUnique({
    where: { publicSlug: slug },
    include: {
      customer: true,
      package: true,
      dates: { orderBy: { startAt: "asc" } },
      checklists: {
        where: { audience: "CUSTOMER" },
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
      primaryContact: { include: { expertise: true } },
      team: { include: { expertise: true } },
      questionnaires: {
        where: { status: { not: "DRAFT" } },
        orderBy: { position: "asc" },
      },
      // Rechnungen für dieses Shooting — Kundin sieht nur ausgestellte (keine Entwürfe).
      // Stornorechnungen werden zusammen mit dem stornierten Original ausgeblendet.
      invoices: {
        where: { status: { not: "DRAFT" } },
        orderBy: { issueDate: "desc" },
      },
    },
  });
  if (!shooting) return notFound();

  // Sichtbare Rechnungen: keine CANCEL-Belege, keine stornierten Originale (die werden komplett ausgeblendet,
  // weil sie für die Kundin als „nie passiert" gelten — die Stornorechnung allein wäre nur Papierkram).
  const visibleInvoices = shooting.invoices.filter(
    (i) => i.kind !== "CANCEL" && i.status !== "CANCELLED",
  );

  // Lazy: paymentToken sicherstellen, damit der Bezahllink-/Public-View-Link funktioniert.
  // Das passiert genau einmal pro Rechnung; danach bleibt der Token persistent.
  const invoicesWithToken = await Promise.all(
    visibleInvoices.map(async (inv) => {
      if (inv.paymentToken) return inv;
      const token = generateUrlToken();
      await prisma.invoice.update({ where: { id: inv.id }, data: { paymentToken: token } });
      return { ...inv, paymentToken: token };
    }),
  );

  // Studio-Profil = User-Profil
  const studio = await prisma.user.findFirst();

  const description = shooting.description ?? shooting.package?.description ?? null;

  const firstName = shooting.customer.firstName;
  const cover = shooting.package?.coverUrl;

  // Anstehende Zahlung für Hero-CTA: erste offene Rechnung (älteste fällige zuerst)
  const openInvoice = invoicesWithToken
    .filter((i) => i.status === "ISSUED")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  // Navigation: ohne „Übersicht" (= Hero, eh oben) und ohne „Investition" (die Rechnungen-Section
  // übernimmt die finanzielle Sicht). Nur Sections, die tatsächlich existieren.
  const navSections = [
    ...(shooting.questionnaires.length > 0 ? [{ id: "fragebogen", label: "Fragebogen" }] : []),
    ...(shooting.dates.length > 0 ? [{ id: "termine", label: "Termine" }] : []),
    ...(invoicesWithToken.length > 0 ? [{ id: "rechnungen", label: "Rechnungen" }] : []),
    ...((shooting.primaryContact || shooting.team.length > 0) ? [{ id: "team", label: "Team" }] : []),
    ...(shooting.checklists.length > 0 ? [{ id: "checkliste", label: "Checkliste" }] : []),
    ...(studio ? [{ id: "kontakt", label: "Kontakt" }] : []),
  ];

  return (
    <div className="min-h-screen bg-bg">
      <LandingNav sections={navSections} studioName={studio?.studioName} logoUrl={studio?.logoUrl} />
      {/* HERO */}
      <section className="relative isolate overflow-hidden -mt-24" style={{ minHeight: "70vh" }}>
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: cover
              ? `url("${cover}") center/cover no-repeat`
              : "linear-gradient(135deg, #19191A 0%, #2a2526 100%)",
          }}
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: "linear-gradient(180deg, rgba(25,25,26,0.55) 0%, rgba(25,25,26,0.25) 35%, rgba(25,25,26,0.92) 100%)",
          }}
        />

        <div className="max-w-5xl mx-auto px-6 pt-12 pb-20 min-h-[70vh] flex flex-col justify-end" style={{ color: "var(--bg)" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.85)" }}>
            <span style={{ display: "inline-block", width: 32, height: 1, background: "var(--accent)", marginRight: 12, verticalAlign: "middle" }}></span>
            {studio?.studioName ?? "Studio"}
          </div>
          <h1 className="font-serif font-medium mt-4 leading-[1.02]" style={{ fontSize: "clamp(40px, 7vw, 80px)" }}>
            Hi <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{firstName}</em>,
            <br />schön, dass du da bist.
          </h1>
          {description && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.92)" }}>
              {description}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-8 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
            {shooting.package && (
              <div>
                <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>Paket</div>
                <div className="font-serif text-xl">{shooting.package.name}</div>
              </div>
            )}
            {shooting.dates[0] && (
              <div>
                <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>Nächster Termin</div>
                <div className="font-serif text-xl">{fmtDate(shooting.dates[0].startAt)}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 -mt-12 relative space-y-12 pb-24">

        {/* FRAGEBÖGEN */}
        {shooting.questionnaires.length > 0 && (
          <section id="fragebogen" className="space-y-3 scroll-mt-20">
            {shooting.questionnaires.map((q) => {
              const meta = STATUS_LABELS[q.status as StatusKey] ?? STATUS_LABELS.SENT;
              const isDone = q.status === "SUBMITTED";
              return (
                <Link
                  key={q.id}
                  href={`/k/${slug}/fragebogen/${q.id}`}
                  className="card p-6 flex items-center gap-5 group hover:shadow-md transition"
                  style={{
                    background: isDone ? "var(--paper)" : "linear-gradient(135deg, var(--accent-soft) 0%, var(--paper) 100%)",
                    borderColor: isDone ? "var(--stone)" : "var(--accent)",
                    borderWidth: 1,
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: isDone ? "var(--linen)" : "var(--accent)", color: isDone ? "var(--smoke)" : "#fff" }}
                  >
                    {isDone ? <CheckCircle2 size={26} /> : <FileQuestion size={26} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="eyebrow" style={{ color: isDone ? "var(--smoke)" : "var(--accent)" }}>
                      {isDone ? "Fragebogen erledigt" : "Bitte ausfüllen"}
                    </div>
                    <div className="font-serif text-2xl mt-0.5">{q.title}</div>
                    {q.description && <div className="text-sm text-smoke mt-1 line-clamp-1">{q.description}</div>}
                    {isDone && q.submittedAt && (
                      <div className="text-xs text-smoke mt-1">Abgeschickt am {q.submittedAt.toLocaleDateString("de-DE")}</div>
                    )}
                  </div>
                  {!isDone && (
                    <div className="text-accent group-hover:translate-x-1 transition-transform">
                      <ChevronRight size={28} strokeWidth={1.5} />
                    </div>
                  )}
                </Link>
              );
            })}
          </section>
        )}

        {/* TERMINE */}
        {shooting.dates.length > 0 && (
          <section id="termine" className="card p-8 scroll-mt-20">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="eyebrow">Termine</div>
                <h2 className="font-serif text-3xl mt-1">Unser gemeinsamer Ablauf</h2>
              </div>
              {shooting.dates.length > 1 && (
                <CalendarDownloadButton slug={slug} label="Alle in Kalender" />
              )}
            </div>

            <ol className="relative">
              {shooting.dates.map((d, idx) => (
                <li key={d.id} className="relative pl-10 pb-8 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-bg border-2 flex items-center justify-center"
                    style={{ borderColor: "var(--accent)" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                  </span>
                  {idx < shooting.dates.length - 1 && (
                    <span className="absolute left-[9px] top-7 bottom-0 w-px" style={{ background: "var(--stone)" }} />
                  )}

                  <div className="flex flex-wrap items-baseline gap-3 mb-1">
                    <div className="font-serif text-2xl text-ink">{d.label}</div>
                    <div className="eyebrow eyebrow-muted">Termin {idx + 1}</div>
                  </div>
                  <div className="text-sm text-ink/80 mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="flex items-center gap-1.5"><Calendar size={14} className="text-taupe" /> {fmtDate(d.startAt)}</span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-taupe" />
                      {fmtTime(d.startAt)}{d.endAt && ` – ${fmtTime(d.endAt)}`}
                    </span>
                    {d.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-taupe" />
                        {d.locationUrl ? (
                          <a href={d.locationUrl} target="_blank" rel="noopener" className="hover:underline">{d.location}</a>
                        ) : d.location}
                      </span>
                    )}
                  </div>
                  {d.description && (
                    <p className="text-sm text-smoke mt-3 max-w-xl">{d.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    <CalendarDownloadButton slug={slug} dateId={d.id} label="In Kalender" size="sm" />
                    {d.locationUrl && (
                      <a
                        href={d.locationUrl}
                        target="_blank"
                        rel="noopener"
                        className="btn-secondary h-9 text-xs"
                      >
                        <MapPin size={13} /> Route
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* MAP-EMBED für ersten Termin mit Maps-Link */}
        {(() => {
          const first = shooting.dates.find((d) => d.locationUrl) ?? shooting.dates.find((d) => d.location);
          if (!first?.location) return null;
          const query = encodeURIComponent(first.location);
          const embed = `https://www.google.com/maps?q=${query}&output=embed`;
          return (
            <section className="card overflow-hidden">
              <div className="px-8 pt-6 pb-3">
                <div className="eyebrow">Standort</div>
                <h2 className="font-serif text-2xl mt-1">{first.location}</h2>
              </div>
              <div className="aspect-[16/9] bg-linen">
                <iframe
                  src={embed}
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </section>
          );
        })()}

        {/* Inline-CTA für offene Rechnung — vor der Rechnungsliste, fällt direkt ins Auge */}
        {openInvoice && (
          <Link
            href={`/k/r/${openInvoice.paymentToken}`}
            className="card p-5 sm:p-6 flex items-center gap-4 transition group hover:shadow-md"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #A30D24 100%)",
              color: "white",
              borderColor: "transparent",
            }}
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Receipt size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,0.85)" }}>
                Offene Rechnung
              </div>
              <div className="font-serif text-xl mt-0.5 truncate">
                {openInvoice.number ? `Rechnung ${openInvoice.number}` : "Rechnung"} · {eurFromCents(openInvoice.amountDueCents)}
              </div>
              <div className="text-xs opacity-90 mt-0.5">
                Fällig {openInvoice.dueDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
              </div>
            </div>
            <ChevronRight size={24} strokeWidth={1.5} className="group-hover:translate-x-1 transition-transform shrink-0" />
          </Link>
        )}

        {/* RECHNUNGEN */}
        {invoicesWithToken.length > 0 && (
          <section id="rechnungen" className="scroll-mt-20">
            <div className="mb-6">
              <div className="eyebrow">Beleg-Übersicht</div>
              <h2 className="font-serif text-3xl mt-1">Deine Rechnungen</h2>
              <p className="text-sm text-smoke mt-2 max-w-xl">
                Hier siehst du jede ausgestellte Rechnung — mit aktuellem Status, PDF-Download und der Möglichkeit, offene Beträge direkt online zu bezahlen.
              </p>
            </div>

            <div className="space-y-3">
              {invoicesWithToken.map((inv) => {
                const isPaid = inv.status === "PAID";
                const isProcessing = inv.stripePaymentStatus === "processing";
                const overdue = !isPaid && inv.dueDate < new Date();
                const kindLabel = inv.kind === "DEPOSIT" ? "Anzahlung" : inv.kind === "INTERIM" ? "Teilrechnung" : "Rechnung";

                return (
                  <div
                    key={inv.id}
                    className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: isPaid
                        ? "var(--success)"
                        : overdue
                        ? "var(--accent)"
                        : "var(--stone)",
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: isPaid ? "var(--success-soft)" : isProcessing ? "var(--linen)" : "var(--paper)",
                        color: isPaid ? "var(--success)" : "var(--smoke)",
                        border: "1px solid var(--stone)",
                      }}
                    >
                      {isPaid ? <CheckCircle2 size={20} /> : isProcessing ? <Hourglass size={20} /> : overdue ? <AlertCircle size={20} /> : <Receipt size={20} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                        <div className="font-serif text-xl">{kindLabel}</div>
                        {inv.number && <div className="font-mono text-sm text-smoke">{inv.number}</div>}
                      </div>
                      <div className="text-xs text-smoke mt-1">
                        Ausgestellt {inv.issueDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
                        {isPaid && inv.paidAt && (
                          <span style={{ color: "var(--success-deep)" }}>
                            {" "}· bezahlt {inv.paidAt.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                          </span>
                        )}
                        {!isPaid && (
                          <span style={{ color: overdue ? "var(--accent)" : "var(--smoke)" }}>
                            {" "}· fällig {inv.dueDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                          </span>
                        )}
                        {isProcessing && (
                          <span style={{ color: "var(--accent-deep)" }}> · Zahlung in Bearbeitung</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-serif text-2xl tabular-nums">{eurFromCents(inv.totalCents)}</div>
                      {!isPaid && inv.amountDueCents !== inv.totalCents && (
                        <div className="text-xs text-smoke">
                          noch zu zahlen: <span className="font-medium">{eurFromCents(inv.amountDueCents)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex sm:flex-col gap-2 shrink-0">
                      {!isPaid && inv.status === "ISSUED" && (
                        <Link
                          href={`/k/r/${inv.paymentToken}`}
                          className="btn-primary text-xs h-9"
                          style={{ minWidth: 130 }}
                        >
                          <CreditCard size={13} />
                          {isProcessing ? "Status ansehen" : "Bezahlen"}
                        </Link>
                      )}
                      {isPaid && (
                        <Link href={`/k/r/${inv.paymentToken}`} className="btn-secondary text-xs h-9" style={{ minWidth: 130 }}>
                          <CheckCircle2 size={13} /> Ansehen
                        </Link>
                      )}
                      <a
                        href={`/api/k/invoice/${inv.paymentToken}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="btn-ghost text-xs h-9"
                        title="PDF öffnen"
                      >
                        <Download size={13} /> PDF
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TEAM */}
        {(shooting.primaryContact || shooting.team.length > 0) && (() => {
          const primary = shooting.primaryContact;
          const others = shooting.team.filter((m) => m.id !== primary?.id);
          return (
            <section id="team" className="scroll-mt-20">
              <div className="mb-6">
                <div className="eyebrow">Wer dich begleitet</div>
                <h2 className="font-serif text-3xl mt-1">Dein Team am Tag</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {primary && (
                  <div className="card p-6 relative overflow-hidden">
                    <div className="absolute top-4 right-4 badge" style={{ background: "var(--accent)", color: "white", border: "none" }}>
                      <Star size={11} className="fill-current" /> Ansprechpartner:in
                    </div>
                    <div className="flex items-start gap-4">
                      <Avatar url={primary.avatarUrl} firstName={primary.firstName} lastName={primary.lastName} size={64} />
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-2xl">{primary.firstName} {primary.lastName}</div>
                        {primary.role && <div className="text-xs text-smoke mt-0.5">{primary.role}</div>}
                      </div>
                    </div>
                    {primary.bio && (
                      <p className="text-sm text-ink/80 mt-4 leading-relaxed">{primary.bio}</p>
                    )}
                    {(primary.email || primary.phone) && (
                      <div className="hairline mt-4 pt-3 text-xs text-smoke flex flex-wrap gap-x-4 gap-y-1">
                        {primary.email && <a href={`mailto:${primary.email}`} className="flex items-center gap-1 hover:text-ink"><Mail size={11} /> {primary.email}</a>}
                        {primary.phone && <a href={`tel:${primary.phone}`} className="flex items-center gap-1 hover:text-ink"><Phone size={11} /> {primary.phone}</a>}
                      </div>
                    )}
                  </div>
                )}
                {others.map((m) => (
                  <div key={m.id} className="card p-6">
                    <div className="flex items-start gap-4">
                      <Avatar url={m.avatarUrl} firstName={m.firstName} lastName={m.lastName} size={56} />
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-xl">{m.firstName} {m.lastName}</div>
                        {m.role && <div className="text-xs text-smoke mt-0.5">{m.role}</div>}
                        {m.expertise.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {m.expertise.map((e) => (
                              <span key={e.id} className="badge" style={{ background: `${e.color}12`, color: e.color }}>
                                {e.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {m.bio && (
                      <p className="text-sm text-smoke mt-4 leading-relaxed line-clamp-3">{m.bio}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* CHECKLISTEN */}
        {shooting.checklists.length > 0 && (
          <section id="checkliste" className="scroll-mt-20">
            <div className="mb-6">
              <div className="eyebrow">Damit alles glatt läuft</div>
              <h2 className="font-serif text-3xl mt-1">Kleine Checkliste für dich</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shooting.checklists.map((cl) => (
                <div key={cl.id} className="card p-6">
                  <div className="font-serif text-xl flex items-center gap-2 mb-4">
                    <ListChecks size={18} className="text-accent" />
                    {cl.title}
                  </div>
                  <ul className="space-y-2">
                    {cl.items.map((it) => (
                      <li key={it.id} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0"
                          style={{
                            borderColor: it.done ? "var(--accent)" : "var(--stone)",
                            background: it.done ? "var(--accent)" : "transparent",
                          }}>
                          {it.done && <Check size={12} className="text-white" />}
                        </span>
                        <span className={it.done ? "text-smoke line-through" : "text-ink"}>{it.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* KONTAKT-BLOCK */}
        {studio && (
          <section id="kontakt" className="card p-8 bg-ink text-bg overflow-hidden relative scroll-mt-20">
            <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full opacity-10" style={{ background: "var(--accent)" }} />
            <div className="relative">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Bei Fragen</div>
              <h2 className="font-serif text-3xl mt-1 mb-1">{studio.studioName ?? studio.name}</h2>
              {studio.studioTagline && <p className="text-sm opacity-75 max-w-xl">{studio.studioTagline}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-6 text-sm">
                {studio.studioPhone && (
                  <a href={`tel:${studio.studioPhone}`} className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Phone size={15} style={{ color: "var(--accent)" }} /> {studio.studioPhone}
                  </a>
                )}
                {studio.studioEmail && (
                  <a href={`mailto:${studio.studioEmail}`} className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Mail size={15} style={{ color: "var(--accent)" }} /> {studio.studioEmail}
                  </a>
                )}
                {studio.studioWebsite && (
                  <a href={studio.studioWebsite} target="_blank" className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Globe size={15} style={{ color: "var(--accent)" }} /> {studio.studioWebsite.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {studio.studioInstagram && (
                  <a href={`https://instagram.com/${studio.studioInstagram.replace(/^@/, "")}`} target="_blank" className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Instagram size={15} style={{ color: "var(--accent)" }} /> {studio.studioInstagram}
                  </a>
                )}
                {studio.studioAddress && (
                  <div className="flex items-start gap-3 col-span-full">
                    <MapPin size={15} style={{ color: "var(--accent)" }} className="mt-0.5" />
                    <span className="whitespace-pre-line">{studio.studioAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="text-center text-xs text-smoke flex items-center justify-center gap-1.5 pt-4">
          <Heart size={11} className="text-accent" /> Wir freuen uns auf dich, {firstName}.
        </div>
      </div>
    </div>
  );
}
