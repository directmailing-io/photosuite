import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { ShootingForm } from "../ShootingForm";
import { ChecklistManager } from "./ChecklistManager";
import { AttachmentManager } from "./AttachmentManager";
import { DatesManager } from "./DatesManager";
import { NotesManager } from "./NotesManager";
import { QuestionnaireSection } from "./QuestionnaireSection";
import { PaymentScheduleSection } from "./PaymentScheduleSection";
import { InvoiceQuickActions } from "./InvoiceQuickActions";
import { updateShooting, deleteShooting } from "../actions";
import { ExternalLink, Copy } from "lucide-react";
import { formatEUR } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerLinkButton } from "./CustomerLinkButton";

export const dynamic = "force-dynamic";

export default async function ShootingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const [shooting, customers, packages, statuses, team, qTemplates, allAddons] = await Promise.all([
    prisma.shooting.findFirst({
      where: { id, ownerId: userId },
      include: {
        customer: true,
        package: true,
        status: true,
        team: true,
        primaryContact: true,
        addons: { orderBy: { position: "asc" }, include: { addon: true } },
        dates: { orderBy: [{ startAt: "asc" }] },
        notes: { orderBy: { createdAt: "desc" } },
        checklists: {
          orderBy: [{ audience: "asc" }, { position: "asc" }],
          include: { items: { orderBy: { position: "asc" } } },
        },
        attachments: { orderBy: { createdAt: "desc" } },
        questionnaires: {
          orderBy: { position: "asc" },
          include: {
            _count: { select: { fields: true, answers: true } },
          },
        },
        paymentSchedule: {
          include: { installments: { orderBy: { position: "asc" } } },
        },
        invoices: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.customer.findMany({ where: { ownerId: userId }, orderBy: [{ firstName: "asc" }] }),
    prisma.package.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" }, include: { addons: true } }),
    prisma.shootingStatus.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
    prisma.teamMember.findMany({ where: { ownerId: userId }, orderBy: [{ isOwner: "desc" }, { position: "asc" }] }),
    prisma.questionnaireTemplate.findMany({
      where: { ownerId: userId },
      orderBy: [{ position: "asc" }],
      include: { _count: { select: { fields: true } } },
    }),
    prisma.addon.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
  ]);
  if (!shooting) return notFound();

  const publicUrl = shooting.publicSlug ? `/k/${shooting.publicSlug}` : null;
  // Gesamt-Preis = Paket + Add-Ons (Snapshot). Restbetrag basiert auf diesem Gesamt.
  const addonsTotal = shooting.addons.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0);
  const grandTotal = (shooting.price ?? 0) + addonsTotal;
  const remaining = grandTotal - (shooting.depositAmount ?? 0);

  return (
    <>
      <PageHeader
        eyebrow={shooting.package?.name ?? "Shooting"}
        title={shooting.title}
        subtitle={`${shooting.customer.firstName} ${shooting.customer.lastName}`}
      >
        {shooting.status && <StatusBadge label={shooting.status.label} color={shooting.status.color} />}
        {publicUrl && <CustomerLinkButton url={publicUrl} />}
      </PageHeader>

      <div className="card p-5 mb-6 flex flex-wrap items-center gap-5">
        <Link href={`/kunden/${shooting.customer.id}`} className="flex items-center gap-3 hover:underline">
          <Avatar url={shooting.customer.avatarUrl} firstName={shooting.customer.firstName} lastName={shooting.customer.lastName} size={42} />
          <div>
            <div className="text-xs text-smoke">Kundin</div>
            <div className="font-medium">{shooting.customer.firstName} {shooting.customer.lastName}</div>
          </div>
        </Link>
        <div className="hidden md:block w-px h-10 bg-stone" />
        <div>
          <div className="text-xs text-smoke">{addonsTotal > 0 ? "Paket" : "Preis"}</div>
          <div className="font-medium tabular-nums">{formatEUR(shooting.price)}</div>
        </div>
        {addonsTotal > 0 && (
          <>
            <div className="hidden md:block w-px h-10 bg-stone" />
            <div>
              <div className="text-xs text-smoke">+ Add-Ons ({shooting.addons.length})</div>
              <div className="font-medium tabular-nums">{formatEUR(addonsTotal)}</div>
            </div>
            <div className="hidden md:block w-px h-10 bg-stone" />
            <div>
              <div className="text-xs text-smoke">= Gesamt</div>
              <div className="font-medium tabular-nums">{formatEUR(grandTotal)}</div>
            </div>
          </>
        )}
        {shooting.depositAmount != null && (
          <>
            <div className="hidden md:block w-px h-10 bg-stone" />
            <div>
              <div className="text-xs text-smoke">Anzahlung</div>
              <div className="font-medium tabular-nums">
                {formatEUR(shooting.depositAmount)}
                <span className="ml-2 text-xs" style={{ color: shooting.depositPaid ? "var(--accent)" : "var(--smoke)" }}>
                  {shooting.depositPaid ? "✓ erhalten" : "ausstehend"}
                </span>
              </div>
            </div>
          </>
        )}
        <div className="hidden md:block w-px h-10 bg-stone" />
        <div>
          <div className="text-xs text-smoke">Restbetrag</div>
          <div className="font-medium tabular-nums">
            {formatEUR(remaining)}
            <span className="ml-2 text-xs" style={{ color: shooting.finalPaid ? "var(--accent)" : "var(--smoke)" }}>
              {shooting.finalPaid ? "✓ erhalten" : "ausstehend"}
            </span>
          </div>
        </div>
        <div className="ml-auto">
          <div className="text-xs text-smoke">Termine</div>
          <div className="font-medium tabular-nums">{shooting.dates.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <DatesManager
            shootingId={shooting.id}
            dates={shooting.dates.map((d) => ({
              id: d.id,
              label: d.label,
              startAt: d.startAt.toISOString(),
              endAt: d.endAt?.toISOString() ?? null,
              location: d.location,
              locationUrl: d.locationUrl,
              description: d.description,
            }))}
          />

          <NotesManager
            shootingId={shooting.id}
            notes={shooting.notes.map((n) => ({
              id: n.id,
              text: n.text,
              status: n.status,
              createdAt: n.createdAt.toISOString(),
            }))}
          />

          <div>
            <ShootingForm
              initial={{
                id: shooting.id,
                title: shooting.title,
                customerId: shooting.customerId,
                packageId: shooting.packageId,
                statusId: shooting.statusId,
                description: shooting.description,
                price: shooting.price,
                depositAmount: shooting.depositAmount,
                depositPaid: shooting.depositPaid,
                finalPaid: shooting.finalPaid,
                paymentTerms: shooting.paymentTerms,
                primaryContactId: shooting.primaryContactId,
                teamIds: shooting.team.map((m) => m.id),
                bookedAddons: shooting.addons.map((b) => ({ addonId: b.addonId, quantity: b.quantity, unitPrice: b.unitPrice })),
              }}
              customers={customers}
              packages={packages.map((p) => ({
                id: p.id, name: p.name, price: p.price, description: p.description,
                depositAmount: p.depositAmount, paymentTerms: p.paymentTerms, durationMin: p.durationMin,
                isActive: p.isActive, primaryContactId: p.primaryContactId,
                availableAddonIds: p.addons.map((a) => a.id),
              }))}
              statuses={statuses}
              team={team.map((m) => ({
                id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, avatarUrl: m.avatarUrl, isOwner: m.isOwner,
              }))}
              addons={allAddons.map((a) => ({ id: a.id, name: a.name, price: a.price, imageUrl: a.imageUrl, description: a.description, isActive: a.isActive }))}
              action={updateShooting.bind(null, id)}
              deleteAction={deleteShooting.bind(null, id)}
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <ChecklistManager
            shootingId={shooting.id}
            checklists={shooting.checklists.map((c) => ({
              id: c.id,
              title: c.title,
              audience: c.audience,
              items: c.items.map((i) => ({
                id: i.id,
                label: i.label,
                done: i.done,
                dueAt: i.dueAt?.toISOString() ?? null,
              })),
            }))}
          />
          <PaymentScheduleSection
            shootingId={shooting.id}
            shootingPriceCents={Math.round((shooting.price ?? 0) * 100)}
            installments={(shooting.paymentSchedule?.installments ?? []).map((i) => ({
              id: i.id,
              label: i.label,
              kind: i.kind,
              amountCents: i.amountCents,
              dueDate: i.dueDate?.toISOString() ?? null,
              invoiceId: i.invoiceId,
              paidAt: i.paidAt?.toISOString() ?? null,
            }))}
            invoices={Object.fromEntries(
              shooting.invoices.map((inv) => [inv.id, {
                id: inv.id, number: inv.number, status: inv.status, totalCents: inv.totalCents,
              }])
            )}
          />
          <InvoiceQuickActions
            customerId={shooting.customerId}
            shootingId={shooting.id}
            hasDeposit={(shooting.depositAmount ?? 0) > 0}
            hasSchedule={!!shooting.paymentSchedule}
            invoices={shooting.invoices.map((inv) => ({
              id: inv.id,
              number: inv.number,
              kind: inv.kind,
              status: inv.status,
              totalCents: inv.totalCents,
              issueDate: inv.issueDate.toISOString(),
            }))}
          />
          <QuestionnaireSection
            shootingId={shooting.id}
            publicSlug={shooting.publicSlug}
            templates={qTemplates.map((t) => ({ id: t.id, title: t.title, fieldCount: t._count.fields }))}
            questionnaires={shooting.questionnaires.map((q) => ({
              id: q.id,
              title: q.title,
              status: q.status,
              fieldCount: q._count.fields,
              answeredCount: q._count.answers,
              sentAt: q.sentAt?.toISOString() ?? null,
              openedAt: q.openedAt?.toISOString() ?? null,
              lastSavedAt: q.lastSavedAt?.toISOString() ?? null,
              submittedAt: q.submittedAt?.toISOString() ?? null,
            }))}
          />
          <AttachmentManager
            shootingId={shooting.id}
            attachments={shooting.attachments.map((a) => ({
              id: a.id,
              filename: a.filename,
              url: a.url,
              sizeBytes: a.sizeBytes,
            }))}
          />
        </div>
      </div>
    </>
  );
}
