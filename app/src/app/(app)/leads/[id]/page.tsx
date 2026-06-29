import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { ChevronLeft, Mail, Phone, Calendar, Sparkles } from "lucide-react";
import {
  setLeadStatus,
  updateLeadConsultation,
  updateLeadNotes,
  convertLeadToCustomer,
  deleteLead,
  findCustomerByEmail,
} from "../actions";
import { LeadActions } from "./LeadActions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NEW: { label: "Neu", color: "#C8102E" },
  CONTACTED: { label: "Kontaktiert", color: "#7A746B" },
  CONSULTATION_BOOKED: { label: "Erstgespräch geplant", color: "#2F6B3B" },
  CONSULTATION_DONE: { label: "Erstgespräch geführt", color: "#2F6B3B" },
  CONVERTED: { label: "Zu Kundin konvertiert", color: "#19191A" },
  LOST: { label: "Kein Fit", color: "#9F877F" },
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const lead = await prisma.lead.findFirst({
    where: { id, ownerId: userId },
    include: {
      convertedCustomer: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!lead) return notFound();

  const status = STATUS_LABEL[lead.status] ?? STATUS_LABEL.NEW;
  // Möglicher Duplikat-Customer (gleiche Email)
  const duplicate = !lead.convertedCustomerId
    ? await findCustomerByEmail(lead.email)
    : null;

  return (
    <>
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-smoke hover:text-ink transition mb-4"
      >
        <ChevronLeft size={14} /> Alle Leads
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="eyebrow eyebrow-muted">Lead</div>
          <h1 className="font-serif text-4xl mt-2">{lead.firstName} {lead.lastName ?? ""}</h1>
          <div className="flex items-center gap-2 mt-2 text-sm flex-wrap">
            <span
              className="badge"
              style={{ background: `${status.color}15`, color: status.color, border: "none" }}
            >
              {status.label}
            </span>
            {lead.convertedCustomer && (
              <Link href={`/kunden/${lead.convertedCustomer.id}`} className="text-xs underline hover:text-ink text-smoke">
                → Kundenprofil öffnen
              </Link>
            )}
          </div>
        </div>
        <LeadActions
          leadId={lead.id}
          currentStatus={lead.status}
          duplicateCustomerId={duplicate?.id ?? null}
          duplicateCustomerName={duplicate?.name ?? null}
          isConverted={!!lead.convertedCustomerId}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Anfrage */}
          <section className="card p-6">
            <div className="eyebrow eyebrow-muted mb-3">Anfrage vom {lead.createdAt.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-smoke">E-Mail</div>
                <a href={`mailto:${lead.email}`} className="font-medium hover:underline flex items-center gap-1.5">
                  <Mail size={12} /> {lead.email}
                </a>
              </div>
              {lead.phone && (
                <div>
                  <div className="text-xs text-smoke">Telefon</div>
                  <a href={`tel:${lead.phone}`} className="font-medium hover:underline flex items-center gap-1.5">
                    <Phone size={12} /> {lead.phone}
                  </a>
                </div>
              )}
              {lead.packageInterest && (
                <div>
                  <div className="text-xs text-smoke">Interesse an</div>
                  <div className="font-medium">{lead.packageInterest}</div>
                </div>
              )}
              {lead.preferredDate && (
                <div>
                  <div className="text-xs text-smoke">Wunsch-Zeitraum</div>
                  <div className="font-medium">{lead.preferredDate}</div>
                </div>
              )}
              {lead.source && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-smoke">Wie hat sie mich gefunden?</div>
                  <div className="font-medium flex items-center gap-1.5"><Sparkles size={12} /> {lead.source}</div>
                </div>
              )}
            </div>
            {lead.message && (
              <div className="mt-5 pt-4 border-t border-stone/60">
                <div className="text-xs text-smoke mb-2">Nachricht</div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{lead.message}</div>
              </div>
            )}
          </section>

          {/* Erstgespräch */}
          <form
            action={async (fd: FormData) => {
              "use server";
              await updateLeadConsultation(lead.id, fd);
            }}
            className="card p-6 space-y-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-accent" />
              <div className="eyebrow eyebrow-muted">Erstgespräch</div>
            </div>
            <div>
              <label className="text-xs text-smoke">Termin</label>
              <input
                type="datetime-local"
                name="consultationAt"
                defaultValue={lead.consultationAt ? toLocalInput(lead.consultationAt) : ""}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-smoke">Notizen vom Gespräch</label>
              <textarea
                name="consultationNotes"
                defaultValue={lead.consultationNotes ?? ""}
                rows={4}
                placeholder="Was wurde besprochen? Wünsche, Budget, Termin, …"
                className="textarea mt-1"
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary text-sm">Speichern</button>
            </div>
          </form>

          {/* Interne Notizen */}
          <form
            action={async (fd: FormData) => {
              "use server";
              await updateLeadNotes(lead.id, fd);
            }}
            className="card p-6 space-y-3"
          >
            <div className="eyebrow eyebrow-muted">Interne Notizen</div>
            <textarea
              name="internalNotes"
              defaultValue={lead.internalNotes ?? ""}
              rows={4}
              placeholder="Erinnerungen, Eindrücke, To-Dos — nur für dich."
              className="textarea"
            />
            <div className="flex justify-end">
              <button type="submit" className="btn-secondary text-sm">Speichern</button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside>
          <div className="card p-5 sticky top-6">
            <div className="eyebrow eyebrow-muted mb-3">Status-Wechsel</div>
            <div className="space-y-1.5">
              {Object.entries(STATUS_LABEL).map(([key, meta]) => (
                <form
                  key={key}
                  action={async () => {
                    "use server";
                    await setLeadStatus(lead.id, key);
                  }}
                >
                  <button
                    type="submit"
                    disabled={lead.status === key}
                    className="w-full text-left text-sm px-3 py-2 rounded-md transition flex items-center gap-2 disabled:cursor-default"
                    style={{
                      background: lead.status === key ? `${meta.color}15` : "transparent",
                      color: lead.status === key ? meta.color : "rgb(var(--ink))",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: meta.color }}
                    />
                    <span className="flex-1">{meta.label}</span>
                    {lead.status === key && <span className="text-xs">✓</span>}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
