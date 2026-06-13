// Video-Provider-Definitionen für Online-Meeting-Integration.
//
// MVP-Modell: Pro Provider hinterlegt der User einen persönlichen Meeting-Link
// (z.B. den festen Zoom-PMI oder einen Whereby-Raum). Beim Anlegen einer Buchung
// wird dieser Link in Booking.meetingUrl gespeichert.
//
// Auto-Create-Meeting per OAuth folgt als „Tier 2" (eigene Provider-Module):
// dafür braucht es Client-ID/Secret in .env + Refresh-Token-Handling. Bis dahin
// ist der persönliche Link der schnellste & zuverlässigste Weg.

export type VideoProviderKey = "zoom" | "google_meet" | "teams" | "whereby" | "manual";

export type VideoProvider = {
  key: VideoProviderKey;
  name: string;
  // Property auf User-Model, das den persönlichen Link enthält.
  userLinkField:
    | "zoomPersonalLink"
    | "googleMeetPersonalLink"
    | "teamsPersonalLink"
    | "wherebyPersonalLink"
    | null;
  // Anzeige-Hinweise für die Setup-UI
  description: string;
  placeholderUrl: string;
  // Brand-Farbe für UI-Akzente (subtil)
  brandColor: string;
};

export const VIDEO_PROVIDERS: Record<VideoProviderKey, VideoProvider> = {
  zoom: {
    key: "zoom",
    name: "Zoom",
    userLinkField: "zoomPersonalLink",
    description: "Dein persönlicher Meeting-Raum (PMI) — wird automatisch in jede Buchung eingefügt.",
    placeholderUrl: "https://us05web.zoom.us/j/12345678901?pwd=…",
    brandColor: "#2D8CFF",
  },
  google_meet: {
    key: "google_meet",
    name: "Google Meet",
    userLinkField: "googleMeetPersonalLink",
    description: "Dein persönlicher Meet-Raum. Du erstellst ihn einmal in Google Meet, der Link bleibt stabil.",
    placeholderUrl: "https://meet.google.com/abc-defg-hij",
    brandColor: "#00897B",
  },
  teams: {
    key: "teams",
    name: "Microsoft Teams",
    userLinkField: "teamsPersonalLink",
    description: 'Dein Teams-Meeting-Link (z.B. „Sofort-Meeting" mit fester URL).',
    placeholderUrl: "https://teams.microsoft.com/l/meetup-join/…",
    brandColor: "#6264A7",
  },
  whereby: {
    key: "whereby",
    name: "Whereby",
    userLinkField: "wherebyPersonalLink",
    description: "DSGVO-freundlich, EU-gehostet. Dein persönlicher Raum-Link.",
    placeholderUrl: "https://whereby.com/dein-raum",
    brandColor: "#5C7CFA",
  },
  manual: {
    key: "manual",
    name: "Manuell",
    userLinkField: null,
    description: "Kein automatischer Link. Du schickst der Kundin den Meeting-Link selbst nach Bestätigung.",
    placeholderUrl: "",
    brandColor: "#9F877F",
  },
};

export const VIDEO_PROVIDER_ORDER: VideoProviderKey[] = [
  "zoom",
  "google_meet",
  "teams",
  "whereby",
  "manual",
];

// Resolviert den Meeting-Link aus dem User für einen gegebenen Provider.
// Bei "manual" oder fehlendem Link: null.
export function resolveMeetingLink(
  provider: VideoProviderKey | null | undefined,
  user: {
    zoomPersonalLink?: string | null;
    googleMeetPersonalLink?: string | null;
    teamsPersonalLink?: string | null;
    wherebyPersonalLink?: string | null;
  } | null,
): string | null {
  if (!provider || provider === "manual" || !user) return null;
  const def = VIDEO_PROVIDERS[provider];
  if (!def?.userLinkField) return null;
  const val = user[def.userLinkField];
  return val && val.trim() ? val.trim() : null;
}

export function isValidProviderKey(s: string | null | undefined): s is VideoProviderKey {
  if (!s) return false;
  return (VIDEO_PROVIDER_ORDER as string[]).includes(s);
}
