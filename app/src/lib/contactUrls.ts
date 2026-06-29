/**
 * URL-Builder für Schnellkontakt-Buttons.
 *
 * Sanitization:
 * - WhatsApp braucht reine Ziffern (`wa.me/491511234567`).
 * - Telegram braucht den Username ohne `@` (`t.me/lisaboudoir`).
 * - tel:/mailto: dürfen Leerzeichen + Sonderzeichen enthalten (Browser normalisiert).
 *
 * Wir geben `null` zurück, wenn der Input leer oder unbrauchbar ist,
 * damit der Caller den Button gar nicht rendert.
 */

export function whatsappUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  // Nur Ziffern behalten; führende „0" → unverändert, da die Kundin auch DE-Nummern
  // ohne Ländercode eingeben könnte. wa.me erwartet aber idealerweise Ländercode.
  // Pragmatisch: alles non-digit raus, prüfen ob ≥ 7 Ziffern (sonst Mist).
  const digits = String(input).replace(/\D+/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}

export function telegramUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // 1) Full-URL: https://t.me/xyz  oder  http://t.me/xyz
  const m = raw.match(/^https?:\/\/t\.me\/([A-Za-z0-9_+\-]+)/i);
  if (m) return `https://t.me/${encodeURIComponent(m[1])}`;
  // 2) „@username" oder „username" — nur Buchstaben/Zahlen/Underscore zulassen
  const name = raw.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{3,40}$/.test(name)) return null;
  return `https://t.me/${name}`;
}

export function telUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input).trim();
  if (cleaned.length < 4) return null;
  // tel:-Schema akzeptiert Leerzeichen, Bindestriche etc. — der Browser parsed.
  return `tel:${cleaned}`;
}

export function mailtoUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input).trim();
  // Einfacher Format-Check; vollständige RFC-822-Validation wäre overkill.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  return `mailto:${cleaned}`;
}
