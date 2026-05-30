// AES-256-GCM für User-eingegebene Secrets (Stripe Keys, Webhook Secrets).
// Master-Key aus APP_ENCRYPTION_KEY (32 Byte, base64). Pro Encryption neuer 12-Byte IV.
// AAD = userId, damit ein Ciphertext nicht zwischen Accounts substituiert werden kann.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "APP_ENCRYPTION_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `${KEY_ENV} ist nicht gesetzt. Erzeuge einen Key mit:\n` +
      `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      `und trage ihn in .env ein.`,
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`${KEY_ENV} muss base64-kodiert 32 Byte ergeben (aktuell ${buf.length}).`);
  }
  return buf;
}

// Format: v1:<iv-base64>:<tag-base64>:<ciphertext-base64>
// Prefix v1 für zukünftige Key-Rotation.
export function encryptSecret(plaintext: string, userId: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload: string, userId: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Ungültiges verschlüsseltes Secret (Format)");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Zur Anzeige in UI: nur die letzten 4 Zeichen sichtbar, Rest maskiert.
export function maskSecret(plaintext: string | null | undefined): string {
  if (!plaintext) return "";
  if (plaintext.length <= 8) return "••••";
  const tail = plaintext.slice(-4);
  return `${plaintext.slice(0, 7)}…${tail}`;
}

// Unguessable URL-safe Token (256 bit) für Public-Invoice-Links.
export function generateUrlToken(): string {
  return randomBytes(32).toString("base64url");
}
