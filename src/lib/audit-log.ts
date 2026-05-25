/**
 * Immutable, hash-chained audit log.
 *
 * Schema: `audit_logs` (lihat 20260525_reliability_ops.sql).
 * Triggers di DB mencegah UPDATE/DELETE — sehingga jika ada upaya tampering,
 * trigger akan menolak. Hash chain (prev_hash → hash) memberi deteksi
 * tambahan bila baris dihapus via super-user (DROP TRIGGER, dll).
 *
 * Hash dihitung sebagai SHA-256 dari:
 *   `${prev_hash ?? ""}|${canonicalJson(payload)}`
 *
 * Penulisan dilakukan dalam transaksi dengan `SELECT … FOR UPDATE` pada baris
 * id terakhir, sehingga concurrent writes tidak menghasilkan chain yang
 * bercabang.
 */

import { createHash } from "crypto";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";

export type AuditActorType = "user" | "system" | "cron";

export interface AuditLogInput {
  actorType?: AuditActorType;
  actorUsername?: string | null;
  actorRole?: string | null;
  actorIp?: string | null;
  /** action code, e.g. PAYMENT_FORCE_RESOLVE, STALE_PROMOTE, TOPUP_APPROVE */
  action: string;
  /** entity table/type, e.g. payment_request, multi_payment_item, topup_request */
  entityType: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  context?: unknown;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  // Stable stringify: keys are sorted recursively so the hash is deterministic.
  const seen = new WeakSet<object>();
  const stringify = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (seen.has(v as object)) return "null";
    seen.add(v as object);
    if (Array.isArray(v)) return `[${v.map(stringify).join(",")}]`;
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringify(obj[k])}`).join(",")}}`;
  };
  return stringify(value);
}

/**
 * Insert satu entry audit_logs. Tidak melempar exception ke caller —
 * audit log yang gagal disimpan dilaporkan via console.error tapi tidak
 * memblokir flow utama. Gunakan {@link auditLogStrict} jika butuh hard fail.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await auditLogStrict(input);
  } catch (err) {
    console.error("[audit-log] gagal menyimpan entry:", err);
  }
}

export async function auditLogStrict(input: AuditLogInput): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock baris terakhir agar chain tidak bercabang.
    const [headRows] = await conn.query<RowDataPacket[]>(
      `SELECT hash FROM audit_logs WHERE id = (SELECT MAX(id) FROM audit_logs) FOR UPDATE`
    );
    const prevHash: string | null = headRows[0]?.hash ?? null;

    const payload = {
      actorType: input.actorType ?? "user",
      actorUsername: input.actorUsername ?? null,
      actorRole: input.actorRole ?? null,
      actorIp: input.actorIp ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      before: input.before ?? null,
      after: input.after ?? null,
      context: input.context ?? null,
    };

    const hash = createHash("sha256")
      .update(`${prevHash ?? ""}|${canonicalJson(payload)}`)
      .digest("hex");

    await conn.execute(
      `INSERT INTO audit_logs (
         actor_type, actor_username, actor_role, actor_ip,
         action, entity_type, entity_id,
         before_json, after_json, context_json,
         prev_hash, hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.actorType,
        payload.actorUsername,
        payload.actorRole,
        payload.actorIp,
        payload.action,
        payload.entityType,
        payload.entityId,
        payload.before === null ? null : JSON.stringify(payload.before),
        payload.after === null ? null : JSON.stringify(payload.after),
        payload.context === null ? null : JSON.stringify(payload.context),
        prevHash,
        hash,
      ]
    );

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Verifikasi integritas chain. Mengembalikan baris pertama yang hash-nya
 * tidak cocok (atau null jika semua OK).
 */
export async function verifyAuditChain(limit = 10_000): Promise<{
  ok: boolean;
  brokenAtId: number | null;
  checked: number;
}> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, actor_type, actor_username, actor_role, actor_ip,
            action, entity_type, entity_id,
            before_json, after_json, context_json, prev_hash, hash
       FROM audit_logs
       ORDER BY id ASC
       LIMIT ?`,
    [limit]
  );

  let prev: string | null = null;
  for (const r of rows) {
    const payload = {
      actorType: r.actor_type,
      actorUsername: r.actor_username,
      actorRole: r.actor_role,
      actorIp: r.actor_ip,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      before: r.before_json ? JSON.parse(typeof r.before_json === "string" ? r.before_json : JSON.stringify(r.before_json)) : null,
      after: r.after_json ? JSON.parse(typeof r.after_json === "string" ? r.after_json : JSON.stringify(r.after_json)) : null,
      context: r.context_json ? JSON.parse(typeof r.context_json === "string" ? r.context_json : JSON.stringify(r.context_json)) : null,
    };
    const expected = createHash("sha256")
      .update(`${prev ?? ""}|${canonicalJson(payload)}`)
      .digest("hex");
    if (expected !== r.hash || (r.prev_hash ?? null) !== prev) {
      return { ok: false, brokenAtId: Number(r.id), checked: rows.length };
    }
    prev = r.hash;
  }
  return { ok: true, brokenAtId: null, checked: rows.length };
}
