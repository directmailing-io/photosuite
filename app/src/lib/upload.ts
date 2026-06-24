import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const STORAGE_BACKEND = process.env.STORAGE_BACKEND ?? "local-fs";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "uploads";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

export async function saveUpload(file: File, subdir = "misc"): Promise<{ url: string; filename: string; sizeBytes: number; mimeType: string }> {
  if (!file || file.size === 0) throw new Error("Leere Datei");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const safeName = `${randomUUID()}.${ext}`;

  if (STORAGE_BACKEND === "supabase-storage") {
    return saveToSupabase(file, subdir, safeName);
  }

  // Default: local-fs
  const dir = join(UPLOAD_DIR, subdir);
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, safeName), buf);
  return {
    url: `/uploads/${subdir}/${safeName}`,
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
  };
}

async function saveToSupabase(
  file: File,
  subdir: string,
  safeName: string,
): Promise<{ url: string; filename: string; sizeBytes: number; mimeType: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Storage nicht konfiguriert — SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY erforderlich",
    );
  }

  const path = `${subdir}/${safeName}`;
  const bucket = SUPABASE_STORAGE_BUCKET;
  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
  const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (res.status === 404) {
    throw new Error(`Storage-Bucket '${bucket}' nicht gefunden — Setup nachholen`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Supabase-Upload fehlgeschlagen (${res.status}): ${detail || res.statusText}`,
    );
  }

  const publicUrl = `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  return {
    url: publicUrl,
    filename: file.name,
    sizeBytes: file.size,
    mimeType: contentType,
  };
}
