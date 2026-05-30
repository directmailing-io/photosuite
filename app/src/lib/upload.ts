import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

export async function saveUpload(file: File, subdir = "misc"): Promise<{ url: string; filename: string; sizeBytes: number; mimeType: string }> {
  if (!file || file.size === 0) throw new Error("Leere Datei");
  const dir = join(UPLOAD_DIR, subdir);
  await mkdir(dir, { recursive: true });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const safeName = `${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, safeName), buf);
  return {
    url: `/uploads/${subdir}/${safeName}`,
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
  };
}
