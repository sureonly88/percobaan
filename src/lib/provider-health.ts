/**
 * Provider health tracking.
 *
 * Sumber data:
 *  - State circuit-breaker → dari memori (circuit-breaker.ts), di-sync ke
 *    tabel `provider_health` setiap rollup.
 *  - Success / failure 24h → diagregasi dari `transaction_events`
 *    (PAYMENT_PROVIDER_SUCCESS / PAYMENT_PROVIDER_FAILED) supaya tidak
 *    perlu instrumentasi tambahan di pdam-api / lunasin-api.
 *  - Avg/p95 latency 24h → dari `payment_requests` (TIMESTAMPDIFF
 *    created_at → updated_at) untuk request final, per provider.
 *
 * Sample raw masih bisa dimasukkan via {@link recordProviderCall} untuk
 * presisi lebih tinggi — pipeline rollup TIDAK bergantung padanya.
 */

import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import {
  recordFailure,
  recordSuccess,
  getCircuitStatus,
} from "@/lib/circuit-breaker";

const KNOWN_PROVIDERS = ["PDAM", "LUNASIN"];

export interface ProviderSampleInput {
  provider: string;
  operation: string;            // inquiry | payment | advice
  success: boolean;
  latencyMs: number;
  errorCode?: string | null;
}

/** Opsional: persist sample raw (fire-and-forget). */
export function recordProviderCall(s: ProviderSampleInput): void {
  if (s.success) recordSuccess(s.provider);
  else recordFailure(s.provider);

  pool
    .execute(
      `INSERT INTO provider_health_samples
         (provider_name, operation, success, latency_ms, error_code)
       VALUES (?, ?, ?, ?, ?)`,
      [
        s.provider,
        s.operation.slice(0, 64),
        s.success ? 1 : 0,
        Math.max(0, Math.min(2_147_483_647, Math.floor(s.latencyMs))),
        s.errorCode ?? null,
      ]
    )
    .catch(() => {});
}

async function syncCircuitState(provider: string): Promise<void> {
  const status = getCircuitStatus(provider);
  await pool.execute(
    `INSERT INTO provider_health (provider_name, state, failure_count, last_failure_at, opened_at)
       VALUES (?, ?, ?,
               CASE WHEN ? > 0 THEN FROM_UNIXTIME(? / 1000) ELSE NULL END,
               CASE WHEN ? = 'OPEN' THEN NOW() ELSE NULL END)
     ON DUPLICATE KEY UPDATE
       state           = VALUES(state),
       failure_count   = VALUES(failure_count),
       last_failure_at = COALESCE(VALUES(last_failure_at), last_failure_at),
       opened_at = CASE
         WHEN VALUES(state) = 'OPEN' AND opened_at IS NULL THEN NOW()
         WHEN VALUES(state) = 'CLOSED' THEN NULL
         ELSE opened_at
       END`,
    [
      provider,
      status.state,
      status.failureCount,
      status.lastFailureAt,
      status.lastFailureAt,
      status.state,
    ]
  );
}

export interface ProviderHealthSnapshot {
  providerName: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
  success24h: number;
  failure24h: number;
  total24h: number;
  successRate24h: number;
  avgLatencyMs24h: number;
  p95LatencyMs24h: number;
  rollupUpdatedAt: string | null;
}

