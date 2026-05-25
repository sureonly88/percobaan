/**
 * Auto-resolve worker untuk transaksi stale PENDING.
 *
 * Strategi (selaras dengan UX di /pending-transaksi):
 *   - Stale PENDING > N menit (default 15) di-PROMOTE menjadi PENDING_ADVICE
 *   - Status PENDING_ADVICE memungkinkan flow advice manual / advice-lunasin
 *     untuk reconcile dengan provider tanpa risiko double-charge
 *   - Setelah `maxAdviceAttempts` (default 6) percobaan, item dipindah ke
 *     FAILED otomatis (auto-reverse) supaya tidak menggantung selamanya
 *
 * Semua aksi auto dicatat di audit_logs (actorType=cron).
 */

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { auditLog } from "@/lib/audit-log";
import { logTransactionEventSafe } from "@/lib/transaction-events";

export interface AutoResolveOptions {
  /** ambang umur PENDING untuk dipromosikan ke PENDING_ADVICE (menit) */
  staleMinutes?: number;
  /** ambang umur PENDING_ADVICE sebelum dianggap gagal definitif (menit) */
  exhaustedMinutes?: number;
  /** maksimum advice_attempts sebelum auto-fail */
  maxAdviceAttempts?: number;
  /** batas item per run (defensive cap) */
  maxItems?: number;
}

export interface AutoResolveSummary {
  promoted: number;
  autoFailed: number;
  scannedStale: number;
  scannedExhausted: number;
  durationMs: number;
}

interface ItemRow extends RowDataPacket {
  id: number;
  transaction_code: string | null;
  item_code: string;
  provider: string;
  customer_id: string;
  amount: number;
  admin_fee: number;
  total: number;
  status: string;
  advice_attempts: number;
  created_at: string;
  multi_payment_id: number;
  idempotency_key: string;
  loket_code: string;
}

