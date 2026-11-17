/**
 * Penyelesaian top-up saldo (Midtrans) — satu tempat untuk dua pemicu:
 *   1. Webhook Midtrans (/api/topup/webhook) setelah signature terverifikasi.
 *   2. Cek status ke API Midtrans (getTransactionStatus, memakai server key) saat agen
 *      membuka status top-up — cadangan bila webhook tidak sampai.
 *
 * Aman dipanggil berulang / bersamaan: baris top-up dikunci (FOR UPDATE) dan saldo hanya
 * dikredit sekali (status SUCCESS/FAILED tidak diproses ulang).
 */
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { createNotificationSafe } from "@/lib/notifications";
import { creditLoketBalance } from "@/lib/saldo-mutations";
import { getTransactionStatus, mapMidtransStatus } from "@/lib/midtrans";
import { auditLog } from "@/lib/audit-log";

/** Status yang membalik pembayaran yang sudah lunas (mis. settlement → deny untuk Permata VA). */
export const GATEWAY_REVERSAL_STATUSES = new Set(["deny", "refund", "partial_refund", "chargeback", "partial_chargeback"]);

/**
 * Pembayaran yang sudah lunas dibalik oleh gateway (deny setelah settlement, refund,
 * chargeback). Saldo TIDAK dipotong otomatis — admin & supervisor diberi peringatan untuk
 * ditinjau. Dicatat sekali per order + status (audit log) agar tidak berulang.
 */
export async function notifyGatewayReversal(opts: { kind: "topup" | "payment-link"; orderId: string; transactionStatus: string; amount: number; loketCode?: string }) {
  const marker = `${opts.orderId}:${opts.transactionStatus}`;
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM audit_logs WHERE action = 'GATEWAY_REVERSAL_ALERT' AND entity_id = ? LIMIT 1",
    [marker]
  );
  if (existing[0]) return;
  await auditLog({
    actorType: "system",
    actorUsername: "midtrans",
    action: "GATEWAY_REVERSAL_ALERT",
    entityType: opts.kind === "topup" ? "topup_request" : "payment_invoice",
    entityId: marker,
    context: opts,
  });
  const what = opts.kind === "topup" ? `Top-up ${opts.loketCode ? `loket ${opts.loketCode} ` : ""}` : "Payment link ";
  for (const role of ["admin", "supervisor"]) {
    await createNotificationSafe({
      recipientUsername: "",
      recipientRole: role,
      category: "saldo",
      severity: "error",
      title: "Pembayaran Midtrans dibalik",
      message: `${what}${opts.orderId} (Rp ${Math.round(opts.amount).toLocaleString("id-ID")}) yang sudah lunas berubah menjadi "${opts.transactionStatus}" di Midtrans. Saldo/invoice tidak diubah otomatis — mohon ditinjau.`,
      link: opts.kind === "topup" ? "/topup" : "/payment-links",
    });
  }
}

export interface GatewayResult {
  orderId: string;
  transactionStatus: string;
  fraudStatus?: string;
  grossAmount: string | number;
  paymentType?: string;
  transactionId?: string;
  payload: unknown;
  source: "webhook" | "status-check";
}

export type SettleOutcome =
  | { kind: "not_found" }
  | { kind: "amount_mismatch" }
  | { kind: "already_final"; status: string }
  | { kind: "updated"; status: string; credited: boolean };

