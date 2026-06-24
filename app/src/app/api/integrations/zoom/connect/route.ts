import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireUserId } from "@/lib/auth";
import { getZoomAuthUrl } from "@/lib/integrations/zoom";

// Initiates the OAuth flow: generate a CSRF state, store it in a httpOnly cookie,
// and redirect to Zoom's authorize URL.
export async function GET() {
  // Auth-protected: nur eingeloggte Studio-User dürfen OAuth starten.
  try {
    await requireUserId();
  } catch {
    return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL ?? "http://localhost:3006"));
  }

  const state = randomBytes(16).toString("hex");
  let url: string;
  try {
    url = getZoomAuthUrl(state);
  } catch (err: any) {
    const params = new URLSearchParams({ error: err?.message ?? "ZOOM_CONFIG_MISSING" });
    return NextResponse.redirect(new URL(`/einstellungen?tab=kalender&zoomError=${encodeURIComponent(err?.message ?? "ZOOM_CONFIG_MISSING")}`, process.env.APP_BASE_URL ?? "http://localhost:3006"));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("zoom_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 Min reichen für OAuth-Flow
    path: "/",
  });
  return res;
}