export async function runAutoResolvePending(
  opts: AutoResolveOptions = {}
): Promise<AutoResolveSummary> {
  const staleMinutes = Math.max(5, opts.staleMinutes ?? 15);
  const exhaustedMinutes = Math.max(staleMinutes * 2, opts.exhaustedMinutes ?? 60);
  const maxAttempts = Math.max(3, opts.maxAdviceAttempts ?? 6);
  const maxItems = Math.max(10, Math.min(1000, opts.maxItems ?? 200));
  const t0 = Date.now();

  // ─── 1. PROMOTE stale PENDING → PENDING_ADVICE ─────────────────────────────
  const [staleItems] = await pool.query<ItemRow[]>(
    `SELECT mpi.id, mpi.transaction_code, mpi.item_code, mpi.provider,
            mpi.customer_id, mpi.amount, mpi.admin_fee, mpi.total,
            mpi.status, mpi.advice_attempts, mpi.created_at,
            mpi.multi_payment_id,
            mpr.idempotency_key, mpr.loket_code
       FROM multi_payment_items mpi
       JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
      WHERE mpi.status = 'PENDING'
        AND mpi.created_at < NOW() - INTERVAL ? MINUTE
      ORDER BY mpi.created_at ASC
      LIMIT ?`,
    [staleMinutes, maxItems]
  );

  let promoted = 0;
  const trxCodesPromoted = new Set<string>();

  for (const item of staleItems) {
    if (!item.transaction_code) continue;
    if (trxCodesPromoted.has(item.transaction_code)) continue;
    trxCodesPromoted.add(item.transaction_code);

    const tglTransaksi = new Date(item.created_at).toISOString().slice(0, 10);
    const reasonMsg = `Auto-promoted ke PENDING_ADVICE oleh worker karena stale > ${staleMinutes} menit`;
    const [updRes] = await pool.execute<ResultSetHeader>(
      `UPDATE multi_payment_items
          SET status = 'PENDING_ADVICE',
              provider_error_code = 'AUTO_PROMOTED',
              provider_error_message = ?,
              metadata_json = JSON_SET(IFNULL(metadata_json, '{}'), '$.advice_tanggal', ?)
        WHERE transaction_code = ? AND status = 'PENDING'`,
      [reasonMsg, tglTransaksi, item.transaction_code]
    );
    if (updRes.affectedRows > 0) {
      promoted += updRes.affectedRows;
      await auditLog({
        actorType: "cron",
        actorUsername: "system:auto-resolve",
        action: "STALE_AUTO_PROMOTE",
        entityType: "multi_payment_item",
        entityId: item.transaction_code,
        before: { status: "PENDING", ageMinutes: ageMinutes(item.created_at) },
        after: { status: "PENDING_ADVICE", advice_tanggal: tglTransaksi },
        context: { provider: item.provider, loketCode: item.loket_code, threshold: staleMinutes },
      });
      await logTransactionEventSafe({
        idempotencyKey: item.idempotency_key,
        transactionCode: item.transaction_code,
        provider: item.provider,
        eventType: "STALE_AUTO_PROMOTED",
        severity: "WARN",
        loketCode: item.loket_code,
        custId: item.customer_id,
        message: `Auto-promoted ke PENDING_ADVICE oleh worker (stale > ${staleMinutes}m)`,
        payload: { ageMinutes: ageMinutes(item.created_at) },
      });
    }
  }

  // ─── 2. AUTO-FAIL exhausted PENDING_ADVICE ─────────────────────────────────
  const [exhausted] = await pool.query<ItemRow[]>(
    `SELECT mpi.id, mpi.transaction_code, mpi.item_code, mpi.provider,
            mpi.customer_id, mpi.amount, mpi.admin_fee, mpi.total,
            mpi.status, mpi.advice_attempts, mpi.created_at,
            mpi.multi_payment_id,
            mpr.idempotency_key, mpr.loket_code
       FROM multi_payment_items mpi
       JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
      WHERE mpi.status = 'PENDING_ADVICE'
        AND (mpi.advice_attempts >= ? OR mpi.created_at < NOW() - INTERVAL ? MINUTE)
      ORDER BY mpi.created_at ASC
      LIMIT ?`,
    [maxAttempts, exhaustedMinutes, maxItems]
  );

  let autoFailed = 0;
  const trxCodesFailed = new Set<string>();

  for (const item of exhausted) {
    if (!item.transaction_code) continue;
    if (trxCodesFailed.has(item.transaction_code)) continue;
    trxCodesFailed.add(item.transaction_code);

    const [updRes] = await pool.execute<ResultSetHeader>(
      `UPDATE multi_payment_items
          SET status = 'FAILED',
              provider_error_code = 'AUTO_REVERSED',
              provider_error_message = 'Auto-reversed: advice habis (attempts atau timeout) tanpa konfirmasi sukses dari provider',
              failed_at = NOW()
        WHERE transaction_code = ? AND status = 'PENDING_ADVICE'`,
      [item.transaction_code]
    );
    if (updRes.affectedRows > 0) {
      autoFailed += updRes.affectedRows;
      await auditLog({
        actorType: "cron",
        actorUsername: "system:auto-resolve",
        action: "ADVICE_AUTO_REVERSE",
        entityType: "multi_payment_item",
        entityId: item.transaction_code,
        before: {
          status: "PENDING_ADVICE",
          adviceAttempts: item.advice_attempts,
          ageMinutes: ageMinutes(item.created_at),
        },
        after: { status: "FAILED", reason: "AUTO_REVERSED" },
        context: {
          provider: item.provider,
          loketCode: item.loket_code,
          maxAttempts,
          exhaustedMinutes,
        },
      });
      await logTransactionEventSafe({
        idempotencyKey: item.idempotency_key,
        transactionCode: item.transaction_code,
        provider: item.provider,
        eventType: "ADVICE_AUTO_REVERSED",
        severity: "ERROR",
        loketCode: item.loket_code,
        custId: item.customer_id,
        message: `Auto-reversed setelah ${item.advice_attempts} attempts / ${ageMinutes(item.created_at)}m`,
        payload: { adviceAttempts: item.advice_attempts },
      });
    }
  }

  return {
    promoted,
    autoFailed,
    scannedStale: staleItems.length,
    scannedExhausted: exhausted.length,
    durationMs: Date.now() - t0,
  };
}

function ageMinutes(createdAt: string | Date): number {
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}
