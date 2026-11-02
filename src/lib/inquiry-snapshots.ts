import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

/**
 * Snapshot hasil inquiry provider, disimpan server-side saat inquiry dan
 * dibaca kembali saat pay. Endpoint pay WAJIB memakai nominal dari snapshot
 * ini — nominal dari body request client tidak boleh dipercaya.
 *
 *   PDAM    : refKey = thbln
 *   LUNASIN : refKey = idTrx
 */
export type InquiryProvider = "PDAM" | "LUNASIN";

export interface InquirySnapshot {
  customerId: string;
  refKey: string;
  amount: number;
  adminFee: number;
  total: number;
  payload: Record<string, unknown> | null;
}

const TTL_MINUTES = Math.max(5, Number(process.env.INQUIRY_SNAPSHOT_TTL_MINUTES || 60));

export function snapshotKey(customerId: string, refKey: string) {
  return `${customerId}|${refKey}`;
}

export async function saveInquirySnapshots(
  provider: InquiryProvider,
  username: string,
  snapshots: InquirySnapshot[]
) {
  if (!username || snapshots.length === 0) return;

  const placeholders = snapshots
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))")
    .join(", ");
  const params = snapshots.flatMap((s) => [
    provider,
    username,
    s.customerId,
    s.refKey,
    Math.round(s.amount),
    Math.round(s.adminFee),
    Math.round(s.total),
    s.payload ? JSON.stringify(s.payload) : null,
    TTL_MINUTES,
  ]);

  await pool.execute(
    `INSERT INTO inquiry_snapshots
       (provider, username, customer_id, ref_key, amount, admin_fee, total, payload_json, created_at, expires_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       admin_fee = VALUES(admin_fee),
       total = VALUES(total),
       payload_json = VALUES(payload_json),
       created_at = VALUES(created_at),
       expires_at = VALUES(expires_at)`,
    params
  );

  // Bersihkan snapshot kedaluwarsa secara oportunistik (best-effort)
  pool
    .execute("DELETE FROM inquiry_snapshots WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 500")
    .catch(() => {});
}

/**
 * Ambil snapshot yang masih berlaku.
 * - refs berisi customerId → cocokkan (customerId, refKey); hasil di-key snapshotKey(customerId, refKey).
 * - refs tanpa customerId (mis. Lunasin, idTrx sudah unik) → cocokkan refKey saja; hasil di-key refKey.
 */
export async function loadInquirySnapshots(
  provider: InquiryProvider,
  username: string,
  refs: Array<{ customerId?: string; refKey: string }>
): Promise<Map<string, InquirySnapshot>> {
  const result = new Map<string, InquirySnapshot>();
  if (!username || refs.length === 0) return result;

  const byRefOnly = refs.every((r) => r.customerId == null);
  const where = byRefOnly
    ? `ref_key IN (${refs.map(() => "?").join(", ")})`
    : refs.map(() => "(customer_id = ? AND ref_key = ?)").join(" OR ");
  const whereParams = byRefOnly
    ? refs.map((r) => r.refKey)
    : refs.flatMap((r) => [r.customerId ?? "", r.refKey]);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT customer_id, ref_key, amount, admin_fee, total, CAST(payload_json AS CHAR) AS payload_json
       FROM inquiry_snapshots
      WHERE provider = ? AND username = ? AND expires_at > NOW() AND (${where})`,
    [provider, username, ...whereParams]
  );

  for (const row of rows) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = row.payload_json ? JSON.parse(String(row.payload_json)) : null;
    } catch {
      payload = null;
    }
    const key = byRefOnly ? String(row.ref_key) : snapshotKey(String(row.customer_id), String(row.ref_key));
    result.set(key, {
      customerId: String(row.customer_id),
      refKey: String(row.ref_key),
      amount: Number(row.amount || 0),
      adminFee: Number(row.admin_fee || 0),
      total: Number(row.total || 0),
      payload,
    });
  }
  return result;
}

/** Hapus snapshot setelah tagihan berhasil dibayar agar tidak bisa dipakai ulang. Best-effort. */
export async function consumeInquirySnapshots(
  provider: InquiryProvider,
  username: string,
  refs: Array<{ customerId?: string; refKey: string }>
) {
  if (!username || refs.length === 0) return;
  try {
    const where = refs
      .map((r) => (r.customerId == null ? "(ref_key = ?)" : "(customer_id = ? AND ref_key = ?)"))
      .join(" OR ");
    const params = refs.flatMap((r) => (r.customerId == null ? [r.refKey] : [r.customerId, r.refKey]));
    await pool.execute(
      `DELETE FROM inquiry_snapshots WHERE provider = ? AND username = ? AND (${where})`,
      [provider, username, ...params]
    );
  } catch {
    // non-critical — snapshot tetap kedaluwarsa sesuai TTL
  }
}
