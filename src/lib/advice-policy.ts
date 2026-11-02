import type { ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/db";
import { auditLog } from "@/lib/audit-log";

/**
 * Kebijakan advice bersama untuk PDAM, Lunasin, dan job auto-resolve.
 *
 * Setelah MAX_ADVICE_ATTEMPTS kali advice tanpa jawaban pasti dari provider, transaksi
 * langsung dipindah ke PENDING_REVIEW (antrean Review Transaksi) — saldo tetap ditahan.
 * Dari status review, admin masih boleh "Cek Ulang Advice" tanpa terkena batas ini.
 */
export const MAX_ADVICE_ATTEMPTS = Math.max(1, Math.floor(Number(process.env.ADVICE_MAX_ATTEMPTS || 3)) || 3);

/**
 * Pindahkan item PENDING_ADVICE yang sudah mencapai batas advice ke PENDING_REVIEW.
 * Mengembalikan jumlah item yang dipindah (0 bila belum mencapai batas).
 */
export async function sendToReviewIfAdviceExhausted(
  transactionCode: string,
  opts: { actor?: string | null; provider?: string | null } = {}
): Promise<number> {
  if (!transactionCode) return 0;
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE multi_payment_items
        SET status = 'PENDING_REVIEW',
            provider_error_code = 'ADVICE_EXHAUSTED',
            provider_error_message = ?
      WHERE transaction_code = ?
        AND status = 'PENDING_ADVICE'
        AND COALESCE(advice_attempts, 0) >= ?`,
    [
      `Advice ${MAX_ADVICE_ATTEMPTS}x tanpa konfirmasi dari provider — menunggu review admin`,
      transactionCode,
      MAX_ADVICE_ATTEMPTS,
    ]
  );
  const moved = Number(res.affectedRows || 0);
  if (moved > 0) {
    await auditLog({
      actorUsername: opts.actor ?? "system",
      action: "ADVICE_SENT_TO_REVIEW",
      entityType: "multi_payment_item",
      entityId: transactionCode,
      before: { status: "PENDING_ADVICE" },
      after: { status: "PENDING_REVIEW", reason: "ADVICE_LIMIT_REACHED", maxAdviceAttempts: MAX_ADVICE_ATTEMPTS },
      context: { provider: opts.provider ?? null, items: moved },
    });
  }
  return moved;
}
