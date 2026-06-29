import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { StatusManager, TagManager } from "./Editors";
import { StudioProfile } from "./StudioProfile";
import { LogoUploader } from "./LogoUploader";
import { InvoiceProfile } from "./InvoiceProfile";
import { StripeProfile } from "./StripeProfile";
import { CalendarSettings } from "./CalendarSettings";
import { AvailabilityManager } from "./AvailabilityManager";
import { VideoMeetingSettings } from "./VideoMeetingSettings";
import { ensureWeeklyDefaults } from "./availabilityActions";
import { AddonManager } from "./AddonManager";
import { BookingTypeManager } from "./BookingTypeManager";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { ThemePicker } from "./ThemePicker";
import { PackageModePicker } from "./PackageModePicker";
import { NoteTemplatesManager } from "./NoteTemplatesManager";
import { EmptyState } from "@/components/EmptyState";
import { requireUserId } from "@/lib/auth";
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

const VALID: SettingsTab[] = ["studio", "rechnung", "zahlungen", "kalender", "buchung", "addons", "status", "tags", "vorlagen", "design"];

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: SettingsTab = (VALID.includes(sp.tab as SettingsTab) ? sp.tab : "studio") as SettingsTab;

  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId } });

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
              studioWhatsapp: user.studioWhatsapp,
              studioTelegram: user.studioTelegram,
              showStudioPhone: user.showStudioPhone,
              showStudioEmail: user.showStudioEmail,
              showStudioWebsite: user.showStudioWebsite,
              showStudioAddress: user.showStudioAddress,
              showStudioInstagram: user.showStudioInstagram,
              showStudioWhatsapp: user.showStudioWhatsapp,
              showStudioTelegram: user.showStudioTelegram,
            }} />
            <PackageModePicker initial={(user.packageMode as "all_in_one" | "modular") ?? "all_in_one"} />
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
            invoiceBankAccountName: user.invoiceBankAccountName,
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

      {tab === "buchung" && <BuchungSection userId={userId} />}

      {tab === "addons" && <AddonSection userId={userId} />}

      {tab === "status" && <StatusSection userId={userId} />}
      {tab === "tags" && <TagsSection userId={userId} />}
      {tab === "vorlagen" && <VorlagenSection userId={userId} />}

      {tab === "design" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl mb-2">Anpassungen</h2>
            <p className="text-sm text-taupe max-w-2xl">
              Wähle den Look, in dem deine gesamte App erscheint — Farben, Schriften, Formen.
              Jeder User hat sein eigenes Theme; Buchungs- und Kunden-Daten bleiben unverändert.
            </p>
          </div>
          <ThemePicker initial={(user?.theme as "lisa" | "studio" | "midnight") ?? "lisa"} />
        </div>
      )}
    </>
  );
}

async function BuchungSection({ userId }: { userId: string }) {
  const [types, user] = await Promise.all([
    prisma.bookingType.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        zoomPersonalLink: true,
        googleMeetPersonalLink: true,
        teamsPersonalLink: true,
        wherebyPersonalLink: true,
      },
    }),
  ]);
  return (
    <BookingTypeManager
      appBaseUrl={process.env.APP_BASE_URL ?? ""}
      videoLinks={{
        zoom: !!user?.zoomPersonalLink,
        google_meet: !!user?.googleMeetPersonalLink,
        teams: !!user?.teamsPersonalLink,
        whereby: !!user?.wherebyPersonalLink,
      }}
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
        locationsJson: t.locationsJson,
        videoProvider: t.videoProvider,
        requiredFieldsJson: t.requiredFieldsJson,
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

async function AddonSection({ userId }: { userId: string }) {
  const addons = await prisma.addon.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } });
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
  await ensureWeeklyDefaults(userId);
  const [conns, weekly, overrides, user] = await Promise.all([
    prisma.calendarConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.availabilityWeekly.findMany({ where: { ownerId: userId }, orderBy: { weekday: "asc" } }),
    prisma.availabilityOverride.findMany({ where: { ownerId: userId }, orderBy: { date: "asc" } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultDayStartMinutes: true,
        defaultDayEndMinutes: true,
        defaultMorningStart: true,
        defaultMorningEnd: true,
        defaultAfternoonStart: true,
        defaultAfternoonEnd: true,
        defaultEveningStart: true,
        defaultEveningEnd: true,
        zoomPersonalLink: true,
        googleMeetPersonalLink: true,
        teamsPersonalLink: true,
        wherebyPersonalLink: true,
        zoomAccessTokenEnc: true,
        zoomAccountEmail: true,
        googleAccessTokenEnc: true,
        googleAccountEmail: true,
      },
    }),
  ]);
  return (
    <div className="space-y-6">
      <AvailabilityManager
        defaultDayStartMinutes={user?.defaultDayStartMinutes ?? 540}
        defaultDayEndMinutes={user?.defaultDayEndMinutes ?? 1080}
        presetTimes={{
          morningStart: user?.defaultMorningStart ?? 540,
          morningEnd: user?.defaultMorningEnd ?? 780,
          afternoonStart: user?.defaultAfternoonStart ?? 840,
          afternoonEnd: user?.defaultAfternoonEnd ?? 1080,
          eveningStart: user?.defaultEveningStart ?? 1080,
          eveningEnd: user?.defaultEveningEnd ?? 1320,
        }}
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
      <VideoMeetingSettings
        initial={{
          zoomPersonalLink: user?.zoomPersonalLink ?? null,
          googleMeetPersonalLink: user?.googleMeetPersonalLink ?? null,
          teamsPersonalLink: user?.teamsPersonalLink ?? null,
          wherebyPersonalLink: user?.wherebyPersonalLink ?? null,
          zoomConnected: !!user?.zoomAccessTokenEnc,
          zoomAccountEmail: user?.zoomAccountEmail ?? null,
          googleConnected: !!user?.googleAccessTokenEnc,
          googleAccountEmail: user?.googleAccountEmail ?? null,
        }}
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

async function StatusSection({ userId }: { userId: string }) {
  const [cs, ss] = await Promise.all([
    prisma.customerStatus.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
    prisma.shootingStatus.findMany({ where: { ownerId: userId }, orderBy: { position: "asc" } }),
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

async function TagsSection({ userId }: { userId: string }) {
  const tags = await prisma.tag.findMany({ where: { ownerId: userId }, orderBy: { label: "asc" } });
  return (
    <TagManager
      tags={tags.map((t) => ({ id: t.id, label: t.label, color: t.color }))}
      createAction={createTag}
      deleteAction={deleteTag}
    />
  );
}

async function VorlagenSection({ userId }: { userId: string }) {
  const templates = await prisma.noteTemplate.findMany({
    where: { ownerId: userId },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });
  return (
    <NoteTemplatesManager
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        body: t.body,
      }))}
    />
  );
}
