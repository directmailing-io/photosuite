// Slug-authentifizierter Avatar-Upload für Kundinnen (Self-Service-Profil).
//
// Sicherheit:
// - Auth via Shooting.publicSlug (64-bit Entropie, von Lisa an Kundin geteilt)
// - MIME-Whitelist + Größen-Limit (max 5 MB)
// - saveUpload-Pipeline mit AES-Storage-Trim-Fix
// - Avatar wird genau am verknüpften Customer gespeichert, keine ID-Manipulation möglich
//
// Antwort als strukturiertes JSON, damit der Client klare Fehler anzeigen kann.

import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/upload";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) return Response.json({ error: "Ungültiger Link." }, { status: 400 });

  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    select: { customerId: true },
  });
  if (!shooting) {
    return Response.json({ error: "Profil nicht gefunden." }, { status: 404 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return Response.json({ error: "Die Datei konnte nicht gelesen werden." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return Response.json({ error: "Keine Datei ausgewählt." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json(
      { error: `Dieses Bildformat geht nicht (${file.type || "unbekannt"}). Erlaubt: PNG, JPG, SVG, WEBP.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return Response.json(
      { error: `Das Bild ist zu groß (${mb} MB). Maximal erlaubt sind 5 MB.` },
      { status: 400 },
    );
  }

  try {
    const res = await saveUpload(file, "avatars");
    await prisma.customer.update({
      where: { id: shooting.customerId },
      data: { avatarUrl: res.url },
    });
    return Response.json({ url: res.url });
  } catch (err: any) {
    const msg = typeof err?.message === "string" && err.message
      ? err.message
      : "Beim Speichern ist ein Fehler aufgetreten.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
