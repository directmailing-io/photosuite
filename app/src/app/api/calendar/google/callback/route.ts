// OAuth-Callback von Google. Tauscht Code gegen Tokens, persistiert verschlüsselt,
// initialisiert die erste Kalender-Auswahl.

import { auth } from "@/lib/auth";
import { loadCurrentUser } from "@/lib/loadUser";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { googleExchangeCode } from "@/lib/calendar/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const user = await loadCurrentUser(session);
  if (!user) return new Response("User nicht gefunden", { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gcal_oauth_state")?.value;

  if (error) {
    cookieStore.delete("gcal_oauth_state");
    redirect(`/einstellungen?tab=kalender&error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || state !== expectedState) {
    cookieStore.delete("gcal_oauth_state");
    return new Response("Ungültiger State (CSRF-Schutz)", { status: 400 });
  }
  cookieStore.delete("gcal_oauth_state");

  const tokens = await googleExchangeCode(code);

  // Connection upserten
  const conn = await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: "google" } },
    create: {
      userId: user.id,
      provider: "google",
      accountEmail: tokens.email,
      accessTokenEnc: encryptSecret(tokens.accessToken, user.id),
      refreshTokenEnc: encryptSecret(tokens.refreshToken, user.id),
      tokenExpiresAt: tokens.expiresAt,
      oauthScope: tokens.scope,
      status: "active",
    },
    update: {
      accountEmail: tokens.email,
      accessTokenEnc: encryptSecret(tokens.accessToken, user.id),
      refreshTokenEnc: encryptSecret(tokens.refreshToken, user.id),
      tokenExpiresAt: tokens.expiresAt,
      oauthScope: tokens.scope,
      status: "active",
      lastSyncError: null,
    },
  });

  // Google akzeptiert "primary" als Alias für den Haupt-Kalender des verbundenen Accounts.
  // Das funktioniert mit unserem schmalen `calendar.events`-Scope (calendarList.list bräuchte
  // einen breiteren Scope, was unnötige Permissions verlangen würde).
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: {
      externalCalendarId: "primary",
      externalCalendarName: tokens.email || "Hauptkalender",
      externalCalendarTz: "Europe/Berlin",
    },
  });

  redirect("/einstellungen?tab=kalender&connected=google");
}
