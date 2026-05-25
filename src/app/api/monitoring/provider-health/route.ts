import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { getProviderHealthSnapshot } from "@/lib/provider-health";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (token.role !== "admin" && token.role !== "supervisor") {
    return forbidden("Hanya admin / supervisor yang dapat melihat health provider");
  }

  const snapshot = await getProviderHealthSnapshot();

  // Series 24 jam — group per provider per jam
  const [trendRows] = await pool.query<RowDataPacket[]>(
    `SELECT provider_name,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS bucket,
            SUM(success = 1) AS success,
            SUM(success = 0) AS failure,
            ROUND(AVG(latency_ms)) AS avg_latency
       FROM provider_health_samples
       WHERE created_at >= NOW() - INTERVAL 24 HOUR
       GROUP BY provider_name, bucket
       ORDER BY bucket ASC`
  );

  // Status job
  const [jobRows] = await pool.query<RowDataPacket[]>(
    `SELECT job_name, is_locked, locked_at, last_run_at, last_run_ms,
            last_status, last_summary, run_count, fail_count
       FROM system_jobs
       ORDER BY job_name ASC`
  );

  return NextResponse.json({
    providers: snapshot,
    trends: trendRows.map((r) => ({
      providerName: String(r.provider_name),
      bucket: String(r.bucket),
      success: Number(r.success),
      failure: Number(r.failure),
      avgLatencyMs: Number(r.avg_latency ?? 0),
    })),
    jobs: jobRows.map((r) => ({
      jobName: String(r.job_name),
      isLocked: Number(r.is_locked) === 1,
      lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : null,
      lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
      lastRunMs: r.last_run_ms == null ? null : Number(r.last_run_ms),
      lastStatus: r.last_status as string | null,
      lastSummary: r.last_summary as string | null,
      runCount: Number(r.run_count),
      failCount: Number(r.fail_count),
    })),
  });
}
