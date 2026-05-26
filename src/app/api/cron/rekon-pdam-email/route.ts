/**
 * Cron endpoint: Generate & kirim email rekonsiliasi PDAM Native.
 *
 * Trigger via:
 *   curl -X POST https://<host>/api/cron/rekon-pdam-email \
 *        -H "X-Cron-Secret: <CRON_SECRET>"
 *
 * Query params opsional:
 *   ?date=YYYY-MM-DD   — override tanggal (default: kemarin)
 *   ?loketCode=LKT-001 — filter loket tertentu
 *
 * Crontab harian (jam 01:00 dini hari):
 *   0 1 * * * curl -fsS -X POST -H "X-Cron-Secret: <CRON_SECRET>" \
 *     http://localhost:3000/api/cron/rekon-pdam-email \
 *     >> /var/log/portal-cron.log 2>&1
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/jobs/cron-auth";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/system-job-lock";
import { runRekonPdamEmail } from "@/lib/jobs/rekon-pdam-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const denied = await authorizeCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || undefined;
  const loketCode = url.searchParams.get("loketCode") || undefined;

  const lock = await acquireJobLock("rekon_pdam_email", 10 * 60 * 1000);
  if (!lock.acquired) {
    return NextResponse.json(
      { ok: false, skipped: true, reason: "already-running" },
      { status: 200 }
    );
  }

  const t0 = Date.now();
  try {
    const summary = await runRekonPdamEmail({ date, loketCode });
    await releaseJobLock(
      lock,
      "SUCCESS",
      `date=${summary.date} to=${summary.emailTo} file=${summary.filename}`,
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
