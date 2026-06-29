import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import { eurFromCents } from "@/lib/money";
import { OfferActions } from "./OfferActions";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : null;

export default async function PublicOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const offer = await prisma.offer.findFirst({
    where: { publicToken: token },
    include: {
      items: { orderBy: { position: "asc" } },
      customer: true,
    },
  });
  if (!offer) return notFound();

  const issuer = parseIssuer(offer.issuerSnapshot);
  const isExpired = offer.validUntil && offer.validUntil < new Date();
  const canAct = offer.status === "SENT" && !isExpired;

  let statusBanner: { label: string; body: string; tone: "neutral" | "good" | "bad" } | null = null;
  if (offer.status === "ACCEPTED") {
    statusBanner = {
      label: "Du hast dieses Angebot angenommen.",
      body: `Wir melden uns mit den nächsten Schritten — am ${fmtDate(offer.acceptedAt)} gespeichert.`,
      tone: "good",
    };
  } else if (offer.status === "DECLINED") {
    statusBanner = {
      label: "Du hast dieses Angebot abgelehnt.",
      body: offer.declineReason ? `Notiert: „${offer.declineReason}"` : "Schade — vielleicht beim nächsten Mal.",
      tone: "bad",
    };
  } else if (offer.status === "WITHDRAWN") {
    statusBanner = {
      label: "Dieses Angebot wurde zurückgezogen.",
      body: "Bitte melde dich beim Studio für ein neues Angebot.",
      tone: "neutral",
    };
  } else if (offer.status === "EXPIRED" || isExpired) {
    statusBanner = {
      label: "Dieses Angebot ist abgelaufen.",
      body: offer.validUntil
        ? `Gültigkeit war bis ${fmtDate(offer.validUntil)}. Melde dich gern für ein neues Angebot.`
        : "Bitte melde dich beim Studio für ein neues Angebot.",
      tone: "neutral",
    };
  }

  const studioName = issuer.companyName || "Studio";

  return (
    <div className="min-h-screen" style={{ background: "rgb(var(--linen))" }}>
      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="eyebrow text-smoke">{studioName}</div>
          <h1 className="font-serif text-3xl mt-2">{offer.title}</h1>
          {offer.number && <div className="text-sm text-smoke mt-1">Nr. {offer.number}</div>}
        </div>

        {statusBanner && (
          <div
            className="rounded-lg p-4 mb-6 text-sm"
            style={{
              background:
                statusBanner.tone === "good" ? "#E6F3EC" :
                statusBanner.tone === "bad" ? "#FBE9EC" :
                "#F2F1EE",
              color:
                statusBanner.tone === "good" ? "#2F6B4A" :
                statusBanner.tone === "bad" ? "#C8102E" :
                "#19191A",
            }}
          >
            <div className="font-medium">{statusBanner.label}</div>
            <div className="mt-1 opacity-80">{statusBanner.body}</div>
          </div>
        )}

        <section className="bg-paper rounded-xl border border-stone p-6 mb-6">
          <div className="text-sm space-y-1 mb-4">
            <div><span className="text-smoke">Für:</span> {offer.recipientName}</div>
            <div><span className="text-smoke">Angebotsdatum:</span> {fmtDate(offer.issueDate)}</div>
            {offer.validUntil && (
              <div><span className="text-smoke">Gültig bis:</span> {fmtDate(offer.validUntil)}</div>
            )}
          </div>

          {offer.intro && (
            <p className="text-sm leading-relaxed mb-5 text-smoke italic">{offer.intro}</p>
          )}

          <table className="w-full text-sm">
            <thead className="text-xs text-smoke uppercase tracking-wider">
              <tr className="border-b border-stone">
                <th className="text-left py-2 font-medium">Position</th>
                <th className="text-right py-2 font-medium">Anzahl</th>
                <th className="text-right py-2 font-medium">Einzelpreis</th>
                <th className="text-right py-2 font-medium">Summe</th>
              </tr>
            </thead>
            <tbody>
              {offer.items.map((it) => (
                <tr key={it.id} className="border-b border-stone/40 last:border-0">
                  <td className="py-3">
                    <div className="font-medium">{it.title}</div>
                    {it.description && <div className="text-xs text-smoke mt-0.5">{it.description}</div>}
                  </td>
                  <td className="py-3 text-right text-smoke tabular-nums">
                    {it.quantity} {it.unit ?? ""}
                  </td>
                  <td className="py-3 text-right text-smoke tabular-nums">
                    {eurFromCents(it.unitPriceCents)}
                  </td>
                  <td className="py-3 text-right tabular-nums">{eurFromCents(it.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 pt-3 border-t border-stone space-y-1 text-sm tabular-nums">
            {!offer.isSmallBusiness && (
              <>
                <div className="flex justify-between text-smoke">
                  <span>Netto</span><span>{eurFromCents(offer.subtotalCents)}</span>
                </div>
                <div className="flex justify-between text-smoke">
                  <span>+ {offer.vatRate} % USt.</span><span>{eurFromCents(offer.vatAmountCents)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-serif text-xl pt-2">
              <span>Gesamt</span><span>{eurFromCents(offer.totalCents)}</span>
            </div>
            {offer.isSmallBusiness && (
              <div className="text-xs text-smoke italic">Gemäß § 19 UStG ohne Umsatzsteuer.</div>
            )}
          </div>

          {offer.notes && (
            <div className="mt-5 pt-4 border-t border-stone text-xs text-smoke whitespace-pre-line">
              {offer.notes}
            </div>
          )}
        </section>

        {canAct && (
          <OfferActions token={token} customerName={offer.customer.firstName} />
        )}

        <div className="text-center mb-6">
          <a
            href={`/api/k/offer/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-smoke hover:text-ink underline transition"
          >
            Als PDF herunterladen
          </a>
        </div>

        <footer className="text-center text-xs text-smoke mt-8 space-y-0.5">
          <div>{issuer.companyName}</div>
          {issuer.email && <div>{issuer.email}</div>}
          {issuer.phone && <div>Tel.: {issuer.phone}</div>}
        </footer>
      </main>
    </div>
  );
}
