/**
 * Kehadiran pengguna ("terakhir aktif") untuk Pantau Agen.
 * Dicatat dari AppShell lewat POST /api/presence saat halaman aplikasi terbuka.
 * Bukan pelacakan lokasi — hanya waktu, kanal (mobile/web) dan halaman terakhir.
 */
import pool from "@/lib/db";

const MIN_INTERVAL_MS = 60_000;
const lastWrite = new Map<string, number>();

export type PresenceChannel = "mobile" | "web";

/** Upsert waktu terakhir aktif. Dibatasi sekali per menit per pengguna (per proses server). */
export async function touchPresence(opts: {
  username: string;
  channel: PresenceChannel;
  path?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  const username = opts.username.trim();
  if (!username || username === "SYSTEM") return false;
  const now = Date.now();
  if (now - (lastWrite.get(username) || 0) < MIN_INTERVAL_MS) return false;
  lastWrite.set(username, now);
  await pool.execute(
    `INSERT INTO user_presence (username, last_seen_at, channel, last_path, user_agent)
     VALUES (?, NOW(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_at = NOW(), channel = VALUES(channel),
       last_path = VALUES(last_path), user_agent = VALUES(user_agent)`,
    [
      username,
      opts.channel,
      opts.path ? String(opts.path).slice(0, 255) : null,
      opts.userAgent ? String(opts.userAgent).slice(0, 255) : null,
    ]
  );
  return true;
}
