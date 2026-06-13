// Google Calendar + Meet Integration via OAuth 2.0.
//
// Warum dieses Modul existiert:
// Google Meet hat KEINE eigene "create meeting"-API. Meet-Räume entstehen
// ausschließlich als Conferencing-Objekt eines Google-Calendar-Events
// (conferenceData.createRequest, conferenceSolutionKey="hangoutsMeet").
// Wir legen also pro Buchung ein Calendar-Event im primary Kalender der
// verbundenen Userin an und nutzen den von Google generierten hangoutLink.
//
// Token-Speicherung: Access- und Refresh-Token werden mit AES-256-GCM
// verschlüsselt (encryptSecret), AAD ist die userId. So sind die Tokens
// auch bei DB-Leak nicht ohne den APP_ENCRYPTION_KEY entschlüsselbar
// und nicht zwischen Accounts vertauschbar.

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  type CreateMeetingParams,
  type IntegrationResult,
  optionalEnv,
  requireEnv,
} from "@/lib/integrations/types";

// --------- Konstanten ---------

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1";

// Scopes:
// - calendar.events: Events lesen/schreiben (kein Zugriff auf andere Kalender-Settings).
// - openid email profile: für ID-Token, damit wir die verbundene Google-E-Mail cachen.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
].join(" ");

// Token wird als "abgelaufen" behandelt, wenn er in weniger als 60 s ungültig wird —
// vermeidet Race-Conditions zwischen Check und API-Call.
const TOKEN_REFRESH_THRESHOLD_MS = 60 * 1000;

// --------- 1) OAuth-URL bauen ---------

export function getGoogleAuthUrl(state: string): string {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const redirectUri = requireEnv("GOOGLE_REDIRECT_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    // offline: damit wir einen refresh_token bekommen (sonst nur 1h gültig).
    access_type: "offline",
    // consent erzwingen, damit der refresh_token IMMER ausgeliefert wird,
    // auch bei einer reconnect-Aktion (Google liefert ihn sonst nur beim
    // allerersten Consent).
    prompt: "consent",
    // include_granted_scopes hilft, wenn der User später weitere Scopes hinzufügt.
    include_granted_scopes: "true",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// --------- 2) Authorization-Code gegen Tokens tauschen ---------

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeGoogleCode(
  code: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri = requireEnv("GOOGLE_REDIRECT_URL");

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;

    if (!res.ok || !data.access_token) {
      const reason =
        data.error_description || data.error || `Token-Tausch fehlgeschlagen (HTTP ${res.status})`;
      return { ok: false, reason };
    }

    // Beim Authorization-Code-Flow MUSS ein refresh_token kommen (wegen prompt=consent).
    // Falls trotzdem nicht: hart abbrechen, weil wir sonst nach 1h "tot" sind.
    if (!data.refresh_token) {
      return {
        ok: false,
        reason: "Google hat keinen refresh_token geliefert — bitte erneut verbinden.",
      };
    }

    // E-Mail aus id_token extrahieren (JWT: header.payload.signature).
    // Wir verifizieren die Signatur NICHT, weil wir gerade selbst den Code
    // mit unserem client_secret an Googles Token-Endpunkt übergeben haben —
    // die Antwort kommt über TLS direkt von Google.
    let email: string | null = null;
    if (data.id_token) {
      email = extractEmailFromIdToken(data.id_token);
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessTokenEnc: encryptSecret(data.access_token, userId),
        googleRefreshTokenEnc: encryptSecret(data.refresh_token, userId),
        googleTokenExpiresAt: expiresAt,
        googleAccountEmail: email,
      },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Unbekannter Fehler beim Token-Tausch",
    };
  }
}

// JWT payload ist base64url-kodiert; "-" und "_" gegen "+" und "/" tauschen
// und ggf. Padding ergänzen, damit Buffer.from(base64) sauber dekodiert.
function extractEmailFromIdToken(idToken: string): string | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payloadB64Url = parts[1];
    const padded = payloadB64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payloadB64Url.length + ((4 - (payloadB64Url.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { email?: string };
    return typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}

// --------- 3) Google-Verbindung trennen ---------

export async function disconnectGoogle(userId: string): Promise<void> {
  try {
    // Best-effort: aktuelles Access-Token bei Google revoken.
    // Wenn das fehlschlägt (Netz, schon ungültig), trotzdem lokal aufräumen.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleAccessTokenEnc: true },
    });

    if (user?.googleAccessTokenEnc) {
      try {
        const token = decryptSecret(user.googleAccessTokenEnc, userId);
        await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Ignorieren — Revoke ist best-effort.
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessTokenEnc: null,
        googleRefreshTokenEnc: null,
        googleTokenExpiresAt: null,
        googleAccountEmail: null,
      },
    });
  } catch {
    // Schweigend schlucken — disconnect darf parent nie crashen.
  }
}