export async function applyTopupGatewayResult(r: GatewayResult): Promise<SettleOutcome> {
  const newStatus = mapMidtransStatus(r.transactionStatus, r.fraudStatus);
  let credited: { username: string; loketCode: string; nominal: number } | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT id, loket_code, username, nominal, status FROM topup_requests WHERE gateway_order_id = ? LIMIT 1 FOR UPDATE",
      [r.orderId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return { kind: "not_found" };
    }
    const topup = rows[0];
    const nominal = Number(topup.nominal || 0);
    if (newStatus === "SUCCESS" && Math.round(Number(r.grossAmount || 0)) !== nominal) {
      await connection.rollback();
      return { kind: "amount_mismatch" };
    }
    if (topup.status === "SUCCESS" || topup.status === "FAILED") {
      await connection.rollback();
      if (topup.status === "SUCCESS" && GATEWAY_REVERSAL_STATUSES.has(r.transactionStatus)) {
        await notifyGatewayReversal({
          kind: "topup",
          orderId: r.orderId,
          transactionStatus: r.transactionStatus,
          amount: nominal,
          loketCode: String(topup.loket_code),
        });
      }
      return { kind: "already_final", status: String(topup.status) };
    }
    // Status sama dan masih menunggu → tidak ada yang berubah
    if (newStatus === topup.status) {
      await connection.rollback();
      return { kind: "updated", status: newStatus, credited: false };
    }

    const fields = ["status = ?", "payment_method = ?", "gateway_tx_id = ?", "webhook_payload = ?", "updated_at = NOW()"];
    const params: unknown[] = [newStatus, r.paymentType || null, r.transactionId || null, JSON.stringify(r.payload)];
    if (newStatus === "SUCCESS") fields.push("paid_at = NOW()");
    await connection.execute<ResultSetHeader>(
      `UPDATE topup_requests SET ${fields.join(", ")} WHERE id = ? AND status NOT IN ('SUCCESS','FAILED')`,
      [...params, topup.id]
    );

    if (newStatus === "SUCCESS") {
      const credit = await creditLoketBalance({
        connection,
        loketCode: String(topup.loket_code),
        amount: nominal,
        ledger: {
          type: "TOPUP",
          referenceType: "TOPUP_ORDER",
          referenceId: r.orderId,
          note: r.source === "webhook" ? "Top-up otomatis Midtrans" : "Top-up Midtrans (cek status)",
        },
      });
      if (!credit.ok) throw new Error("Gagal kredit saldo loket topup");

      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const saldoRequestCode = `TOPUP-AUTO-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await connection.execute<ResultSetHeader>(
        `INSERT INTO request_saldo
           (request_code, username, kode_loket, request_saldo, tgl_request, ket_request,
            is_verifikasi, verifikasi_saldo, username_verifikasi, tgl_verifikasi,
            status_verifikasi, ket_verifikasi, id_bank_tujuan, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), ?, 1, ?, 'SYSTEM', NOW(), 'APPROVED', ?, 0, NOW(), NOW())`,
        [
          saldoRequestCode,
          topup.username,
          topup.loket_code,
          nominal,
          `Top-up otomatis via Midtrans (${r.paymentType || "online"}) - Order: ${r.orderId}`,
          nominal,
          r.source === "webhook" ? "Diverifikasi otomatis oleh payment gateway" : "Diverifikasi lewat cek status ke payment gateway",
        ]
      );
      credited = { username: String(topup.username), loketCode: String(topup.loket_code), nominal };
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* abaikan */
    }
    throw error;
  } finally {
    connection.release();
  }

  if (credited) {
    await createNotificationSafe({
      recipientUsername: credited.username,
      recipientRole: null,
      category: "saldo",
      severity: "info",
      title: "Top-up Saldo Berhasil",
      message: `Top-up saldo Rp ${credited.nominal.toLocaleString("id-ID")} berhasil via ${r.paymentType || "pembayaran online"}.`,
      link: "/saldo",
    });
    console.log(`[topup/${r.source}] SUCCESS: ${r.orderId} → +${credited.nominal} for ${credited.loketCode}`);
  }
  return { kind: "updated", status: newStatus, credited: !!credited };
}

// Batasi panggilan ke API Midtrans per order (halaman status melakukan polling)
const lastSync = new Map<string, number>();
const SYNC_INTERVAL_MS = 15_000;

/**
 * Tanyakan status order ke Midtrans lalu terapkan. Dipanggil saat status top-up dibuka
 * dan masih PENDING. Gagal menghubungi Midtrans → diam (status DB tetap), dicoba lagi nanti.
 */
export async function syncTopupFromGateway(orderId: string, opts: { force?: boolean } = {}): Promise<SettleOutcome | null> {
  const now = Date.now();
  if (!opts.force && now - (lastSync.get(orderId) || 0) < SYNC_INTERVAL_MS) return null;
  lastSync.set(orderId, now);
  try {
    const st = await getTransactionStatus(orderId);
    // Midtrans menjawab HTTP 200 + status_code "404" untuk order yang belum pernah dibayar
    // (halaman Snap tidak diselesaikan) → tidak ada yang berubah.
    if (!st.transaction_status) return null;
    return await applyTopupGatewayResult({
      orderId,
      transactionStatus: st.transaction_status,
      fraudStatus: st.fraud_status,
      grossAmount: st.gross_amount,
      paymentType: st.payment_type,
      transactionId: st.transaction_id,
      payload: st,
      source: "status-check",
    });
  } catch (e) {
    // Midtrans mengembalikan 404 untuk order yang belum dibayar/dibuka — wajar
    console.warn(`[topup/status-check] ${orderId}:`, e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
}
