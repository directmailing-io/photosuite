import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatEUR } from "@/lib/utils";
import Link from "next/link";
import {
  Calendar, MapPin, Clock, Phone, Mail, Globe, Instagram,
  ListChecks, CreditCard, Check, Heart, Star, UsersRound,
  FileQuestion, ChevronRight, CheckCircle2, Receipt, Download,
  AlertCircle, Hourglass, MessageCircle, Send as SendIcon,
} from "lucide-react";
import { CalendarDownloadButton } from "./CalendarDownloadButton";
import { PrintChecklistButton } from "./PrintChecklistButton";
import { LandingNav } from "./LandingNav";
import { whatsappUrl, telegramUrl, telUrl, mailtoUrl } from "@/lib/contactUrls";
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
  // Public-Route: kein Auth. Tenant kommt aus dem Shooting. publicSlug ist nun
  // composite-unique (@@unique([ownerId, publicSlug])), aber als 256-bit Random-Token
  // krypto-eindeutig — findFirst auf publicSlug ist Race-Safe genug.
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    include: {
      customer: true,
      package: {
        include: {
          documents: {
            where: { isVisible: true },
            orderBy: { position: "asc" },
          },
        },
      },
      addons: { orderBy: { position: "asc" }, include: { addon: true } },
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

  // Studio aus Tenant des Shootings (NICHT findFirst — sonst falscher User in Multi-Tenant).
  const studio = await prisma.user.findUnique({ where: { id: shooting.ownerId } });

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

        <div className="max-w-5xl mx-auto px-6 pt-12 pb-20 min-h-[70vh] flex flex-col justify-end" style={{ color: "rgb(var(--bg))" }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.85)" }}>
            <span style={{ display: "inline-block", width: 32, height: 1, background: "rgb(var(--accent))", marginRight: 12, verticalAlign: "middle" }}></span>
            Dein persönliches Kunden-Dashboard
          </div>
          <h1 className="font-serif font-medium mt-4 leading-[1.02]" style={{ fontSize: "clamp(40px, 7vw, 80px)" }}>
            Hi <em style={{ color: "rgb(var(--accent))", fontStyle: "italic" }}>{firstName}</em>,
            <br />schön, dass du da bist.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.92)" }}>
            Hier findest du alle wichtigen Infos rund um dein Shooting — unsere gemeinsamen Termine,
            Location, Rechnungen, Zahlungsmöglichkeiten und mehr. Diese Seite halten wir laufend aktuell,
            schau also gern immer mal wieder rein.
          </p>
          {description && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed italic" style={{ color: "rgba(255,255,255,0.85)" }}>
              {description}
            </p>
          )}
          <div className="flex flex-wrap gap-6 mt-8 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
            {shooting.package && (
              <div>
                <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>Paket</div>
                <div className="font-serif text-xl">{shooting.package.name}</div>
              </div>
            )}
            {shooting.scheduledAt && (
              <div>
                <div className="eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>Shootingtag</div>
                <div className="font-serif text-xl">{fmtDate(shooting.scheduledAt)}</div>
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

        {/* ZUSATZPRODUKTE — was zusätzlich zum Paket gebucht ist */}
        {shooting.addons.length > 0 && (() => {
          const addonsTotal = shooting.addons.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0);
          return (
            <section className="card p-8">
              <div className="eyebrow">Deine Zusatzprodukte</div>
              <h2 className="font-serif text-3xl mt-1 mb-6">Zusätzlich zu deinem Paket</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shooting.addons.map((b) => {
                  const a = b.addon;
                  const subtotal = b.unitPrice * b.quantity;
                  return (
                    <li key={b.id} className="flex items-center gap-4 p-4 rounded-lg border border-stone bg-paper">
                      {a.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.imageUrl} alt={a.name} className="w-16 h-16 rounded object-cover shrink-0 border border-stone" />
                      ) : (
                        <div className="w-16 h-16 rounded bg-linen shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-lg leading-tight">
                          {a.name}
                          {b.quantity > 1 && <span className="text-smoke text-base font-sans"> · {b.quantity} Stück</span>}
                        </div>
                        {a.description && <div className="text-xs text-smoke mt-1 line-clamp-2">{a.description}</div>}
                        <div className="text-sm tabular-nums mt-1 text-ink">
                          {b.quantity > 1
                            ? `${b.quantity} × ${b.unitPrice.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} = ${subtotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`
                            : subtotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 pt-4 border-t border-stone flex justify-between items-baseline">
                <span className="eyebrow eyebrow-muted">Zusatzprodukte gesamt</span>
                <span className="font-serif text-xl tabular-nums">
                  {addonsTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                </span>
              </div>
            </section>
          );
        })()}

        {/* PAKET-DOKUMENTE — Prep Guide, Outfit Guide etc. */}
        {shooting.package?.documents && shooting.package.documents.length > 0 && (
          <section className="card p-8">
            <div className="eyebrow">Material zur Vorbereitung</div>
            <h2 className="font-serif text-3xl mt-1 mb-6">Dokumente zu deinem Paket</h2>
            <ul className="space-y-3">
              {shooting.package.documents.map((d) => {
                const isImage = d.mimeType.startsWith("image/");
                const isPdf = d.mimeType === "application/pdf";
                const typeLabel = isImage ? "Bild" : isPdf ? "PDF" : "Dokument";
                return (
                  <li key={d.id}>
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 rounded-lg border border-stone bg-paper hover:bg-linen transition"
                    >
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 font-serif text-sm"
                        style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}
                      >
                        {typeLabel === "Bild" ? "IMG" : typeLabel === "PDF" ? "PDF" : "DOC"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-lg leading-tight">{d.title}</div>
                        {d.description && (
                          <div className="text-sm text-smoke mt-1 line-clamp-2">{d.description}</div>
                        )}
                        <div className="text-xs text-smoke mt-1">
                          {typeLabel} · {d.filename}
                        </div>
                      </div>
                      <div className="text-xs text-smoke shrink-0 font-medium">
                        Öffnen →
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
                    background: isDone ? "rgb(var(--paper))" : "linear-gradient(135deg, rgb(var(--accent-soft)) 0%, rgb(var(--paper)) 100%)",
                    borderColor: isDone ? "rgb(var(--stone))" : "rgb(var(--accent))",
                    borderWidth: 1,
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: isDone ? "rgb(var(--linen))" : "rgb(var(--accent))", color: isDone ? "rgb(var(--smoke))" : "rgb(var(--accent-on))" }}
                  >
                    {isDone ? <CheckCircle2 size={26} /> : <FileQuestion size={26} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="eyebrow" style={{ color: isDone ? "rgb(var(--smoke))" : "rgb(var(--accent))" }}>
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
        {(shooting.dates.length > 0 || shooting.scheduledAt) && (
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

            {/* Hauptshooting-Termin als hervorgehobene Card oben — separater Block,
                damit er sofort erkennbar ist (auch ohne ShootingDate-Einträge). */}
            {shooting.scheduledAt && (
              <div
                className="rounded-xl p-5 mb-6 border-l-4"
                style={{
                  background: "rgb(var(--accent-soft))",
                  borderColor: "rgb(var(--accent))",
                }}
              >
                <div className="eyebrow" style={{ color: "rgb(var(--accent))" }}>Der Shootingtag</div>
                <div className="flex flex-wrap items-baseline gap-3 mt-1">
                  <div className="font-serif text-2xl text-ink">
                    {shooting.title || "Shooting"}
                  </div>
                </div>
                <div className="text-sm text-ink/80 mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} style={{ color: "rgb(var(--accent))" }} />
                    {fmtDate(shooting.scheduledAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} style={{ color: "rgb(var(--accent))" }} />
                    {fmtTime(shooting.scheduledAt)}
                    {shooting.durationMin ? ` · ${Math.floor(shooting.durationMin / 60)}h ${shooting.durationMin % 60 ? `${shooting.durationMin % 60}min` : ""}`.trim() : ""}
                  </span>
                  {shooting.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} style={{ color: "rgb(var(--accent))" }} /> {shooting.location}
                    </span>
                  )}
                </div>
              </div>
            )}

            {shooting.dates.length > 0 && (
              <>
                {shooting.scheduledAt && (
                  <div className="eyebrow eyebrow-muted mb-4">Weitere Termine</div>
                )}
            <ol className="relative">
              {shooting.dates.map((d, idx) => (
                <li key={d.id} className="relative pl-10 pb-8 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-bg border-2 flex items-center justify-center"
                    style={{ borderColor: "rgb(var(--accent))" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--accent))" }} />
                  </span>
                  {idx < shooting.dates.length - 1 && (
                    <span className="absolute left-[9px] top-7 bottom-0 w-px" style={{ background: "rgb(var(--stone))" }} />
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
              </>
            )}
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
              background: "linear-gradient(135deg, rgb(var(--accent)) 0%, #A30D24 100%)",
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
                        ? "rgb(var(--success))"
                        : overdue
                        ? "rgb(var(--accent))"
                        : "rgb(var(--stone))",
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: isPaid ? "rgb(var(--success-soft))" : isProcessing ? "rgb(var(--linen))" : "rgb(var(--paper))",
                        color: isPaid ? "rgb(var(--success))" : "rgb(var(--smoke))",
                        border: "1px solid rgb(var(--stone))",
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
                          <span style={{ color: "rgb(var(--success-deep))" }}>
                            {" "}· bezahlt {inv.paidAt.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                          </span>
                        )}
                        {!isPaid && (
                          <span style={{ color: overdue ? "rgb(var(--accent))" : "rgb(var(--smoke))" }}>
                            {" "}· fällig {inv.dueDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                          </span>
                        )}
                        {isProcessing && (
                          <span style={{ color: "rgb(var(--accent-deep))" }}> · Zahlung in Bearbeitung</span>
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

        {/* TEAM — sichtbar nur, wenn pro-Shooting nicht abgeschaltet. */}
        {shooting.showTeamOnPublic && (shooting.primaryContact || shooting.team.length > 0) && (() => {
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
                    <div className="absolute top-4 right-4 badge" style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-on))", border: "none" }}>
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
                    {(primary.email || primary.phone || primary.website) && (
                      <div className="hairline mt-4 pt-3 text-xs text-smoke flex flex-wrap gap-x-4 gap-y-1">
                        {primary.email && <a href={`mailto:${primary.email}`} className="flex items-center gap-1 hover:text-ink"><Mail size={11} /> {primary.email}</a>}
                        {primary.phone && <a href={`tel:${primary.phone}`} className="flex items-center gap-1 hover:text-ink"><Phone size={11} /> {primary.phone}</a>}
                        {primary.website && (
                          <a href={primary.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-ink">
                            <Globe size={11} /> {primary.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        )}
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
                    {/* Optional: Kontaktwege für Team-Mitglieder, damit die Kundin
                        ggf. eigenständig durchstöbern kann (z.B. Make-up-Artist-Website). */}
                    {(m.email || m.phone || m.website || m.instagram) && (
                      <div className="hairline mt-4 pt-3 text-xs text-smoke flex flex-wrap gap-x-4 gap-y-1">
                        {m.website && (
                          <a href={m.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-ink">
                            <Globe size={11} /> {m.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        )}
                        {m.instagram && (
                          <a href={`https://instagram.com/${m.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-ink">
                            <Instagram size={11} /> {m.instagram}
                          </a>
                        )}
                        {m.email && (
                          <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-ink">
                            <Mail size={11} /> {m.email}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* CHECKLISTEN — markiert als print-only, damit beim Browser-Druck
            nur dieser Bereich erscheint (Layout/Nav/Hero werden weggeblendet). */}
        {shooting.checklists.length > 0 && (
          <section id="checkliste" className="scroll-mt-20 print-only">
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="eyebrow">Damit alles glatt läuft</div>
                <h2 className="font-serif text-3xl mt-1">Kleine Checkliste für dich</h2>
                <div className="text-xs text-smoke mt-1 print-hide">
                  Tipp: oben rechts kannst du die Checkliste als PDF speichern oder drucken.
                </div>
              </div>
              <PrintChecklistButton />
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
                            borderColor: it.done ? "rgb(var(--accent))" : "rgb(var(--stone))",
                            background: it.done ? "rgb(var(--accent))" : "transparent",
                          }}>
                          {it.done && <Check size={12} style={{ color: "rgb(var(--accent-on))" }} />}
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
        {studio && (() => {
          // URL-Sanitization: nur valide Buttons zeigen.
          const waHref = studio.showStudioWhatsapp ? whatsappUrl(studio.studioWhatsapp) : null;
          const tgHref = studio.showStudioTelegram ? telegramUrl(studio.studioTelegram) : null;
          const phoneHref = studio.showStudioPhone ? telUrl(studio.studioPhone) : null;
          const emailHref = studio.showStudioEmail ? mailtoUrl(studio.studioEmail) : null;
          const hasQuickContacts = waHref || tgHref || phoneHref || emailHref;

          return (
          <section id="kontakt" className="card p-8 bg-ink text-bg overflow-hidden relative scroll-mt-20">
            <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full opacity-10" style={{ background: "rgb(var(--accent))" }} />
            <div className="relative">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Bei Fragen</div>
              <h2 className="font-serif text-3xl mt-1 mb-1">{studio.studioName ?? studio.name}</h2>
              {studio.studioTagline && <p className="text-sm opacity-75 max-w-xl">{studio.studioTagline}</p>}

              {/* Schnellkontakt-Buttons: prominent, große Touch-Targets, ein Tap = direkter Channel */}
              {hasQuickContacts && (
                <div className="flex flex-wrap gap-2.5 mt-6">
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-2 px-4 h-11 rounded-full font-medium text-sm transition hover:scale-105"
                      style={{ background: "#25D366", color: "white" }}
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </a>
                  )}
                  {tgHref && (
                    <a
                      href={tgHref}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-2 px-4 h-11 rounded-full font-medium text-sm transition hover:scale-105"
                      style={{ background: "#229ED9", color: "white" }}
                    >
                      <SendIcon size={16} /> Telegram
                    </a>
                  )}
                  {phoneHref && (
                    <a
                      href={phoneHref}
                      className="flex items-center gap-2 px-4 h-11 rounded-full font-medium text-sm transition hover:scale-105"
                      style={{ background: "rgb(var(--accent))", color: "white" }}
                    >
                      <Phone size={16} /> Anrufen
                    </a>
                  )}
                  {emailHref && (
                    <a
                      href={emailHref}
                      className="flex items-center gap-2 px-4 h-11 rounded-full font-medium text-sm transition hover:scale-105"
                      style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)" }}
                    >
                      <Mail size={16} /> E-Mail
                    </a>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-6 text-sm">
                {studio.studioPhone && studio.showStudioPhone && (
                  <a href={`tel:${studio.studioPhone}`} className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Phone size={15} style={{ color: "rgb(var(--accent))" }} /> {studio.studioPhone}
                  </a>
                )}
                {studio.studioEmail && studio.showStudioEmail && (
                  <a href={`mailto:${studio.studioEmail}`} className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Mail size={15} style={{ color: "rgb(var(--accent))" }} /> {studio.studioEmail}
                  </a>
                )}
                {studio.studioWebsite && studio.showStudioWebsite && (
                  <a href={studio.studioWebsite} target="_blank" className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Globe size={15} style={{ color: "rgb(var(--accent))" }} /> {studio.studioWebsite.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {studio.studioInstagram && studio.showStudioInstagram && (
                  <a href={`https://instagram.com/${studio.studioInstagram.replace(/^@/, "")}`} target="_blank" className="flex items-center gap-3 hover:opacity-100 opacity-90">
                    <Instagram size={15} style={{ color: "rgb(var(--accent))" }} /> {studio.studioInstagram}
                  </a>
                )}
                {studio.studioAddress && studio.showStudioAddress && (
                  <div className="flex items-start gap-3 col-span-full">
                    <MapPin size={15} style={{ color: "rgb(var(--accent))" }} className="mt-0.5" />
                    <span className="whitespace-pre-line">{studio.studioAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
          );
        })()}

        <div className="text-center pt-4 space-y-3">
          <div>
            <Link
              href={`/k/${slug}/profil`}
              className="text-xs text-smoke hover:text-ink transition underline underline-offset-4 decoration-stone"
            >
              Mein Profil aktualisieren →
            </Link>
          </div>
          <div className="text-xs text-smoke flex items-center justify-center gap-1.5">
            <Heart size={11} className="text-accent" /> Wir freuen uns auf dich, {firstName}.
          </div>
        </div>
      </div>
    </div>
  );
}