// --------- 4) Gültiges Access-Token sicherstellen (mit Auto-Refresh) ---------

export async function ensureValidGoogleToken(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessTokenEnc: true,
        googleRefreshTokenEnc: true,
        googleTokenExpiresAt: true,
      },
    });

    if (!user?.googleAccessTokenEnc) return null;

    const expiresAt = user.googleTokenExpiresAt;
    const needsRefresh =
      !expiresAt || expiresAt.getTime() - Date.now() < TOKEN_REFRESH_THRESHOLD_MS;

    if (!needsRefresh) {
      return decryptSecret(user.googleAccessTokenEnc, userId);
    }

    // Refresh-Pfad: ohne Refresh-Token können wir nichts tun.
    if (!user.googleRefreshTokenEnc) return null;

    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
    const refreshToken = decryptSecret(user.googleRefreshTokenEnc, userId);

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;

    if (!res.ok || !data.access_token) {
      // Wenn Google den Refresh-Token ablehnt (z.B. invalid_grant nach
      // User-Widerruf in Google-Account-Settings), Tokens lokal aufräumen,
      // damit die UI sauber "neu verbinden" anzeigen kann.
      if (data.error === "invalid_grant") {
        await prisma.user.update({
          where: { id: userId },
          data: {
            googleAccessTokenEnc: null,
            googleRefreshTokenEnc: null,
            googleTokenExpiresAt: null,
          },
        });
      }
      return null;
    }

    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    // Google liefert beim Refresh meist KEINEN neuen refresh_token — dann
    // den bestehenden behalten. Falls doch einer kommt: rotieren.
    const updatedRefreshEnc = data.refresh_token
      ? encryptSecret(data.refresh_token, userId)
      : user.googleRefreshTokenEnc;

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessTokenEnc: encryptSecret(data.access_token, userId),
        googleRefreshTokenEnc: updatedRefreshEnc,
        googleTokenExpiresAt: newExpiresAt,
      },
    });

    return data.access_token;
  } catch {
    return null;
  }
}

// --------- 5) Calendar-Event mit Meet-Link erstellen ---------

type GoogleCalendarEventResponse = {
  id?: string;
  hangoutLink?: string;
  htmlLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  error?: { message?: string; code?: number };
};

export async function createGoogleMeetEvent(
  userId: string,
  params: CreateMeetingParams,
): Promise<IntegrationResult> {
  try {
    const accessToken = await ensureValidGoogleToken(userId);
    if (!accessToken) {
      return { ok: false, reason: "Nicht mit Google verbunden" };
    }

    const endAt = new Date(params.startAt.getTime() + params.durationMin * 60_000);

    // Optionaler Default-Timezone: Europe/Berlin. Lässt sich per ENV überschreiben,
    // falls die App später mehrsprachig/multi-TZ wird.
    const timeZone = optionalEnv("GOOGLE_CALENDAR_TIMEZONE") || "Europe/Berlin";

    const body: Record<string, unknown> = {
      summary: params.topic,
      description: "Online-Termin",
      start: { dateTime: params.startAt.toISOString(), timeZone },
      end: { dateTime: endAt.toISOString(), timeZone },
      conferenceData: {
        createRequest: {
          // requestId muss pro Event eindeutig sein — sonst recycelt Google
          // möglicherweise ein bestehendes Conferencing-Objekt.
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      attendees: params.customerEmail
        ? [{ email: params.customerEmail, displayName: params.customerName }]
        : [],
    };

    const res = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as GoogleCalendarEventResponse;

    if (!res.ok) {
      const reason =
        data.error?.message || `Google-Calendar-API-Fehler (HTTP ${res.status})`;
      return { ok: false, reason };
    }

    // Fallback: manche Antworten haben hangoutLink leer, aber conferenceData.entryPoints
    // enthält den Video-Eintrag. Beide Pfade prüfen.
    const joinUrl =
      data.hangoutLink ||
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;

    if (!joinUrl) {
      return { ok: false, reason: "Google hat keinen Meet-Link erstellt" };
    }

    return {
      ok: true,
      meeting: {
        joinUrl,
        externalId: data.id,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Unbekannter Fehler beim Event-Erstellen",
    };
  }
}

// --------- 6) Connection-Status für UI ---------

export async function hasGoogleConnection(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleAccessTokenEnc: true, googleRefreshTokenEnc: true },
    });
    return Boolean(user?.googleAccessTokenEnc && user?.googleRefreshTokenEnc);
  } catch {
    return false;
  }
}
