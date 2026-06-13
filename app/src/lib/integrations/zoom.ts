// Zoom OAuth + Meeting-API-Integration (User-Level OAuth, kein Marketplace-Account-Level).
//
// Modell: Jeder User verbindet seinen eigenen Zoom-Account via OAuth. Wir speichern
// Access- und Refresh-Token AES-256-GCM-verschlüsselt in der User-Tabelle. Für jede
// neue Buchung erzeugen wir on-demand ein Meeting im Account des verbundenen Users.
//
// Warum dieser Ansatz statt persönlichem PMI-Link?
//  - Jede Buchung bekommt eine eigene, einmalige Meeting-ID → kein Crosstalk zwischen Kundinnen.
//  - Wir können später Start/Ende-Hooks, Recording-Settings etc. zentral konfigurieren.
//
// Refresh-Token-Strategie: Zoom rotiert das Refresh-Token bei jedem Refresh — wir
// müssen also auch das Refresh-Token bei jedem Refresh neu speichern.
// Quelle: https://developers.zoom.us/docs/integrations/oauth/

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  type CreateMeetingParams,
  type IntegrationResult,
  requireEnv,
} from "@/lib/integrations/types";

const ZOOM_OAUTH_BASE = "https://zoom.us/oauth";
const ZOOM_API_BASE = "https://api.zoom.us/v2";

// OAuth-Scopes: Minimal-Set für Meeting-Erstellung + User-Info beim Connect.
// `meeting:write` deckt POST /users/{userId}/meetings ab, `user:read` für /users/me.
const ZOOM_SCOPES = "meeting:write user:read";

// Sicherheitspuffer: Token wird "abgelaufen" behandelt, wenn weniger als 60 s übrig.
// Verhindert Race bei langsamen API-Calls direkt am Ablaufzeitpunkt.
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

// -----------------------------------------------------------------------------
// 1) Authorize URL
// -----------------------------------------------------------------------------

export function getZoomAuthUrl(state: string): string {
  const clientId = requireEnv("ZOOM_CLIENT_ID");
  const redirectUri = requireEnv("ZOOM_REDIRECT_URL");
  // Standard-OAuth: `scope` ist space-separated. URLSearchParams kümmert sich um Encoding.
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ZOOM_SCOPES,
    state,
  });
  return `${ZOOM_OAUTH_BASE}/authorize?${params.toString()}`;
}

// -----------------------------------------------------------------------------
// Internal: Token-Request-Helper (für authorization_code + refresh_token)
// -----------------------------------------------------------------------------

type ZoomTokenResponse = {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
};

