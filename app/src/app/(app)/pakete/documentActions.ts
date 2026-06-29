"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { saveUpload } from "@/lib/upload";
import { revalidatePath } from "next/cache";

// Whitelist für Dokumenten-Uploads. Kein Office-Format mit Makro-Risiko (xlsm, docm),
// und keine ausführbaren Formate. Bilder + PDFs sind die wahrscheinlichsten Cases
// für Prep Guides / Outfit-Inspirationen.
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc (alt, aber harmlos ohne Makros)
  "text/plain",
]);

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/**
 * Lädt ein Dokument zu einem Paket hoch. Tenant-Check via Package.ownerId.
 *
 * Sicherheit:
 *  - IDOR-Check (findFirst { id, ownerId })
 *  - MIME-Whitelist (s. ALLOWED_MIMES)
 *  - Größen-Limit 20 MB
 *  - Titel-Länge auf 200, Beschreibung 1000 begrenzt
 */
export async function createPackageDocument(packageId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const pkg = await prisma.package.findFirst({
    where: { id: packageId, ownerId: userId },
    select: { id: true },
  });
  if (!pkg) throw new Error("Paket nicht gefunden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Bitte eine Datei auswählen.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`Datei zu groß (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    throw new Error(`Dateityp nicht erlaubt (${file.type || "unbekannt"}). Erlaubt: PDF, Bilder, Word, Text.`);
  }

  const title = s(formData.get("title")) ?? file.name.replace(/\.[^.]+$/, "");
  if (title.length > 200) throw new Error("Titel zu lang.");
  const description = s(formData.get("description"));
  if (description && description.length > 1000) throw new Error("Beschreibung zu lang.");
  const isVisible = formData.get("isVisible") !== "off"; // Default true

  const uploaded = await saveUpload(file, `package-docs/${packageId}`);

  // Position ans Ende
  const last = await prisma.packageDocument.findFirst({
    where: { packageId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? -1) + 1;

  await prisma.packageDocument.create({
    data: {
      packageId,
      title,
      description,
      fileUrl: uploaded.url,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      isVisible,
      position: nextPosition,
    },
  });

  revalidatePath(`/pakete/${packageId}`);
}

export async function updatePackageDocument(documentId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const doc = await prisma.packageDocument.findFirst({
    where: { id: documentId, package: { ownerId: userId } },
    select: { id: true, packageId: true },
  });
  if (!doc) throw new Error("Dokument nicht gefunden");

  const title = s(formData.get("title"));
  if (!title) throw new Error("Titel darf nicht leer sein.");
  if (title.length > 200) throw new Error("Titel zu lang.");
  const description = s(formData.get("description"));
  if (description && description.length > 1000) throw new Error("Beschreibung zu lang.");
  const isVisible = formData.get("isVisible") !== "off";

  await prisma.packageDocument.update({
    where: { id: documentId },
    data: { title, description, isVisible },
  });

  revalidatePath(`/pakete/${doc.packageId}`);
}

export async function deletePackageDocument(documentId: string): Promise<void> {
  const userId = await requireUserId();
  const doc = await prisma.packageDocument.findFirst({
    where: { id: documentId, package: { ownerId: userId } },
    select: { id: true, packageId: true },
  });
  if (!doc) throw new Error("Dokument nicht gefunden");

  await prisma.packageDocument.delete({ where: { id: documentId } });
  revalidatePath(`/pakete/${doc.packageId}`);
}
