import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/integrations/googleMeet";

export async function POST() {
  // Multi-Tenant: User-ID aus Session — NICHT findFirst().
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await disconnectGoogle(userId);
  return NextResponse.json({ ok: true });
}
