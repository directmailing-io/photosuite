import { randomBytes } from "crypto";

const safe = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

export function generateSlug(seed: string): string {
  const token = randomBytes(3).toString("hex");
  const base = safe(seed) || "shooting";
  return `${base}-${token}`;
}
