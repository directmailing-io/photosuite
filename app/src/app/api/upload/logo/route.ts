// Logo-Upload: validiert MIME-Type, speichert in /uploads/logos/.
// Kein DB-Update hier — der Settings-UI ruft saveStudioLogo() nach erfolgreichem Crop auf.
//
// Wichtig: Fehler werden als strukturiertes JSON zurückgegeben, damit der Client
// dem User eine verständliche Ursache anzeigen kann (keine generischen 500er).

import { auth } from "@/lib/auth";
import { saveUpload } from "@/lib/upload";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/svg+xml", "image/png", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: "Du bist nicht angemeldet. Bitte neu einloggen." }, { status: 401 });
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
      { error: `Dieses Dateiformat geht nicht (${file.type || "unbekannt"}). Erlaubt: SVG, PNG, JPG.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return Response.json(
      { error: `Die Datei ist zu groß (${mb} MB). Maximal erlaubt sind 5 MB.` },
      { status: 400 },
    );
  }

  try {
    const res = await saveUpload(file, "logos");
    return Response.json({ url: res.url, mimeType: file.type });
  } catch (err: any) {
    // Echte Fehlermeldung durchreichen, damit der Client sie anzeigen kann.
    const msg =
      typeof err?.message === "string" && err.message
        ? err.message
        : "Beim Speichern ist ein Fehler aufgetreten.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
