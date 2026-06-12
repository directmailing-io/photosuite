import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { StatusManager, TagManager } from "./Editors";
import { StudioProfile } from "./StudioProfile";
import { LogoUploader } from "./LogoUploader";
import { InvoiceProfile } from "./InvoiceProfile";
import { StripeProfile } from "./StripeProfile";
import { CalendarSettings } from "./CalendarSettings";
import { AvailabilityManager } from "./AvailabilityManager";
import { ensureWeeklyDefaults } from "./availabilityActions";
import { AddonManager } from "./AddonManager";
import { BookingTypeManager } from "./BookingTypeManager";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { EmptyState } from "@/components/EmptyState";
import { auth } from "@/lib/auth";
import { loadCurrentUser } from "@/lib/loadUser";
import {
  createCustomerStatus,
  updateCustomerStatus,
  deleteCustomerStatus,
  createShootingStatus,
  updateShootingStatus,
  deleteShootingStatus,
  createTag,
  deleteTag,
} from "./actions";

export const dynamic = "force-dynamic";

const VALID: SettingsTab[] = ["studio", "rechnung", "zahlungen", "kalender", "buchung", "addons", "status", "tags"];

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: SettingsTab = (VALID.includes(sp.tab as SettingsTab) ? sp.tab : "studio") as SettingsTab;

  const session = await auth();
  const user = await loadCurrentUser(session);

  const invoiceIncomplete = !user ||
    !user.invoiceCompanyName ||
    !user.invoiceStreet ||
    !user.invoiceZip ||
    !user.invoiceCity ||
    (!user.invoiceTaxId && !user.invoiceVatId);

  return (
    <>
      <PageHeader
        eyebrow="Konfiguration"
        title="Einstellungen"
        subtitle="Profil, Rechnungsdaten, Status und Tags an deinen Workflow anpassen."
      />

      <SettingsTabs active={tab} invoiceIncomplete={invoiceIncomplete} />

      {tab === "studio" && (
        user ? (
          <div className="space-y-6">
            <LogoUploader initial={{
              logoUrl: user.logoUrl,
              logoOriginalUrl: user.logoOriginalUrl,
              logoMimeType: user.logoMimeType,
              studioName: user.studioName,
            }} />
            <StudioProfile initial={{
              studioName: user.studioName,
              studioTagline: user.studioTagline,
              studioPhone: user.studioPhone,
              studioEmail: user.studioEmail,
              studioWebsite: user.studioWebsite,
              studioAddress: user.studioAddress,
              studioInstagram: user.studioInstagram,
            }} />
          </div>
        ) : (
          <EmptyState title="Profil nicht ladbar" description="Bitte melde dich neu an." />
        )
      )}

      {tab === "rechnung" && (
        user ? (
          <InvoiceProfile initial={{
            invoiceCompanyName: user.invoiceCompanyName,
            invoiceCompanyOwner: user.invoiceCompanyOwner,
            invoiceStreet: user.invoiceStreet,
            invoiceZip: user.invoiceZip,
            invoiceCity: user.invoiceCity,
            invoiceCountry: user.invoiceCountry,
            invoiceEmail: user.invoiceEmail,
            invoiceTaxId: user.invoiceTaxId,
            invoiceVatId: user.invoiceVatId,
            isSmallBusiness: user.isSmallBusiness,
            defaultVatRate: user.defaultVatRate,
            invoiceBankName: user.invoiceBankName,
            invoiceIban: user.invoiceIban,
            invoiceBic: user.invoiceBic,
            invoiceFooterNote: user.invoiceFooterNote,
            invoiceNumberFormat: user.invoiceNumberFormat,
            invoicePaymentDueDays: user.invoicePaymentDueDays,
            invoiceCounter: user.invoiceCounter,
            invoiceCounterYear: user.invoiceCounterYear,
            reminderDays1: user.reminderDays1,
            reminderDays2: user.reminderDays2,
            reminderDays3: user.reminderDays3,
            reminderFee1Cents: user.reminderFee1Cents,
            reminderFee2Cents: user.reminderFee2Cents,
            reminderFee3Cents: user.reminderFee3Cents,
          }} />
        ) : (
          <EmptyState title="Profil nicht ladbar" description="Bitte melde dich neu an." />
        )
      )}

      {tab === "zahlungen" && (
        user ? (
          <StripeProfile initial={{
            userId: user.id,
            webhookUrl: `${process.env.APP_BASE_URL ?? ""}/api/webhooks/stripe/${user.id}`,
            stripePublishableKey: user.stripePublishableKey,
            hasSecretKey: !!user.stripeSecretKeyEnc,
            hasWebhookSecret: !!user.stripeWebhookSecretEnc,
            stripeAccountId: user.stripeAccountId,
            stripeAccountName: user.stripeAccountName,
            stripeAccountCountry: user.stripeAccountCountry,
            stripeChargesEnabled: user.stripeChargesEnabled,
            stripeLivemode: user.stripeLivemode,
            stripeKeysUpdatedAt: user.stripeKeysUpdatedAt?.toISOString() ?? null,
          }} />
        ) : (
          <EmptyState title="Profil nicht ladbar" description="Bitte melde dich neu an." />
        )
      )}

      {tab === "kalender" && (
        user ? <CalendarSection userId={user.id} /> : (
          <EmptyState title="Profil nicht ladbar" description="Bitte melde dich neu an." />
        )
      )}

      {tab === "buchung" && <BuchungSection />}

      {tab === "addons" && <AddonSection />}

      {tab === "status" && <StatusSection />}
      {tab === "tags" && <TagsSection />}
    </>
  );
}

