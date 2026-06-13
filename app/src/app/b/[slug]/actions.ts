"use server";

import { prisma } from "@/lib/prisma";
import { isSlotStillAvailable } from "@/lib/bookingSlots";
import { revalidatePath } from "next/cache";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

// Erzeugt eine Booking aus dem Public-Form. Race-Safe: prüft Verfügbarkeit nochmals
// in einer Transaction, sonst könnten zwei Kundinnen denselben Slot bekommen.
export async function submitBooking(slug: string, formData: FormData): Promise<{ id: string }> {
  const type = await prisma.bookingType.findUnique({ where: { slug } });
  if (!type || !type.isActive) throw new Error("Buchungstyp nicht verfügbar.");

  const customerName = s(formData.get("customerName"));
  const customerEmail = s(formData.get("customerEmail"));
  if (!customerName) throw new Error("Bitte deinen Namen angeben.");
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
  }
  const customerPhone = s(formData.get("customerPhone"));
  // Wenn neue dynamicFieldsJson-Validierung aktiv ist, übernimmt diese die Pflicht-Logik
  // — alte Toggles werden dann ignoriert (Client validiert vor dem Submit).
  const usingDynamic = !!type.requiredFieldsJson;
  if (!usingDynamic && type.requirePhone && !customerPhone) throw new Error("Bitte deine Telefonnummer angeben.");
  const message = s(formData.get("message"));
  if (!usingDynamic && type.requireMessage && !message) throw new Error("Bitte eine kurze Nachricht hinzufügen.");

  const startISO = s(formData.get("startAt"));
  if (!startISO) throw new Error("Kein Termin ausgewählt.");
  const startAt = new Date(startISO);
  if (isNaN(startAt.getTime())) throw new Error("Ungültiger Termin.");

  // Race-Safe: Verfügbarkeit jetzt nochmals prüfen.
  const check = await isSlotStillAvailable({
    durationMin: type.durationMin,
    bufferBeforeMin: type.bufferBeforeMin,
    bufferAfterMin: type.bufferAfterMin,
    minLeadHours: type.minLeadHours,
    maxAheadDays: type.maxAheadDays,
    slotIntervalMin: type.slotIntervalMin,
  }, startAt);
  if (!check.ok) throw new Error(check.reason);

  const endAt = new Date(startAt.getTime() + type.durationMin * 60_000);

  const status = type.autoConfirm ? "CONFIRMED" : "PENDING";
  const booking = await prisma.booking.create({
    data: {
      bookingTypeId: type.id,
      customerName,
      customerEmail,
      customerPhone: customerPhone ?? null,
      message: message ?? null,
      startAt,
      endAt,
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    },
  });

  revalidatePath("/buchungen");
  revalidatePath(`/b/${slug}`);
  return { id: booking.id };
}
