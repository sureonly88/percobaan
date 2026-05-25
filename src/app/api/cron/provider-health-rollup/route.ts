import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/jobs/cron-auth";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/system-job-lock";
import { rollupProviderHealth } from "@/lib/provider-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const denied = await authorizeCron(req);
  if (denied) return denied;

  const lock = await acquireJobLock("provider_health_rollup", 5 * 60 * 1000);
  if (!lock.acquired) {
    return NextResponse.json(
      { ok: false, skipped: true, reason: "already-running" },
      { status: 200 }
    );
  }

  const t0 = Date.now();
  try {
    const summary = await rollupProviderHealth();
    await releaseJobLock(
      lock,
      "SUCCESS",
      `providers=${summary.providers} totalEvents=${summary.totalEvents} purged=${summary.purged}`,
      Date.now() - t0
    );
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await releaseJobLock(lock, "FAILED", msg, Date.now() - t0);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
