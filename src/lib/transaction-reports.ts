/**
 * Laporan masalah per transaksi (agen/kasir ↔ admin/supervisor).
 *
 * - Pelapor (kasir/agen) hanya bisa melapor transaksi loketnya sendiri dan hanya melihat /
 *   membalas laporannya sendiri.
 * - Penangan (admin/supervisor) melihat semua laporan, membalas, mengambil, menyelesaikan,
 *   dan membuka kembali.
 * - `awaiting` menunjukkan siapa yang perlu menanggapi berikutnya → dasar badge & notifikasi.
 * - Laporan tidak mengubah transaksi apa pun; tindakan (advice, review, pembatalan) tetap
 *   lewat alur masing-masing yang memiliki maker-checker sendiri.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { auditLog } from "@/lib/audit-log";
import { createNotificationSafe } from "@/lib/notifications";
import { normalizeRole } from "@/lib/rbac";

export const REPORT_CATEGORIES = {
  BELUM_MASUK: "Pembayaran/token belum masuk menurut pelanggan",
  STATUS_LAMA: "Status lama \"Diproses\"",
  SALAH_INPUT: "Salah ID atau nominal (minta pembatalan)",
  BAYAR_DOBEL: "Pelanggan terbayar dua kali",
  STRUK: "Masalah struk / token",
  LAINNYA: "Lainnya",
} as const;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;

export type ReportStatus = "BARU" | "DIPROSES" | "SELESAI";

export class ReportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface Actor {
  username: string;
  role: string;
  loketCode: string | null;
}

const isHandler = (a: Actor) => ["admin", "supervisor"].includes(normalizeRole(a.role));

interface ReportRow extends RowDataPacket {
  id: number;
  multi_payment_code: string;
  transaction_code: string | null;
  loket_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  service_type: string | null;
  total_amount: string;
  category: string;
  status: ReportStatus;
  awaiting: "HANDLER" | "REPORTER" | "NONE";
  reported_by: string;
  assigned_to: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  last_message_at: string;
  created_at: string;
}

function mapReport(r: ReportRow) {
  return {
    id: Number(r.id),
    multiPaymentCode: r.multi_payment_code,
    transactionCode: r.transaction_code,
    loketCode: r.loket_code,
    customerId: r.customer_id,
    customerName: r.customer_name,
    serviceType: r.service_type,
    totalAmount: Number(r.total_amount || 0),
    category: r.category,
    categoryLabel: REPORT_CATEGORIES[r.category as ReportCategory] || r.category,
    status: r.status,
    awaiting: r.awaiting,
    reportedBy: r.reported_by,
    assignedTo: r.assigned_to,
    resolution: r.resolution,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  };
}
export type TransactionReport = ReturnType<typeof mapReport>;

const cleanBody = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Notifikasi khusus peran admin & supervisor (recipient_username kosong agar tidak jadi siaran). */
async function notifyHandlers(title: string, message: string, link: string) {
  for (const role of ["admin", "supervisor"]) {
    await createNotificationSafe({ recipientUsername: "", recipientRole: role, category: "transaksi", severity: "warning", title, message, link });
  }
}
async function notifyUser(username: string, title: string, message: string, link: string) {
  await createNotificationSafe({ recipientUsername: username, recipientRole: null, category: "transaksi", severity: "info", title, message, link });
}

async function addMessage(reportId: number, actor: Actor, body: string, kind: "MESSAGE" | "EVENT" = "MESSAGE") {
  await pool.execute(
    "INSERT INTO transaction_report_messages (report_id, author, author_role, kind, body) VALUES (?, ?, ?, ?, ?)",
    [reportId, actor.username, normalizeRole(actor.role), kind, body]
  );
}

