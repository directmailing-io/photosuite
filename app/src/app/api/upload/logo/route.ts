// Logo-Upload: validiert MIME-Type, speichert in /uploads/logos/.
// Kein DB-Update hier — der Settings-UI ruft saveStudioLogo() nach erfolgreichem Crop auf.

import { auth } from "@/lib/auth";
import { saveUpload } from "@/lib/upload";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/svg+xml", "image/png", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) {
    return Response.json({ error: "Keine Datei übergeben" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: `Ungültiger Dateityp ${file.type}. Erlaubt: SVG, PNG, JPG, JPEG.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Datei zu groß (max. 5 MB)." }, { status: 400 });
  }

  const res = await saveUpload(file, "logos");
  return Response.json({ url: res.url, mimeType: file.type });
}
