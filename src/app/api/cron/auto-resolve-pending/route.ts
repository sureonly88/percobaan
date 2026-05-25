import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/jobs/cron-auth";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/system-job-lock";
import { runAutoResolvePending } from "@/lib/jobs/auto-resolve-pending";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const denied = await authorizeCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const staleMinutes = num(url.searchParams.get("staleMinutes"), 15);
  const exhaustedMinutes = num(url.searchParams.get("exhaustedMinutes"), 60);
  const maxAdviceAttempts = num(url.searchParams.get("maxAdviceAttempts"), 6);

  const lock = await acquireJobLock("auto_resolve_pending", 5 * 60 * 1000);
  if (!lock.acquired) {
    return NextResponse.json(
      { ok: false, skipped: true, reason: "already-running" },
      { status: 200 }
    );
  }

  const t0 = Date.now();
  try {
    const summary = await runAutoResolvePending({
      staleMinutes,
      exhaustedMinutes,
      maxAdviceAttempts,
    });
    await releaseJobLock(
      lock,
      "SUCCESS",
      `promoted=${summary.promoted} autoFailed=${summary.autoFailed} scanned=${summary.scannedStale}+${summary.scannedExhausted}`,
      Date.now() - t0
    );
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await releaseJobLock(lock, "FAILED", msg, Date.now() - t0);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function num(s: string | null, def: number): number {
  if (!s) return def;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const GET = handle;
export const POST = handle;