async function BuchungSection() {
  const types = await prisma.bookingType.findMany({ orderBy: { position: "asc" } });
  return (
    <BookingTypeManager
      appBaseUrl={process.env.APP_BASE_URL ?? ""}
      types={types.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        durationMin: t.durationMin,
        priceCents: t.priceCents,
        bufferBeforeMin: t.bufferBeforeMin,
        bufferAfterMin: t.bufferAfterMin,
        minLeadHours: t.minLeadHours,
        maxAheadDays: t.maxAheadDays,
        slotIntervalMin: t.slotIntervalMin,
        location: t.location,
        autoConfirm: t.autoConfirm,
        requirePhone: t.requirePhone,
        requireMessage: t.requireMessage,
        color: t.color,
        isActive: t.isActive,
        position: t.position,
      }))}
    />
  );
}

async function AddonSection() {
  const addons = await prisma.addon.findMany({ orderBy: { position: "asc" } });
  return (
    <AddonManager
      addons={addons.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        price: a.price,
        isActive: a.isActive,
        position: a.position,
        imageUrl: a.imageUrl,
      }))}
    />
  );
}

async function CalendarSection({ userId }: { userId: string }) {
  await ensureWeeklyDefaults();
  const [conns, weekly, overrides, user] = await Promise.all([
    prisma.calendarConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.availabilityWeekly.findMany({ orderBy: { weekday: "asc" } }),
    prisma.availabilityOverride.findMany({ orderBy: { date: "asc" } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultDayStartMinutes: true, defaultDayEndMinutes: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <AvailabilityManager
        defaultDayStartMinutes={user?.defaultDayStartMinutes ?? 540}
        defaultDayEndMinutes={user?.defaultDayEndMinutes ?? 1080}
        weekly={weekly.map((w) => ({
          weekday: w.weekday,
          isAvailable: w.isAvailable,
          slotsJson: w.slotsJson,
        }))}
        overrides={overrides.map((o) => ({
          id: o.id,
          date: o.date,
          isAvailable: o.isAvailable,
          slotsJson: o.slotsJson,
          note: o.note,
        }))}
      />
      <CalendarSettings
        connections={conns.map((c) => ({
          id: c.id,
          provider: c.provider,
          status: c.status,
          accountEmail: c.accountEmail,
          externalCalendarName: c.externalCalendarName,
          lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
          lastSyncError: c.lastSyncError,
          pseudonymize: c.pseudonymize,
        }))}
      />
    </div>
  );
}

async function StatusSection() {
  const [cs, ss] = await Promise.all([
    prisma.customerStatus.findMany({ orderBy: { position: "asc" } }),
    prisma.shootingStatus.findMany({ orderBy: { position: "asc" } }),
  ]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <StatusManager
        title="Kundenstatus"
        subtitle="z.B. Interessent · Gebucht · Bestandskunde · Archiv"
        items={cs.map((x) => ({ id: x.id, label: x.label, color: x.color }))}
        createAction={createCustomerStatus}
        updateAction={updateCustomerStatus}
        deleteAction={deleteCustomerStatus}
      />
      <StatusManager
        title="Shootingstatus"
        subtitle="Diese Status erscheinen auch in der Kanban-Ansicht."
        items={ss.map((x) => ({ id: x.id, label: x.label, color: x.color, isDone: x.isDone }))}
        createAction={createShootingStatus}
        updateAction={updateShootingStatus}
        deleteAction={deleteShootingStatus}
        withDoneFlag
      />
    </div>
  );
}

async function TagsSection() {
  const tags = await prisma.tag.findMany({ orderBy: { label: "asc" } });
  return (
    <TagManager
      tags={tags.map((t) => ({ id: t.id, label: t.label, color: t.color }))}
      createAction={createTag}
      deleteAction={deleteTag}
    />
  );
}
