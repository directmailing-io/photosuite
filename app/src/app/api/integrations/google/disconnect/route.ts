import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disconnectGoogle } from "@/lib/integrations/googleMeet";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) return NextResponse.json({ error: "no_user" }, { status: 500 });
  await disconnectGoogle(user.id);
  return NextResponse.json({ ok: true });
}
