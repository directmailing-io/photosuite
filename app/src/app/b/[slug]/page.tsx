import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDaysWithSlots } from "@/lib/bookingSlots";
import { BookingFlow } from "./BookingFlow";

export const dynamic = "force-dynamic";

// Erlaubte ?month=YYYY-MM. Liefert ersten Tag dieses Monats lokal.
// Bei ungültig/leer → aktueller Monat (heute, lokaler 1.).
function parseMonth(raw: string | undefined): { year: number; month: number; first: Date } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-basiert
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [yStr, mStr] = raw.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    if (y >= 2000 && y <= 2100 && m >= 0 && m <= 11) {
      year = y;
      month = m;
    }
  }
  return { year, month, first: new Date(year, month, 1) };
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string; embed?: string }>;
}) {
  const { slug } = await params;
  const { month: monthParam, embed: embedParam } = await searchParams;
  const embed = embedParam === "1" || embedParam === "true";

  const type = await prisma.bookingType.findUnique({ where: { slug } });
  if (!type || !type.isActive) return notFound();

  // Studio = einziger User-Account (single-tenant Lisa-Setup).
  const studio = await prisma.user.findFirst({
    select: {
      studioName: true,
      studioTagline: true,
      studioEmail: true,
      studioPhone: true,
      logoUrl: true,
    },
  });

  const { year, month, first: firstOfMonth } = parseMonth(monthParam);

  // Slots-Lookup ab dem 1. des Monats — aber niemals vor heute.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fromDate = firstOfMonth.getTime() < today.getTime() ? today : firstOfMonth;

  const cfg = {
    durationMin: type.durationMin,
    bufferBeforeMin: type.bufferBeforeMin,
    bufferAfterMin: type.bufferAfterMin,
    minLeadHours: type.minLeadHours,
    maxAheadDays: type.maxAheadDays,
    slotIntervalMin: type.slotIntervalMin,
  };

  const days = await getDaysWithSlots(cfg, fromDate);

  // Plain-Object Type für Client-Component (nur Felder, die im UI gebraucht werden).
  const typeForClient = {
    slug: type.slug,
    name: type.name,
    description: type.description,
    durationMin: type.durationMin,
    priceCents: type.priceCents,
    location: type.location,
    locationsJson: type.locationsJson,
    requiredFieldsJson: type.requiredFieldsJson,
    autoConfirm: type.autoConfirm,
    requirePhone: type.requirePhone,
    requireMessage: type.requireMessage,
    color: type.color,
  };

  return (
    <BookingFlow
      type={typeForClient}
      studio={studio}
      days={days}
      year={year}
      month={month}
      embed={embed}
    />
  );
}