async function loadReport(id: number): Promise<ReportRow> {
  const [rows] = await pool.query<ReportRow[]>("SELECT * FROM transaction_reports WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) throw new ReportError("Laporan tidak ditemukan", 404);
  return rows[0];
}

function assertCanSee(actor: Actor, r: ReportRow) {
  if (isHandler(actor)) return;
  // Pelapor hanya laporannya sendiri; 404 agar ID laporan lain tidak bisa ditebak
  if (r.reported_by !== actor.username) throw new ReportError("Laporan tidak ditemukan", 404);
}

/** Buat laporan baru. Bila sudah ada laporan terbuka untuk transaksi yang sama, kembalikan itu. */
export async function createReport(actor: Actor, input: { multiPaymentCode: unknown; category: unknown; message: unknown }) {
  const code = typeof input.multiPaymentCode === "string" ? input.multiPaymentCode.trim() : "";
  const category = String(input.category || "") as ReportCategory;
  const message = cleanBody(input.message);
  if (!code) throw new ReportError("Transaksi wajib dipilih");
  if (!(category in REPORT_CATEGORIES)) throw new ReportError("Kategori tidak valid");
  if (message.length < 10) throw new ReportError("Jelaskan masalahnya (minimal 10 karakter)");

  const [reqRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.multi_payment_code, r.loket_code, r.grand_total,
            i.transaction_code, i.customer_id, i.customer_name, i.service_type
       FROM multi_payment_requests r
       LEFT JOIN multi_payment_items i ON i.id = (SELECT MIN(x.id) FROM multi_payment_items x WHERE x.multi_payment_id = r.id)
      WHERE r.multi_payment_code = ? LIMIT 1`,
    [code]
  );
  const tx = reqRows[0];
  if (!tx || (!isHandler(actor) && (!actor.loketCode || tx.loket_code !== actor.loketCode))) {
    throw new ReportError("Transaksi tidak ditemukan", 404);
  }

  const [open] = await pool.query<ReportRow[]>(
    "SELECT * FROM transaction_reports WHERE multi_payment_code = ? AND status <> 'SELESAI' ORDER BY id DESC LIMIT 1",
    [code]
  );
  if (open[0]) {
    // Tambahkan sebagai pesan pada laporan yang sudah ada (bila pelapor yang sama / penangan)
    const r = open[0];
    if (!isHandler(actor) && r.reported_by !== actor.username) {
      throw new ReportError("Transaksi ini sudah dilaporkan petugas lain dan sedang ditangani admin", 409);
    }
    await replyReport(actor, Number(r.id), message);
    return { report: mapReport(await loadReport(Number(r.id))), existing: true };
  }

  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO transaction_reports
       (multi_payment_code, transaction_code, loket_code, customer_id, customer_name, service_type, total_amount, category, reported_by, awaiting)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'HANDLER')`,
    [code, tx.transaction_code ?? null, tx.loket_code ?? null, tx.customer_id ?? null, tx.customer_name ?? null, tx.service_type ?? null, Number(tx.grand_total || 0), category, actor.username]
  );
  const id = Number(res.insertId);
  await addMessage(id, actor, message);
  await auditLog({
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "TRANSACTION_REPORT_CREATE",
    entityType: "transaction_report",
    entityId: id,
    after: { multiPaymentCode: code, category },
  });
  await notifyHandlers(
    "Laporan masalah baru",
    `${actor.username} melaporkan ${REPORT_CATEGORIES[category]} untuk ${tx.customer_id || code}`,
    `/m/masalah/${id}`
  );
  return { report: mapReport(await loadReport(id)), existing: false };
}

export async function listReports(actor: Actor, opts: { status?: string | null; scope?: string | null }) {
  const where: string[] = [];
  const params: Array<string> = [];
  if (!isHandler(actor) || opts.scope === "mine") {
    where.push("reported_by = ?");
    params.push(actor.username);
  }
  if (opts.status === "OPEN") where.push("status <> 'SELESAI'");
  else if (opts.status && ["BARU", "DIPROSES", "SELESAI"].includes(opts.status)) {
    where.push("status = ?");
    params.push(opts.status);
  }
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT * FROM transaction_reports ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY (status = 'SELESAI') ASC, last_message_at DESC LIMIT 100`,
    params
  );
  return rows.map(mapReport);
}

/** Jumlah laporan yang menunggu tanggapan pengguna ini. */
export async function countAwaiting(actor: Actor) {
  const [rows] = isHandler(actor)
    ? await pool.query<RowDataPacket[]>("SELECT COUNT(*) n FROM transaction_reports WHERE status <> 'SELESAI' AND awaiting = 'HANDLER'")
    : await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) n FROM transaction_reports WHERE reported_by = ? AND awaiting = 'REPORTER'",
        [actor.username]
      );
  return Number(rows[0]?.n || 0);
}

export async function getReport(actor: Actor, id: number) {
  const r = await loadReport(id);
  assertCanSee(actor, r);
  const [msgs] = await pool.query<RowDataPacket[]>(
    "SELECT id, author, author_role, kind, body, created_at FROM transaction_report_messages WHERE report_id = ? ORDER BY id ASC",
    [id]
  );
  // Pelapor membuka laporan yang sudah dijawab → tidak perlu badge lagi
  if (!isHandler(actor) && r.awaiting === "REPORTER") {
    await pool.execute("UPDATE transaction_reports SET awaiting = 'NONE' WHERE id = ? AND awaiting = 'REPORTER'", [id]);
  }
  return {
    report: mapReport(r),
    messages: msgs.map((m) => ({
      id: Number(m.id),
      author: String(m.author),
      authorRole: String(m.author_role),
      kind: String(m.kind),
      body: String(m.body),
      createdAt: m.created_at,
    })),
    canHandle: isHandler(actor),
  };
}

export async function replyReport(actor: Actor, id: number, rawBody: unknown) {
  const body = cleanBody(rawBody);
  if (!body) throw new ReportError("Pesan tidak boleh kosong");
  const r = await loadReport(id);
  assertCanSee(actor, r);
  const handler = isHandler(actor) && actor.username !== r.reported_by;
  await addMessage(id, actor, body);

  if (handler) {
    // Penangan membalas: otomatis diambil bila belum ada penanggung jawab
    await pool.execute(
      `UPDATE transaction_reports
          SET awaiting = IF(status = 'SELESAI', awaiting, 'REPORTER'),
              status = IF(status = 'BARU', 'DIPROSES', status),
              assigned_to = COALESCE(assigned_to, ?),
              last_message_at = NOW()
        WHERE id = ?`,
      [actor.username, id]
    );
    await notifyUser(r.reported_by, "Laporan Anda dibalas", `${actor.username}: ${body.slice(0, 120)}`, `/m/masalah/${id}`);
  } else {
    // Pelapor membalas: laporan yang sudah selesai dibuka kembali
    const reopened = r.status === "SELESAI";
    await pool.execute(
      `UPDATE transaction_reports
          SET awaiting = 'HANDLER',
              status = IF(status = 'SELESAI', 'DIPROSES', status),
              resolved_at = IF(status = 'SELESAI', NULL, resolved_at),
              last_message_at = NOW()
        WHERE id = ?`,
      [id]
    );
    if (reopened) await addMessage(id, actor, "Laporan dibuka kembali oleh pelapor", "EVENT");
    if (r.assigned_to) await notifyUser(r.assigned_to, "Balasan laporan masalah", `${actor.username}: ${body.slice(0, 120)}`, `/m/masalah/${id}`);
    else await notifyHandlers("Balasan laporan masalah", `${actor.username}: ${body.slice(0, 120)}`, `/m/masalah/${id}`);
  }
}

export async function takeReport(actor: Actor, id: number) {
  if (!isHandler(actor)) throw new ReportError("Hanya admin/supervisor yang dapat menangani laporan", 403);
  const r = await loadReport(id);
  if (r.status === "SELESAI") throw new ReportError("Laporan sudah selesai", 409);
  await pool.execute("UPDATE transaction_reports SET assigned_to = ?, status = 'DIPROSES' WHERE id = ?", [actor.username, id]);
  await addMessage(id, actor, `Laporan ditangani oleh ${actor.username}`, "EVENT");
}

export async function resolveReport(actor: Actor, id: number, rawResolution: unknown) {
  if (!isHandler(actor)) throw new ReportError("Hanya admin/supervisor yang dapat menyelesaikan laporan", 403);
  const resolution = cleanBody(rawResolution, 500);
  if (resolution.length < 5) throw new ReportError("Tuliskan kesimpulan penyelesaian (minimal 5 karakter)");
  const r = await loadReport(id);
  if (r.status === "SELESAI") throw new ReportError("Laporan sudah selesai", 409);
  await pool.execute(
    `UPDATE transaction_reports
        SET status = 'SELESAI', awaiting = 'REPORTER', resolution = ?, resolved_by = ?, resolved_at = NOW(),
            assigned_to = COALESCE(assigned_to, ?), last_message_at = NOW()
      WHERE id = ?`,
    [resolution, actor.username, actor.username, id]
  );
  await addMessage(id, actor, `Diselesaikan: ${resolution}`, "EVENT");
  await auditLog({
    actorUsername: actor.username,
    actorRole: actor.role,
    action: "TRANSACTION_REPORT_RESOLVE",
    entityType: "transaction_report",
    entityId: id,
    before: { status: r.status },
    after: { status: "SELESAI", resolution },
  });
  await notifyUser(r.reported_by, "Laporan Anda selesai", resolution.slice(0, 140), `/m/masalah/${id}`);
}
