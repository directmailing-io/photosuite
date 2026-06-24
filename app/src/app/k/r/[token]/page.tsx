import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { eurFromCents } from "@/lib/money";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import {
  CheckCircle2, Clock, AlertTriangle, Download, CreditCard, Heart,
  Mail, Phone, Globe, MapPin, Hourglass, ShieldCheck, ChevronLeft,
} from "lucide-react";
import { PayButton } from "./PayButton";
import { stripeForUser } from "@/lib/stripe";
import { markInvoicePaidFromSession, reflectSessionStatus } from "@/lib/invoice/markPaid";

export const dynamic = "force-dynamic";

// Synchroner Stripe-Verify als Fallback ohne Webhook: bei Rückkehr von Stripe
// (`?paid=1`) wird die Session direkt von Stripe nachgeholt und der Status reflektiert.
// Sicher, weil wir die Session-ID aus der DB ziehen (nicht aus der URL) und mit unserem
// Secret Key gegen Stripe abfragen — die ?paid-Query wird also nicht vertraut.
async function verifySessionFromStripe(invoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, stripeSessionId: true, ownerId: true },
  });
  if (!inv?.stripeSessionId || inv.status === "PAID") return;

  // Multi-Tenant: Stripe-Client aus dem Owner DIESER Invoice — niemals findFirst.
  const studio = await prisma.user.findUnique({ where: { id: inv.ownerId } });
  if (!studio?.stripeSecretKeyEnc) return;

  try {
    const stripe = stripeForUser({
      id: studio.id,
      stripeSecretKeyEnc: studio.stripeSecretKeyEnc,
      stripeWebhookSecretEnc: studio.stripeWebhookSecretEnc,
    });
    const session = await stripe.checkout.sessions.retrieve(inv.stripeSessionId);
    if (session.payment_status === "paid") {
      await markInvoicePaidFromSession(invoiceId, session, "return");
    } else if (session.payment_status === "unpaid" && session.status === "complete") {
      // Asynchron (SEPA) — pending; Status reflektieren
      await reflectSessionStatus(invoiceId, session);
    }
  } catch {
    // Stripe nicht erreichbar / Session weg — Seite einfach mit aktuellem DB-Stand rendern.
  }
}

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Anzahlung",
  INTERIM: "Teilrechnung",
  FINAL: "Rechnung",
  CANCEL: "Stornorechnung",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

