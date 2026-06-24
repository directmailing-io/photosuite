import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { exchangeGoogleCode } from "@/lib/integrations/googleMeet";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  // Auth-protected: User-ID aus Session — NICHT prisma.user.findFirst() (Multi-Tenant!).
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

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

  const result = await exchangeGoogleCode(code, userId);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/einstellungen?tab=kalender&googleError=${encodeURIComponent(result.reason)}`, baseUrl));
  }

  const res = NextResponse.redirect(new URL("/einstellungen?tab=kalender&googleConnected=1", baseUrl));
  res.cookies.delete("google_oauth_state");
  return res;
}
