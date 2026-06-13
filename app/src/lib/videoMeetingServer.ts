import "server-only";
import { isOAuthProvider, type VideoProviderKey } from "@/lib/videoProviders";

// Server-only: erstellt ein unique Meeting via Provider-API (Tier 2).
// Wenn keine OAuth-Verbindung besteht oder Provider kein OAuth unterstützt → null.
export async function createMeetingForBooking(
  provider: VideoProviderKey,
  userId: string,
  params: {
    topic: string;
    startAt: Date;
    durationMin: number;
    customerEmail?: string;
    customerName?: string;
  },
): Promise<string | null> {
  if (!isOAuthProvider(provider)) return null;
  try {
    if (provider === "zoom") {
      const { createZoomMeeting, hasZoomConnection } = await import("@/lib/integrations/zoom");
      if (!(await hasZoomConnection(userId))) return null;
      const r = await createZoomMeeting(userId, params);
      return r.ok ? r.meeting.joinUrl : null;
    }
    if (provider === "google_meet") {
      const { createGoogleMeetEvent, hasGoogleConnection } = await import("@/lib/integrations/googleMeet");
      if (!(await hasGoogleConnection(userId))) return null;
      const r = await createGoogleMeetEvent(userId, params);
      return r.ok ? r.meeting.joinUrl : null;
    }
    return null;
  } catch (e) {
    // Geloggt, aber nicht propagiert — Buchung darf nicht an OAuth-Fehler scheitern.
    console.error("[createMeetingForBooking]", provider, e);
    return null;
  }
}
