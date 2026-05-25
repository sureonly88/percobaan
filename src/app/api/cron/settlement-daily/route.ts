import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/jobs/cron-auth";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/system-job-lock";
import { generateDailyBatches } from "@/lib/settlement/batch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const denied = await authorizeCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || undefined;
  const loketCode = url.searchParams.get("loketCode") || undefined;

  const lock = await acquireJobLock("settlement_daily_batch", 10 * 60 * 1000);
  if (!lock.acquired) {
    return NextResponse.json(
      { ok: false, skipped: true, reason: "already-running" },
      { status: 200 }
    );
  }

  const t0 = Date.now();
  try {
    const summary = await generateDailyBatches({
      date,
      loketCode,
      createdBy: "cron:settlement_daily_batch",
    });
    await releaseJobLock(
      lock,
      "SUCCESS",
      `created=${summary.created} skipped=${summary.skipped}`,
      Date.now() - t0
    );
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await releaseJobLock(lock, "FAILED", msg, Date.now() - t0);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
