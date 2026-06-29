"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { generateSlug } from "@/lib/slug";
import { isOAuthProvider, isValidProviderKey } from "@/lib/videoProviders";
import { createMeetingForBooking } from "@/lib/videoMeetingServer";

function revalidateAll() {
  revalidatePath("/buchungen");
  revalidatePath("/shootings");
  revalidatePath("/kalender");
}

// Buchung annehmen: legt Customer + Shooting an und verknüpft.
// Wenn die E-Mail bereits einer Kundin gehört, wird sie wiederverwendet.
export async function acceptBooking(id: string): Promise<{ shootingId: string }> {
  const userId = await requireUserId();
  const booking = await prisma.booking.findFirst({
    where: { id, ownerId: userId },
    include: { bookingType: true },
  });
  if (!booking) throw new Error("Buchung nicht gefunden");
  if (booking.status === "CANCELLED") throw new Error("Buchung wurde bereits abgesagt");

  // Wenn beim Submit kein OAuth-Meeting erstellt wurde (z.B. weil Lisa damals
  // nicht verbunden war): jetzt nachholen.
  let resolvedMeetingUrl = booking.meetingUrl;
  if (!resolvedMeetingUrl && isValidProviderKey(booking.bookingType.videoProvider) && isOAuthProvider(booking.bookingType.videoProvider as any)) {
    const url = await createMeetingForBooking(booking.bookingType.videoProvider as any, userId, {
      topic: `${booking.bookingType.name} — ${booking.customerName}`,
      startAt: booking.startAt,
      durationMin: booking.bookingType.durationMin,
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
    });
    if (url) {
      resolvedMeetingUrl = url;
      await prisma.booking.update({
        where: { id },
        data: { meetingUrl: url, meetingProvider: booking.bookingType.videoProvider },
      });
    }
  }

  // Customer-Match per Email — Email darf zwischen Tenants kollidieren,
  // daher MUSS ownerId Teil des Matches sein.
  const emailLower = booking.customerEmail.trim().toLowerCase();
  let customer = await prisma.customer.findFirst({
    where: { email: { equals: emailLower }, ownerId: userId },
  });

  if (!customer) {
    // Name in Vor-/Nachname splitten — best effort
    const parts = booking.customerName.trim().split(/\s+/);
    const firstName = parts[0] ?? booking.customerName;
    const lastName = parts.slice(1).join(" ") || "—";

    // Default-Status für neue Kundinnen (kann fehlen, wenn User keine Defaults hat)
    const defaultStatus = await prisma.customerStatus.findFirst({
      where: { isDefault: true, ownerId: userId },
      orderBy: { position: "asc" },
    });

    customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        email: emailLower,
        phone: booking.customerPhone ?? null,
        statusId: defaultStatus?.id ?? null,
        ownerId: userId,
      },
    });
  }

  // Shooting erstellen
  const shootingStatus = await prisma.shootingStatus.findFirst({
    where: { isDefault: true, ownerId: userId },
    orderBy: { position: "asc" },
  });

  const slug = generateSlug(customer.firstName);
  const shooting = await prisma.shooting.create({
    data: {
      title: `${booking.bookingType.name} — ${customer.firstName}`,
      publicSlug: slug,
      customerId: customer.id,
      statusId: shootingStatus?.id ?? null,
      scheduledAt: booking.startAt,
      durationMin: booking.bookingType.durationMin,
      location: booking.bookingType.location ?? null,
      price: booking.bookingType.priceCents / 100,
      description: [
        booking.message ?? booking.bookingType.description ?? null,
        resolvedMeetingUrl ? `Meeting-Link: ${resolvedMeetingUrl}` : null,
      ].filter(Boolean).join("\n\n") || null,
      ownerId: userId,
      // Auto-Termin für die Detail-Ansicht
      dates: {
        create: [{
          label: booking.bookingType.name,
          startAt: booking.startAt,
          endAt: booking.endAt,
          location: booking.bookingType.location ?? null,
          position: 0,
        }],
      },
    },
  });

  // Booking aktualisieren + Activity-Log
  await prisma.booking.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      customerId: customer.id,
      shootingId: shooting.id,
    },
  });

  await prisma.activity.create({
    data: {
      kind: "booking_accepted",
      message: `Online-Buchung angenommen: ${booking.bookingType.name}`,
      shootingId: shooting.id,
      customerId: customer.id,
      ownerId: userId,
    },
  });

  // Workflow-Trigger: booking_accepted (event-basiert) + zeitbasierte Workflows
  // für das neue Shooting planen
  const { triggerWorkflow, scheduleShootingWorkflows } = await import("@/lib/workflow/engine");
  triggerWorkflow("booking_accepted", {
    ownerId: userId,
    customerId: customer.id,
    shootingId: shooting.id,
  }).catch((err) => console.error(`[acceptBooking] triggerWorkflow: ${err?.message ?? err}`));
  scheduleShootingWorkflows(shooting.id).catch((err) =>
    console.error(`[acceptBooking] scheduleShootingWorkflows: ${err?.message ?? err}`),
  );

  revalidateAll();
  return { shootingId: shooting.id };
}

export async function cancelBooking(id: string, reason?: string): Promise<void> {
  const userId = await requireUserId();
  const booking = await prisma.booking.findFirst({ where: { id, ownerId: userId } });
  if (!booking) throw new Error("Buchung nicht gefunden");
  await prisma.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason?.trim() || null,
    },
  });
  revalidateAll();
}

export async function deleteBooking(id: string): Promise<void> {
  const userId = await requireUserId();
  const booking = await prisma.booking.findFirst({ where: { id, ownerId: userId } });
  if (!booking) throw new Error("Buchung nicht gefunden");
  await prisma.booking.delete({ where: { id } });
  revalidateAll();
}