function basicAuthHeader(): string {
  const clientId = requireEnv("ZOOM_CLIENT_ID");
  const clientSecret = requireEnv("ZOOM_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function postTokenRequest(
  body: URLSearchParams,
): Promise<{ ok: true; data: ZoomTokenResponse } | { ok: false; reason: string }> {
  try {
    const res = await fetch(`${ZOOM_OAUTH_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      // Zoom liefert Fehler i.d.R. als { reason, error } JSON.
      let reason = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        reason = j.reason || j.error_description || j.error || reason;
      } catch {
        if (text) reason = text.slice(0, 200);
      }
      return { ok: false, reason };
    }
    const data = JSON.parse(text) as ZoomTokenResponse;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Netzwerkfehler: ${msg}` };
  }
}

// -----------------------------------------------------------------------------
// 2) Exchange OAuth code → Access/Refresh-Token + User-Info-Caching
// -----------------------------------------------------------------------------

export async function exchangeZoomCode(
  code: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const redirectUri = requireEnv("ZOOM_REDIRECT_URL");

    const tokenRes = await postTokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    );
    if (!tokenRes.ok) return { ok: false, reason: tokenRes.reason };
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // User-Info ziehen, damit wir Email/ZoomUserId für UI & spätere API-Calls cachen.
    let zoomAccountEmail: string | null = null;
    let zoomUserId: string | null = null;
    try {
      const meRes = await fetch(`${ZOOM_API_BASE}/users/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/json",
        },
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as { id?: string; email?: string };
        zoomAccountEmail = me.email ?? null;
        zoomUserId = me.id ?? null;
      }
    } catch {
      // User-Info ist nice-to-have — Connect darf nicht daran scheitern.
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        zoomAccessTokenEnc: encryptSecret(access_token, userId),
        zoomRefreshTokenEnc: encryptSecret(refresh_token, userId),
        zoomTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        zoomAccountEmail,
        zoomUserId,
      },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}

// -----------------------------------------------------------------------------
// 3) Disconnect: Token revoken + DB-Felder leeren
// -----------------------------------------------------------------------------

export async function disconnectZoom(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { zoomAccessTokenEnc: true },
    });
    if (user?.zoomAccessTokenEnc) {
      try {
        const accessToken = decryptSecret(user.zoomAccessTokenEnc, userId);
        // Best-effort revoke; bei Fehler trotzdem lokal trennen.
        await fetch(`${ZOOM_OAUTH_BASE}/revoke`, {
          method: "POST",
          headers: {
            Authorization: basicAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ token: accessToken }).toString(),
        });
      } catch {
        // Revoke darf den Disconnect nicht blockieren.
      }
    }
  } catch {
    // Auch das Lesen darf nicht blocken — wir wollen sauber trennen.
  } finally {
    await prisma.user.update({
      where: { id: userId },
      data: {
        zoomAccessTokenEnc: null,
        zoomRefreshTokenEnc: null,
        zoomTokenExpiresAt: null,
        zoomAccountEmail: null,
        zoomUserId: null,
      },
    });
  }
}

// -----------------------------------------------------------------------------
// 4) ensureValidZoomToken — Refresh on demand
// -----------------------------------------------------------------------------

export async function ensureValidZoomToken(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        zoomAccessTokenEnc: true,
        zoomRefreshTokenEnc: true,
        zoomTokenExpiresAt: true,
      },
    });
    if (!user?.zoomAccessTokenEnc || !user.zoomRefreshTokenEnc) return null;

    const expiresAt = user.zoomTokenExpiresAt?.getTime() ?? 0;
    const needsRefresh = expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;

    if (!needsRefresh) {
      return decryptSecret(user.zoomAccessTokenEnc, userId);
    }

    // Refresh-Flow: Zoom rotiert das Refresh-Token, also beides neu persistieren.
    const refreshToken = decryptSecret(user.zoomRefreshTokenEnc, userId);
    const tokenRes = await postTokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    );
    if (!tokenRes.ok) return null;
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    await prisma.user.update({
      where: { id: userId },
      data: {
        zoomAccessTokenEnc: encryptSecret(access_token, userId),
        zoomRefreshTokenEnc: encryptSecret(refresh_token, userId),
        zoomTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });

    return access_token;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// 5) createZoomMeeting
// -----------------------------------------------------------------------------

// Zoom erwartet `start_time` als ISO-8601 ohne Millisekunden (z.B. "2026-06-12T14:00:00Z").
// JS-Date#toISOString liefert ".sssZ" — wir strippen die Millisekunden.
function formatZoomStartTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function createZoomMeeting(
  userId: string,
  params: CreateMeetingParams,
): Promise<IntegrationResult> {
  try {
    const accessToken = await ensureValidZoomToken(userId);
    if (!accessToken) {
      return { ok: false, reason: "Nicht mit Zoom verbunden" };
    }

    const body = {
      topic: params.topic,
      type: 2, // 2 = Scheduled Meeting
      start_time: formatZoomStartTime(params.startAt),
      duration: params.durationMin,
      timezone: "Europe/Berlin",
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        // approval_type: 2 = "No registration required" — Kundinnen kommen ohne Zoom-Account rein.
        approval_type: 2,
        audio: "both",
        auto_recording: "none",
        waiting_room: false,
      },
    };

    const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        msg = j.message || j.reason || msg;
      } catch {
        if (text) msg = text.slice(0, 200);
      }
      return { ok: false, reason: `Zoom API: ${msg}` };
    }

    const data = JSON.parse(text) as { id?: number | string; join_url?: string };
    if (!data.join_url) {
      return { ok: false, reason: "Zoom API: kein join_url in Antwort" };
    }

    return {
      ok: true,
      meeting: {
        joinUrl: data.join_url,
        externalId: data.id !== undefined ? String(data.id) : undefined,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Zoom API: ${msg}` };
  }
}

// -----------------------------------------------------------------------------
// 6) hasZoomConnection — kleiner Helper für UI/Booking-Flow
// -----------------------------------------------------------------------------

export async function hasZoomConnection(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { zoomAccessTokenEnc: true, zoomRefreshTokenEnc: true },
    });
    return !!(user?.zoomAccessTokenEnc && user?.zoomRefreshTokenEnc);
  } catch {
    return false;
  }
}
