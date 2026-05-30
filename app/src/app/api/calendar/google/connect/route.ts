// Startet den Google-OAuth-Flow. Setzt einen CSRF-State im Cookie + leitet zu Google um.

import { auth } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/calendar/google";
import { generateUrlToken } from "@/lib/crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    redirect("/einstellungen?tab=kalender&error=" + encodeURIComponent(
      "Google-Integration ist noch nicht freigeschaltet. Wir melden uns, sobald sie verfügbar ist.",
    ));
  }

  const state = generateUrlToken();
  const cookieStore = await cookies();
  cookieStore.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  redirect(googleAuthUrl(state));
}