export async function getProviderHealthSnapshot(): Promise<ProviderHealthSnapshot[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT provider_name, state, failure_count,
            last_failure_at, last_success_at, opened_at,
            success_24h, failure_24h,
            avg_latency_ms_24h, p95_latency_ms_24h, rollup_updated_at
       FROM provider_health
       ORDER BY provider_name ASC`
  );
  return rows.map((r) => {
    const success = Number(r.success_24h);
    const failure = Number(r.failure_24h);
    const total = success + failure;
    return {
      providerName: String(r.provider_name),
      state: r.state as ProviderHealthSnapshot["state"],
      failureCount: Number(r.failure_count),
      lastFailureAt: r.last_failure_at ? new Date(r.last_failure_at).toISOString() : null,
      lastSuccessAt: r.last_success_at ? new Date(r.last_success_at).toISOString() : null,
      openedAt: r.opened_at ? new Date(r.opened_at).toISOString() : null,
      success24h: success,
      failure24h: failure,
      total24h: total,
      successRate24h: total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0,
      avgLatencyMs24h: Number(r.avg_latency_ms_24h),
      p95LatencyMs24h: Number(r.p95_latency_ms_24h),
      rollupUpdatedAt: r.rollup_updated_at ? new Date(r.rollup_updated_at).toISOString() : null,
    };
  });
}

export interface RollupSummary {
  providers: number;
  totalEvents: number;
  purged: number;
}

export async function rollupProviderHealth(): Promise<RollupSummary> {
  // 1. success/failure dari transaction_events
  const [eventRows] = await pool.query<RowDataPacket[]>(
    `SELECT provider,
            SUM(event_type = 'PAYMENT_PROVIDER_SUCCESS') AS success_count,
            SUM(event_type = 'PAYMENT_PROVIDER_FAILED')  AS failure_count,
            MAX(CASE WHEN event_type = 'PAYMENT_PROVIDER_SUCCESS' THEN created_at END) AS last_success,
            MAX(CASE WHEN event_type = 'PAYMENT_PROVIDER_FAILED'  THEN created_at END) AS last_failure
       FROM transaction_events
      WHERE event_type IN ('PAYMENT_PROVIDER_SUCCESS', 'PAYMENT_PROVIDER_FAILED')
        AND created_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY provider`
  );

  const providerMap = new Map<string, {
    success: number;
    failure: number;
    lastSuccess: Date | null;
    lastFailure: Date | null;
  }>();
  for (const p of KNOWN_PROVIDERS) {
    providerMap.set(p, { success: 0, failure: 0, lastSuccess: null, lastFailure: null });
  }
  for (const r of eventRows) {
    providerMap.set(String(r.provider), {
      success: Number(r.success_count),
      failure: Number(r.failure_count),
      lastSuccess: r.last_success ? new Date(r.last_success) : null,
      lastFailure: r.last_failure ? new Date(r.last_failure) : null,
    });
  }

  // 2. avg latency dari payment_requests
  const [latencyRows] = await pool.query<RowDataPacket[]>(
    `SELECT provider,
            COALESCE(ROUND(AVG(TIMESTAMPDIFF(MICROSECOND, created_at, updated_at) / 1000)), 0) AS avg_latency
       FROM payment_requests
      WHERE status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')
        AND updated_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY provider`
  );
  const latencyMap = new Map<string, number>();
  for (const r of latencyRows) latencyMap.set(String(r.provider), Number(r.avg_latency));

  // 3. p95 latency
  const p95Map = new Map<string, number>();
  for (const p of Array.from(providerMap.keys())) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TIMESTAMPDIFF(MICROSECOND, created_at, updated_at) / 1000 AS lat
         FROM payment_requests
        WHERE provider = ?
          AND status IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')
          AND updated_at >= NOW() - INTERVAL 24 HOUR
        ORDER BY lat ASC`,
      [p]
    );
    const latencies = rows.map((r) => Number(r.lat)).filter((n) => Number.isFinite(n) && n >= 0);
    p95Map.set(
      p,
      latencies.length
        ? Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))])
        : 0
    );
  }

  // 4. write rollup
  let totalEvents = 0;
  for (const [name, stats] of Array.from(providerMap.entries())) {
    const avg = latencyMap.get(name) ?? 0;
    const p95 = p95Map.get(name) ?? 0;
    totalEvents += stats.success + stats.failure;

    await pool.execute(
      `INSERT INTO provider_health
         (provider_name, success_24h, failure_24h,
          avg_latency_ms_24h, p95_latency_ms_24h,
          last_success_at, last_failure_at, rollup_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         success_24h        = VALUES(success_24h),
         failure_24h        = VALUES(failure_24h),
         avg_latency_ms_24h = VALUES(avg_latency_ms_24h),
         p95_latency_ms_24h = VALUES(p95_latency_ms_24h),
         last_success_at    = COALESCE(VALUES(last_success_at), last_success_at),
         last_failure_at    = COALESCE(VALUES(last_failure_at), last_failure_at),
         rollup_updated_at  = VALUES(rollup_updated_at)`,
      [name, stats.success, stats.failure, avg, p95, stats.lastSuccess, stats.lastFailure]
    );

    await syncCircuitState(name);
  }

  // 5. purge samples raw lama
  const [purgeResult] = await pool.query(
    `DELETE FROM provider_health_samples WHERE created_at < NOW() - INTERVAL 7 DAY`
  );
  const purged = (purgeResult as unknown as { affectedRows?: number }).affectedRows ?? 0;

  return { providers: providerMap.size, totalEvents, purged };
}
