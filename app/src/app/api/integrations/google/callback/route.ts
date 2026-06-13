import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exchangeGoogleCode } from "@/lib/integrations/googleMeet";

export async function GET(req: NextRequest) {
  const session = await auth();
  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  if (!session?.user) return NextResponse.redirect(new URL("/login", baseUrl));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieState = req.cookies.get("google_oauth_state")?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/einstellungen?tab=kalender&googleError=${encodeURIComponent(error)}`, baseUrl));
  }
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(new URL("/einstellungen?tab=kalender&googleError=CSRF_FAIL", baseUrl));
  }

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    return NextResponse.redirect(new URL("/einstellungen?tab=kalender&googleError=NO_USER", baseUrl));
  }

  const result = await exchangeGoogleCode(code, user.id);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/einstellungen?tab=kalender&googleError=${encodeURIComponent(result.reason)}`, baseUrl));
  }

  const res = NextResponse.redirect(new URL("/einstellungen?tab=kalender&googleConnected=1", baseUrl));
  res.cookies.delete("google_oauth_state");
  return res;
}
