/**
 * Aturan siapa melihat notifikasi & status "sudah dibaca" per user — dipakai API notifikasi
 * desktop (/api/notifications) dan mobile lama (/api/auth/mobile/notifications).
 *
 * Visibilitas: notifikasi pribadi (recipient_username = saya), siaran ('*' TANPA peran
 * tujuan), atau per peran (recipient_role = peran saya).
 *
 * Status baca: tabel notification_reads (per user). Kolom lama notifications.is_read tetap
 * dihormati untuk data sebelum tabel itu ada; status baru tidak lagi menulis ke kolom itu.
 */
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";

/** Alias tabel notifikasi: `n`. Parameter: [username, role]. */
export const NOTIF_VISIBLE_SQL =
  "(n.recipient_username = ? OR (n.recipient_username = '*' AND n.recipient_role IS NULL) OR n.recipient_role = ?)";

/** LEFT JOIN status baca milik user. Parameter: [username] — letakkan SEBELUM parameter WHERE. */
export const NOTIF_READ_JOIN_SQL = "LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.username = ?";

/** Ekspresi boolean "sudah dibaca oleh user ini" (butuh NOTIF_READ_JOIN_SQL). */
export const NOTIF_IS_READ_SQL = "(n.is_read = 1 OR nr.notification_id IS NOT NULL)";

/** Ekspresi waktu dibaca oleh user ini. */
export const NOTIF_READ_AT_SQL = "COALESCE(nr.read_at, n.read_at)";

/**
 * Tandai dibaca untuk user ini saja. `ids` null = semua yang terlihat dan belum dibaca.
 * Hanya notifikasi yang memang ditujukan ke user/peran ini yang bisa ditandai.
 */
export async function markNotificationsRead(username: string, role: string, ids: number[] | null): Promise<number> {
  const idFilter = ids && ids.length > 0 ? `AND n.id IN (${ids.map(() => "?").join(",")})` : "";
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO notification_reads (notification_id, username, read_at)
     SELECT n.id, ?, NOW()
       FROM notifications n
       ${NOTIF_READ_JOIN_SQL}
      WHERE ${NOTIF_VISIBLE_SQL}
        AND NOT ${NOTIF_IS_READ_SQL}
        ${idFilter}`,
    [username, username, username, role, ...(ids || [])]
  );
  return res.affectedRows;
}
