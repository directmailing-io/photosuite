"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Slug-basierte Self-Service-Action für Kundinnen.
 *
 * Sicherheitsmodell:
 * - Authentifizierung über `shooting.publicSlug` (64-bit Entropie). Wer den Slug
 *   kennt, darf das verknüpfte Customer-Profil ändern. Lisa teilt den Slug nur mit
 *   der jeweiligen Kundin.
 * - Server-side strikte Whitelist: nur die unten genannten Felder können geändert
 *   werden. Tags/Status/InternalNotes/OwnerId/Id sind tabu.
 * - String-Sanitization: trim + Length-Cap (1000), null bei leer.
 *
 * Multi-Shooting-Edge: wenn die Kundin mehrere Shootings hat, leitet jeder Slug
 * zum selben Customer. Das ist gewollt — alle Slugs gehören der Kundin.
 */

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim().slice(0, 1000);
  return t === "" ? null : t;
}

function dateOrNull(v: FormDataEntryValue | null): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export async function updateCustomerProfilePublic(
  slug: string,
  formData: FormData,
): Promise<void> {
  if (!slug || typeof slug !== "string") throw new Error("Ungültiger Link.");
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    select: { customerId: true, ownerId: true },
  });
  if (!shooting) throw new Error("Profil nicht gefunden — bitte den Link prüfen.");

  // Whitelist: nur diese Felder darf die Kundin ändern. Alles andere wird ignoriert.
  await prisma.customer.update({
    where: { id: shooting.customerId },
    data: {
      // Stammdaten
      firstName: s(formData.get("firstName")) ?? undefined,
      lastName: s(formData.get("lastName")) ?? undefined,
      email: s(formData.get("email")),
      phone: s(formData.get("phone")),
      birthday: dateOrNull(formData.get("birthday")),
      // Rechnungsadresse
      billingStreet: s(formData.get("billingStreet")),
      billingZip: s(formData.get("billingZip")),
      billingCity: s(formData.get("billingCity")),
      billingCountry: s(formData.get("billingCountry")),
      // Lieferadressen
      welcomeStreet: s(formData.get("welcomeStreet")),
      welcomeZip: s(formData.get("welcomeZip")),
      welcomeCity: s(formData.get("welcomeCity")),
      welcomeCountry: s(formData.get("welcomeCountry")),
      welcomeNote: s(formData.get("welcomeNote")),
      deliveryStreet: s(formData.get("deliveryStreet")),
      deliveryZip: s(formData.get("deliveryZip")),
      deliveryCity: s(formData.get("deliveryCity")),
      deliveryCountry: s(formData.get("deliveryCountry")),
      deliveryNote: s(formData.get("deliveryNote")),
    },
  });

  revalidatePath(`/k/${slug}`);
  revalidatePath(`/k/${slug}/profil`);
}