export default async function PublicInvoicePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  // Erst die Invoice-ID laden, dann (wenn ?paid=1) live bei Stripe verifizieren,
  // ANSCHLIESSEND die vollständige Invoice laden — so sieht die Seite den aktuellen Stand.
  const stub = await prisma.invoice.findUnique({
    where: { paymentToken: token },
    select: { id: true },
  });
  if (!stub) return notFound();

  if (sp.paid === "1") {
    await verifySessionFromStripe(stub.id);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: stub.id },
    include: {
      customer: true,
      items: { orderBy: { position: "asc" } },
      shooting: { include: { package: true } },
    },
  });
  if (!invoice) return notFound();

  const portalSlug = invoice.shooting?.publicSlug ?? null;

  // Studio aus invoice.ownerId (Multi-Tenant) — NICHT findFirst.
  const studio = await prisma.user.findUnique({ where: { id: invoice.ownerId } });
  const issuer = parseIssuer(invoice.issuerSnapshot);

  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  const isProcessing = invoice.stripePaymentStatus === "processing";
  // Für „Online bezahlen anzeigen" reicht: Stripe-Account verbunden + Charges aktiv.
  // Webhook ist nur für SEPA-Bestätigungen / Browser-Close-Fallback nötig.
  const isStripeReady = !!studio?.stripeSecretKeyEnc && studio.stripeChargesEnabled;
  const canPay = !isPaid && !isCancelled && invoice.amountDueCents > 0 && invoice.status === "ISSUED";

  const now = new Date();
  const overdue = !isPaid && invoice.dueDate < now;
  const justPaid = sp.paid === "1";

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top-Bar (klein, neutral) */}
      <header className="border-b border-stone/60 bg-paper">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-3">
          {portalSlug ? (
            <Link
              href={`/k/${portalSlug}#rechnungen`}
              className="text-xs text-smoke hover:text-ink flex items-center gap-1.5"
            >
              <ChevronLeft size={12} /> Zurück zu deinem Shooting
            </Link>
          ) : studio?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={studio.studioName ?? "Studio"} className="h-12 w-auto object-contain" />
          ) : (
            <div className="font-serif text-base truncate">{issuer.companyName ?? studio?.studioName ?? "Studio"}</div>
          )}
          <a
            href={`/api/k/invoice/${token}/pdf`}
            target="_blank"
            rel="noopener"
            className="text-xs text-smoke hover:text-ink flex items-center gap-1.5"
          >
            <Download size={12} /> PDF
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10 space-y-6">
        {/* Begrüßung */}
        <div>
          <div className="eyebrow">
            <span style={{ display: "inline-block", width: 28, height: 1, background: "var(--accent)", marginRight: 10, verticalAlign: "middle" }} />
            {KIND_LABEL[invoice.kind] ?? "Rechnung"}
          </div>
          <h1 className="font-serif text-4xl mt-3 leading-tight">
            Hallo <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{invoice.customer.firstName}</em>,
          </h1>
          <p className="text-smoke mt-2 max-w-xl">
            {isPaid
              ? "deine Rechnung ist beglichen — vielen Dank!"
              : isCancelled
              ? "diese Rechnung wurde storniert."
              : "hier ist deine Rechnung. Du kannst sie als PDF herunterladen und direkt online bezahlen."}
          </p>
        </div>

        {/* Status-Banner */}
        {justPaid && !isPaid && (
          <div className="card p-4 flex items-start gap-3" style={{ background: "var(--accent-soft)", borderLeftWidth: 3, borderLeftColor: "var(--accent)" }}>
            <Hourglass size={18} className="text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Danke! Wir warten auf die Bestätigung deiner Zahlung.</div>
              <div className="text-smoke text-xs mt-0.5">
                Bei SEPA-Lastschrift kann das einige Werktage dauern. Sobald die Zahlung bei uns angekommen ist, aktualisiert sich der Status hier automatisch.
              </div>
            </div>
          </div>
        )}
        {isPaid && (
          <div className="card p-4 flex items-start gap-3" style={{ background: "var(--success-soft)", borderLeftWidth: 3, borderLeftColor: "var(--success)" }}>
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
            <div className="text-sm">
              <div className="font-medium" style={{ color: "var(--success-deep)" }}>Bezahlt</div>
              {invoice.paidAt && (
                <div className="text-smoke text-xs mt-0.5">
                  Eingegangen am {fmtDate(invoice.paidAt)}
                  {invoice.stripePaymentMethod ? ` · via ${methodLabel(invoice.stripePaymentMethod)}` : ""}
                </div>
              )}
            </div>
          </div>
        )}
        {!isPaid && !isCancelled && overdue && (
          <div className="card p-4 flex items-start gap-3" style={{ background: "var(--accent-soft)", borderLeftWidth: 3, borderLeftColor: "var(--accent)" }}>
            <AlertTriangle size={18} className="text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Diese Rechnung ist überfällig</div>
              <div className="text-smoke text-xs mt-0.5">
                Fällig war {fmtDate(invoice.dueDate)}. Bei Fragen melde dich bitte direkt bei uns.
              </div>
            </div>
          </div>
        )}

        {/* Rechnungs-Karte */}
        <section className="card p-6">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-smoke">Rechnungsnummer</div>
              <div className="font-mono text-lg mt-0.5">{invoice.number ?? "(Entwurf)"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-smoke">Betrag</div>
              <div className="font-serif text-3xl tabular-nums mt-0.5">{eurFromCents(invoice.amountDueCents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Rechnungsdatum" value={fmtDate(invoice.issueDate)} />
            <Info label="Fällig am" value={fmtDate(invoice.dueDate)} accent={overdue && !isPaid} />
            {invoice.shooting?.title && <Info label="Shooting" value={invoice.shooting.title} fullWidth />}
          </div>

          <div className="hairline my-5" />

          <ul className="space-y-2 text-sm">
            {invoice.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-4">
                <div>
                  <div>{it.title}</div>
                  {it.description && <div className="text-xs text-smoke mt-0.5">{it.description}</div>}
                </div>
                <div className="tabular-nums whitespace-nowrap">{eurFromCents(it.totalCents)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Bezahlung */}
        {canPay && (
          <section className="card p-6">
            <div className="eyebrow eyebrow-muted mb-3 flex items-center gap-2">
              <CreditCard size={13} /> Jetzt bezahlen
            </div>
            {isStripeReady ? (
              <>
                <p className="text-sm text-smoke mb-4">
                  Kreditkarte, SEPA-Lastschrift, PayPal — was du bevorzugst. Du wirst zu Stripe geleitet,
                  schließt dort die Zahlung ab und kommst zurück.
                </p>
                <PayButton token={token} amountLabel={eurFromCents(invoice.amountDueCents)} />
                <div className="text-xs text-smoke mt-3 flex items-center gap-1.5">
                  <ShieldCheck size={11} /> Sichere Zahlungsabwicklung über Stripe Payments Europe, Dublin.
                </div>
              </>
            ) : (
              <div className="text-sm text-smoke">
                Online-Zahlung ist gerade nicht verfügbar. Bitte überweise auf das im PDF angegebene Konto
                oder melde dich bei uns.
              </div>
            )}
          </section>
        )}

        {/* Kontakt */}
        {studio && (
          <section className="card p-6 bg-ink text-bg overflow-hidden relative">
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-10" style={{ background: "var(--accent)" }} />
            <div className="relative">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>Bei Fragen</div>
              <h2 className="font-serif text-2xl mt-1 mb-3">{studio.studioName ?? studio.name}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {studio.studioPhone && (
                  <a href={`tel:${studio.studioPhone}`} className="flex items-center gap-2 opacity-90 hover:opacity-100">
                    <Phone size={13} style={{ color: "var(--accent)" }} /> {studio.studioPhone}
                  </a>
                )}
                {(studio.invoiceEmail ?? studio.studioEmail) && (
                  <a href={`mailto:${studio.invoiceEmail ?? studio.studioEmail}`} className="flex items-center gap-2 opacity-90 hover:opacity-100">
                    <Mail size={13} style={{ color: "var(--accent)" }} /> {studio.invoiceEmail ?? studio.studioEmail}
                  </a>
                )}
                {studio.studioWebsite && (
                  <a href={studio.studioWebsite} target="_blank" rel="noopener" className="flex items-center gap-2 opacity-90 hover:opacity-100">
                    <Globe size={13} style={{ color: "var(--accent)" }} /> {studio.studioWebsite.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {studio.studioAddress && (
                  <div className="flex items-start gap-2 col-span-full opacity-90">
                    <MapPin size={13} style={{ color: "var(--accent)" }} className="mt-0.5" />
                    <span className="whitespace-pre-line">{studio.studioAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="text-center text-xs text-smoke flex items-center justify-center gap-1.5 pt-2 pb-8">
          <Heart size={11} className="text-accent" /> Danke, {invoice.customer.firstName}.
        </div>
      </main>
    </div>
  );
}

function Info({ label, value, accent, fullWidth }: { label: string; value: string; accent?: boolean; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-smoke">{label}</div>
      <div className="mt-0.5" style={{ color: accent ? "var(--accent)" : undefined }}>{value}</div>
    </div>
  );
}

function methodLabel(m: string): string {
  const map: Record<string, string> = {
    card: "Kreditkarte",
    sepa_debit: "SEPA-Lastschrift",
    paypal: "PayPal",
    klarna: "Klarna",
    link: "Stripe Link",
    bancontact: "Bancontact",
    customer_balance: "Banküberweisung",
  };
  return map[m] ?? m;
}
