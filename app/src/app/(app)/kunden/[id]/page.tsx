import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { Pencil, Camera, Cake, Phone, Mail, MapPin, Plus, MessageSquare, Sparkles, Receipt, Users } from "lucide-react";
import { formatDate, formatDateTime, formatEUR } from "@/lib/utils";
import { eurFromCents } from "@/lib/money";
import { CustomerNoteForm } from "./CustomerNoteForm";
import { PaymentHistory } from "@/components/PaymentHistory";
import { CompanionsSection } from "./CompanionsSection";
import { CustomerTabs, type CustomerTab } from "./CustomerTabs";
import { createDraftInvoice } from "../../buchhaltung/actions";

export const dynamic = "force-dynamic";

const VALID_TABS: CustomerTab[] = ["shootings", "rechnungen", "personen", "verlauf"];

function calcAge(d: Date | null): number | null {
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: CustomerTab = (VALID_TABS.includes(sp.tab as CustomerTab) ? sp.tab : "shootings") as CustomerTab;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      status: true,
      tags: true,
      shootings: {
        include: { status: true, package: true },
        orderBy: { scheduledAt: "desc" },
      },
      invoices: {
        include: { shooting: true },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      companions: { orderBy: { position: "asc" } },
    },
  });
  if (!customer) return notFound();

  const age = calcAge(customer.birthday);

  // Inline-Server-Action für "Rechnung erstellen": Blank-Draft für diese Kundin anlegen,
  // dann redirect zum Editor (das macht createDraftInvoice).
  async function createBlankInvoice() {
    "use server";
    await createDraftInvoice({ customerId: id, preset: "blank" });
  }

  // Umsatz/Bezahlt aus echten Rechnungen (Stornos abziehen, Anzahlungen mitzählen)
  const billableInvoices = customer.invoices.filter(
    (i) => i.status !== "CANCELLED" && i.kind !== "CANCEL",
  );
  const totalRevenue = billableInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const totalPaid = billableInvoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.totalCents, 0);
  const openAmount = totalRevenue - totalPaid;
  const openInvoiceCount = billableInvoices.filter((i) => i.status === "ISSUED").length;

  return (
    <>
      <PageHeader
        eyebrow="Kundin"
        title={`${customer.firstName} ${customer.lastName}`}
        subtitle={[customer.billingCity, customer.email].filter(Boolean).join(" · ") || undefined}
      >
        <Link href={`/kunden/${customer.id}/bearbeiten`} className="btn-secondary">
          <Pencil size={15} /> Bearbeiten
        </Link>
        <form action={createBlankInvoice}>
          <button type="submit" className="btn-secondary">
            <Receipt size={15} /> Rechnung erstellen
          </button>
        </form>
        <Link href={`/shootings/neu?customerId=${customer.id}`} className="btn-accent">
          <Camera size={15} /> Shooting anlegen
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke Spalte: Profil — eine ruhige Karte mit klarem Block-Aufbau */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="card p-6">
            {/* Identität: Avatar + Status + Tags */}
            <div className="text-center pb-5">
              <Avatar
                url={customer.avatarUrl}
                firstName={customer.firstName}
                lastName={customer.lastName}
                size={88}
              />
              {customer.status && (
                <div className="mt-3 flex justify-center">
                  <StatusBadge label={customer.status.label} color={customer.status.color} />
                </div>
              )}
              {customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                  {customer.tags.map((t) => (
                    <span key={t.id} className="badge" style={{ background: `${t.color}12`, color: t.color }}>
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Kontakt */}
            {(customer.email || customer.phone || customer.birthday || customer.billingStreet || customer.billingCity) && (
              <div className="border-t border-stone/60 pt-4 space-y-2.5 text-sm">
                {customer.email && (
                  <div className="flex items-center gap-3">
                    <Mail size={14} className="text-smoke shrink-0" />
                    <a href={`mailto:${customer.email}`} className="hover:underline truncate">{customer.email}</a>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-3">
                    <Phone size={14} className="text-smoke shrink-0" />
                    <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
                  </div>
                )}
                {customer.birthday && (
                  <div className="flex items-center gap-3">
                    <Cake size={14} className="text-smoke shrink-0" />
                    <span>
                      {formatDate(customer.birthday)}
                      {age !== null && <span className="text-smoke"> · {age} Jahre</span>}
                    </span>
                  </div>
                )}
                {(customer.billingStreet || customer.billingCity) && (
                  <div className="flex items-start gap-3">
                    <MapPin size={14} className="text-smoke shrink-0 mt-0.5" />
                    <div>
                      {customer.billingStreet && <div>{customer.billingStreet}</div>}
                      {(customer.billingZip || customer.billingCity) && (
                        <div>{customer.billingZip} {customer.billingCity}</div>
                      )}
                      {customer.billingCountry && <div className="text-smoke text-xs">{customer.billingCountry}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Social */}
            {(customer.instagram || customer.facebook || customer.tiktok || customer.website) && (
              <div className="border-t border-stone/60 pt-4 mt-4 space-y-2 text-sm">
                <div className="text-[10px] uppercase tracking-wider text-smoke mb-1">Social</div>
                {customer.instagram && (
                  <a target="_blank" className="block hover:underline" href={`https://instagram.com/${customer.instagram.replace(/^@/, "")}`}>Instagram: {customer.instagram}</a>
                )}
                {customer.facebook && <a target="_blank" className="block hover:underline" href={customer.facebook}>Facebook</a>}
                {customer.tiktok && <a target="_blank" className="block hover:underline" href={`https://tiktok.com/@${customer.tiktok.replace(/^@/, "")}`}>TikTok: {customer.tiktok}</a>}
                {customer.website && <a target="_blank" className="block hover:underline truncate">{customer.website}</a>}
              </div>
            )}

            {/* Aufmerksam geworden — kompakter Footer */}
            {customer.source && (
              <div className="border-t border-stone/60 pt-3 mt-4 flex items-center gap-2 text-xs text-smoke">
                <Sparkles size={11} className="text-taupe shrink-0" />
                <span>Aufmerksam geworden über</span>
                <span className="text-ink font-medium">{customer.source}</span>
              </div>
            )}
          </div>

          {/* KPI — 3-Spalten-Grid in einer kompakten Karte unter dem Profil */}
          <div className="card p-5 grid grid-cols-3 gap-3">
            <KpiCell label="Shootings" value={String(customer.shootings.length)} />
            <KpiCell label="Umsatz" value={eurFromCents(totalRevenue)} />
            <KpiCell label="Offen" value={eurFromCents(openAmount)} accent={openAmount > 0} />
          </div>

          {customer.internalNotes && (
            <div className="card p-6">
              <div className="eyebrow mb-3 eyebrow-muted">Interne Notiz</div>
              <div className="text-sm whitespace-pre-wrap text-ink">{customer.internalNotes}</div>
            </div>
          )}
        </div>

        {/* Rechts: Tab-Navigation + inhaltlich nur der aktive Tab */}
        <div className="lg:col-span-2 space-y-6">
          <CustomerTabs
            customerId={customer.id}
            active={tab}
            counts={{
              shootings: customer.shootings.length,
              rechnungen: customer.invoices.length,
              personen: customer.companions.length,
              openInvoices: openInvoiceCount,
            }}
          />

          {tab === "shootings" && (
            <div className="card">
              <div className="px-6 py-4 flex items-center justify-between border-b border-stone/60">
                <div className="eyebrow eyebrow-muted">Shootings</div>
                <Link href={`/shootings/neu?customerId=${customer.id}`} className="text-xs text-ink hover:underline flex items-center gap-1">
                  <Plus size={13} /> Neu
                </Link>
              </div>
              {customer.shootings.length === 0 ? (
                <div className="px-6 py-12 text-sm text-smoke text-center">
                  <Camera size={28} strokeWidth={1.25} className="mx-auto text-stone mb-3" />
                  <div>Noch keine Shootings.</div>
                  <Link href={`/shootings/neu?customerId=${customer.id}`} className="btn-primary mt-4 inline-flex text-xs">
                    <Plus size={13} /> Erstes Shooting anlegen
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <tbody>
                    {customer.shootings.map((s) => (
                      <tr key={s.id} className="table-row">
                        <td className="table-td">
                          <Link href={`/shootings/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                          {s.package && <div className="text-xs text-smoke mt-0.5">{s.package.name}</div>}
                        </td>
                        <td className="table-td text-smoke text-xs">{formatDateTime(s.scheduledAt)}</td>
                        <td className="table-td text-right tabular-nums font-medium">{formatEUR(s.price)}</td>
                        <td className="table-td">
                          {s.status && <StatusBadge label={s.status.label} color={s.status.color} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "rechnungen" && (
            <>
              <div className="flex justify-end">
                <form action={createBlankInvoice}>
                  <button type="submit" className="btn-primary text-xs h-9">
                    <Plus size={13} /> Rechnung erstellen
                  </button>
                </form>
              </div>
              {customer.invoices.length === 0 ? (
                <div className="card px-6 py-12 text-sm text-smoke text-center">
                  <Receipt size={28} strokeWidth={1.25} className="mx-auto text-stone mb-3" />
                  <div>Noch keine Rechnungen.</div>
                </div>
              ) : (
                <PaymentHistory
                  invoices={customer.invoices.map((inv) => ({
                    id: inv.id,
                    number: inv.number,
                    kind: inv.kind,
                    status: inv.status,
                    totalCents: inv.totalCents,
                    amountDueCents: inv.amountDueCents,
                    prepaidCents: inv.prepaidCents,
                    issueDate: inv.issueDate.toISOString(),
                    dueDate: inv.dueDate.toISOString(),
                    paidAt: inv.paidAt?.toISOString() ?? null,
                    sentAt: inv.sentAt?.toISOString() ?? null,
                    reminderLevel: inv.reminderLevel,
                    shootingTitle: inv.shooting?.title ?? null,
                  }))}
                />
              )}
            </>
          )}

          {tab === "personen" && (
            <CompanionsSection
              customerId={customer.id}
              companions={customer.companions.map((c) => ({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                relationship: c.relationship,
                birthday: c.birthday?.toISOString() ?? null,
                email: c.email,
                phone: c.phone,
                notes: c.notes,
              }))}
            />
          )}

          {tab === "verlauf" && (
            <>
              <div className="card p-6">
                <div className="eyebrow mb-4 eyebrow-muted flex items-center gap-2"><MessageSquare size={13} /> Notiz hinzufügen</div>
                <CustomerNoteForm customerId={customer.id} />
              </div>

              <div className="card">
                <div className="px-6 py-4 border-b border-stone/60">
                  <div className="eyebrow eyebrow-muted">Verlauf</div>
                </div>
                {customer.activities.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-smoke text-center">Noch keine Aktivität.</div>
                ) : (
                  <ol className="divide-y divide-stone/60">
                    {customer.activities.map((a) => (
                      <li key={a.id} className="px-6 py-3 flex items-start gap-3">
                        <div className="mt-1.5 w-2 h-2 rounded-full" style={{ background: a.kind === "note_added" ? "var(--accent)" : "var(--taupe)" }} />
                        <div className="flex-1">
                          <div className="text-sm text-ink whitespace-pre-wrap">{a.message}</div>
                          <div className="text-[11px] text-smoke mt-1">{formatDateTime(a.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-smoke">{label}</div>
      <div
        className="font-serif text-xl tabular-nums mt-1 truncate"
        style={{ color: accent ? "var(--accent)" : undefined }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
