import { NextResponse } from "next/server";
import { processScheduledJobs } from "@/lib/workflow/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Workflow-Cron-Endpoint. Wird von Vercel-Cron alle 5 Minuten getriggert
 * (s. vercel.json crons-Block). Schützt sich gegen unautorisierte Aufrufe
 * via CRON_SECRET — Vercel-Cron sendet den Bearer im Authorization-Header.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await processScheduledJobs(100);
  return NextResponse.json({ ok: true, ...result });
}
