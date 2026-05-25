/**
 * Cron lock berbasis tabel `system_jobs` — mencegah job berjalan paralel
 * (mis. dua replica trigger cron bersamaan, atau cron dipanggil ulang).
 *
 *   const lock = await acquireJobLock("auto_resolve_pending", 5 * 60 * 1000);
 *   if (!lock.acquired) return;            // skip — sudah ada yang jalan
 *   try { ... } finally { await releaseJobLock(...); }
 */

import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { randomUUID } from "crypto";

export interface JobLockHandle {
  acquired: boolean;
  jobName: string;
  ownerId: string;
}

export async function acquireJobLock(
  jobName: string,
  staleAfterMs = 10 * 60 * 1000
): Promise<JobLockHandle> {
  const ownerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const staleSec = Math.floor(staleAfterMs / 1000);

  // Pastikan baris ada (idempotent).
  await pool.execute(
    `INSERT IGNORE INTO system_jobs (job_name) VALUES (?)`,
    [jobName]
  );

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE system_jobs
        SET is_locked  = 1,
            locked_at  = NOW(),
            locked_by  = ?,
            last_status = 'RUNNING'
      WHERE job_name = ?
        AND (is_locked = 0 OR locked_at < NOW() - INTERVAL ? SECOND)`,
    [ownerId, jobName, staleSec]
  );

  return {
    acquired: result.affectedRows === 1,
    jobName,
    ownerId,
  };
}

export async function releaseJobLock(
  handle: JobLockHandle,
  status: "SUCCESS" | "FAILED",
  summary: string,
  durationMs: number
): Promise<void> {
  if (!handle.acquired) return;
  const failInc = status === "FAILED" ? 1 : 0;
  await pool.execute(
    `UPDATE system_jobs
        SET is_locked    = 0,
            locked_at    = NULL,
            locked_by    = NULL,
            last_run_at  = NOW(),
            last_run_ms  = ?,
            last_status  = ?,
            last_summary = ?,
            run_count    = run_count + 1,
            fail_count   = fail_count + ?
      WHERE job_name = ?`,
    [durationMs, status, summary.slice(0, 60_000), failInc, handle.jobName]
  );
}
