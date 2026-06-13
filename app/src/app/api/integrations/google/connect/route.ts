import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/integrations/googleMeet";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL ?? "http://localhost:3006"));

  const state = randomBytes(16).toString("hex");
  let url: string;
  try {
    url = getGoogleAuthUrl(state);
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/einstellungen?tab=kalender&googleError=${encodeURIComponent(err?.message ?? "GOOGLE_CONFIG_MISSING")}`, process.env.APP_BASE_URL ?? "http://localhost:3006"));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });
  return res;
}
