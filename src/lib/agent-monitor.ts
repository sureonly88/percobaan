/**
 * Pantau Agen — ringkasan per agen/kasir untuk admin & supervisor (hanya baca).
 *
 * Agen = user berperan kasir (role selain admin/supervisor/switcher), status aktif.
 * "Hari ini" mengikuti CURDATE() database — sama dengan waktu yang ditulis NOW().
 * Saldo melekat ke loket (lokets.pulsa), jadi agen dalam satu loket berbagi saldo.
 */
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { REPORT_CATEGORIES } from "@/lib/transaction-reports";

import { LOW_BALANCE_THRESHOLD, ONLINE_WINDOW_MINUTES } from "@/lib/agent-monitor-shared";

export { LOW_BALANCE_THRESHOLD, ONLINE_WINDOW_MINUTES };

const PENDING = ["PENDING", "PENDING_ADVICE", "PENDING_PROVIDER"];

export type AgentFlag = "REVIEW" | "TERTAHAN" | "SALDO_RENDAH" | "LAPORAN" | "BELUM_TUTUP_KASIR";

export interface AgentSummary {
  username: string;
  name: string;
  phone: string | null;
  loketCode: string | null;
  loketName: string | null;
  loketSaldo: number;
  online: boolean;
  lastSeenAt: string | null;
  lastChannel: string | null;
  lastTransactionAt: string | null;
  /** itemCount = semua item yang dibuat hari ini (status apa pun). */
  today: { itemCount: number; successCount: number; successAmount: number; adminFee: number; failedCount: number };
  pendingCount: number;
  reviewCount: number;
  heldAmount: number;
  openReports: number;
  reportsAwaitingHandler: number;
  closingStatus: string | null;
  flags: AgentFlag[];
}

export interface AgentOverview {
  generatedAt: string;
  agents: AgentSummary[];
  totals: {
    agents: number;
    online: number;
    activeToday: number;
    successCount: number;
    successAmount: number;
    pendingCount: number;
    reviewCount: number;
    heldAmount: number;
    needAttention: number;
  };
}

const AGENT_FILTER = `LOWER(COALESCE(u.role, '')) NOT IN ('admin', 'supervisor', 'switcher')
                      AND COALESCE(u.status, 'aktif') = 'aktif'`;

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function byUser<T>(rows: RowDataPacket[], map: (r: RowDataPacket) => T): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) out.set(String(r.username), map(r));
  return out;
}

async function loadMetrics(usernames: string[]) {
  if (usernames.length === 0) {
    return {
      items: new Map<string, { tc: number; sc: number; sa: number; fee: number; fc: number; pc: number; rc: number }>(),
      lastTx: new Map<string, string | null>(),
      held: new Map<string, number>(),
      reports: new Map<string, { open: number; awaiting: number }>(),
      closing: new Map<string, string>(),
      presence: new Map<string, { seen: string | null; channel: string | null; online: boolean }>(),
    };
  }

  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.username,
            SUM(i.status = 'SUCCESS' AND COALESCE(i.paid_at, i.created_at) >= CURDATE()) AS sc,
            COALESCE(SUM(CASE WHEN i.status = 'SUCCESS' AND COALESCE(i.paid_at, i.created_at) >= CURDATE() THEN i.total END), 0) AS sa,
            COALESCE(SUM(CASE WHEN i.status = 'SUCCESS' AND COALESCE(i.paid_at, i.created_at) >= CURDATE() THEN i.admin_fee END), 0) AS fee,
            SUM(i.status = 'FAILED' AND i.created_at >= CURDATE()) AS fc,
            SUM(i.created_at >= CURDATE()) AS tc,
            SUM(i.status IN (?)) AS pc,
            SUM(i.status = 'PENDING_REVIEW') AS rc
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE r.username IN (?)
        AND (i.status IN ('PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')
             OR r.created_at >= CURDATE() - INTERVAL 1 DAY
             OR i.paid_at >= CURDATE())
      GROUP BY r.username`,
    [PENDING, usernames]
  );

  const [lastRows] = await pool.query<RowDataPacket[]>(
    `SELECT username, MAX(created_at) AS last_at FROM multi_payment_requests WHERE username IN (?) GROUP BY username`,
    [usernames]
  );

  // Saldo ditahan per agen: potongan bersih ledger dari transaksi yang belum final
  // (pola sama dengan getHeldBalances, tetapi dikelompokkan per username).
  const [heldRows] = await pool.query<RowDataPacket[]>(
    `SELECT t.username, COALESCE(SUM(t.net), 0) AS held
       FROM (
         SELECT p.username,
                -(SELECT COALESCE(SUM(l.amount), 0) FROM loket_balance_ledger l
                   WHERE l.reference_type = 'TRANSACTION' AND l.reference_id = p.transaction_code) AS net
           FROM (
             SELECT DISTINCT r.username, i.transaction_code
               FROM multi_payment_items i
               JOIN multi_payment_requests r ON r.id = i.multi_payment_id
              WHERE i.status IN ('PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')
                AND i.transaction_code IS NOT NULL
                AND r.username IN (?)
           ) p
       ) t
      WHERE t.net > 0
      GROUP BY t.username`,
    [usernames]
  );

  const [reportRows] = await pool.query<RowDataPacket[]>(
    `SELECT reported_by AS username,
            COUNT(*) AS open_cnt,
            SUM(awaiting = 'HANDLER') AS awaiting_cnt
       FROM transaction_reports
      WHERE status <> 'SELESAI' AND reported_by IN (?)
      GROUP BY reported_by`,
    [usernames]
  );

  // Tutup kasir hari ini — status terbaru per agen (tabel bisa belum ada di instalasi lama)
  const closingRows = await pool
    .query<RowDataPacket[]>(
      `SELECT c.username, c.status
         FROM cashier_closings c
         JOIN (SELECT username, MAX(id) AS id FROM cashier_closings
                WHERE business_date = CURDATE() AND username IN (?) GROUP BY username) m ON m.id = c.id`,
      [usernames]
    )
    .then(([rows]) => rows)
    .catch(() => [] as RowDataPacket[]);

  const presenceRows = await pool
    .query<RowDataPacket[]>(
      `SELECT username, last_seen_at, channel,
              last_seen_at >= NOW() - INTERVAL ? MINUTE AS is_online
         FROM user_presence WHERE username IN (?)`,
      [ONLINE_WINDOW_MINUTES, usernames]
    )
    .then(([rows]) => rows)
    .catch(() => [] as RowDataPacket[]); // migrasi user_presence belum dijalankan

  return {
    items: byUser(itemRows, (r) => ({
      tc: Number(r.tc || 0),
      sc: Number(r.sc || 0),
      sa: Number(r.sa || 0),
      fee: Number(r.fee || 0),
      fc: Number(r.fc || 0),
      pc: Number(r.pc || 0),
      rc: Number(r.rc || 0),
    })),
    lastTx: byUser(lastRows, (r) => iso(r.last_at)),
    held: byUser(heldRows, (r) => Number(r.held || 0)),
    reports: byUser(reportRows, (r) => ({ open: Number(r.open_cnt || 0), awaiting: Number(r.awaiting_cnt || 0) })),
    closing: byUser(closingRows, (r) => String(r.status || "")),
    presence: byUser(presenceRows, (r) => ({
      seen: iso(r.last_seen_at),
      channel: r.channel ? String(r.channel) : null,
      online: Number(r.is_online || 0) === 1,
    })),
  };
}

function buildSummary(u: RowDataPacket, m: Awaited<ReturnType<typeof loadMetrics>>): AgentSummary {
  const username = String(u.username);
  const it = m.items.get(username) || { tc: 0, sc: 0, sa: 0, fee: 0, fc: 0, pc: 0, rc: 0 };
  const rep = m.reports.get(username) || { open: 0, awaiting: 0 };
  const pres = m.presence.get(username);
  const closingStatus = m.closing.get(username) || null;
  const loketSaldo = Number(u.pulsa || 0);
  const heldAmount = m.held.get(username) || 0;

  const flags: AgentFlag[] = [];
  if (it.rc > 0) flags.push("REVIEW");
  if (it.pc > 0) flags.push("TERTAHAN");
  if (u.loket_code && loketSaldo < LOW_BALANCE_THRESHOLD) flags.push("SALDO_RENDAH");
  if (rep.awaiting > 0) flags.push("LAPORAN");
  // Sudah bertransaksi hari ini tetapi belum mengirim tutup kasir
  // (DRAFT = belum dikirim, REJECTED = dikembalikan verifikator)
  if (it.sc > 0 && (!closingStatus || closingStatus === "DRAFT" || closingStatus === "REJECTED")) flags.push("BELUM_TUTUP_KASIR");

  return {
    username,
    name: String(u.name || username),
    phone: u.phone ? String(u.phone) : null,
    loketCode: u.loket_code ? String(u.loket_code) : null,
    loketName: u.loket_nama ? String(u.loket_nama) : null,
    loketSaldo,
    online: Boolean(pres?.online),
    lastSeenAt: pres?.seen ?? null,
    lastChannel: pres?.channel ?? null,
    lastTransactionAt: m.lastTx.get(username) ?? null,
    today: { itemCount: it.tc, successCount: it.sc, successAmount: it.sa, adminFee: it.fee, failedCount: it.fc },
    pendingCount: it.pc,
    reviewCount: it.rc,
    heldAmount,
    openReports: rep.open,
    reportsAwaitingHandler: rep.awaiting,
    closingStatus,
    flags,
  };
}

const FLAG_WEIGHT: Record<AgentFlag, number> = {
  REVIEW: 5,
  TERTAHAN: 4,
  LAPORAN: 3,
  SALDO_RENDAH: 2,
  BELUM_TUTUP_KASIR: 1,
};

function attentionScore(a: AgentSummary): number {
  return a.flags.reduce((s, f) => s + FLAG_WEIGHT[f], 0);
}

/** Daftar semua agen aktif, yang perlu perhatian di atas, lalu yang sedang online. */
export async function getAgentOverview(): Promise<AgentOverview> {
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT u.username, u.name, u.phone, l.loket_code, l.nama AS loket_nama, l.pulsa
       FROM users u
       LEFT JOIN lokets l ON l.id = u.loket_id
      WHERE ${AGENT_FILTER}
      ORDER BY u.name ASC`
  );
  const metrics = await loadMetrics(users.map((u) => String(u.username)));
  const agents = users.map((u) => buildSummary(u, metrics));

  agents.sort(
    (a, b) =>
      attentionScore(b) - attentionScore(a) ||
      Number(b.online) - Number(a.online) ||
      (b.lastSeenAt || b.lastTransactionAt || "").localeCompare(a.lastSeenAt || a.lastTransactionAt || "") ||
      a.name.localeCompare(b.name)
  );

  const totals = agents.reduce(
    (t, a) => {
      t.online += a.online ? 1 : 0;
      t.activeToday += a.today.itemCount > 0 ? 1 : 0;
      t.successCount += a.today.successCount;
      t.successAmount += a.today.successAmount;
      t.pendingCount += a.pendingCount;
      t.reviewCount += a.reviewCount;
      t.heldAmount += a.heldAmount;
      t.needAttention += a.flags.some((f) => f === "REVIEW" || f === "TERTAHAN" || f === "LAPORAN") ? 1 : 0;
      return t;
    },
    { agents: agents.length, online: 0, activeToday: 0, successCount: 0, successAmount: 0, pendingCount: 0, reviewCount: 0, heldAmount: 0, needAttention: 0 }
  );

  return { generatedAt: new Date().toISOString(), agents, totals };
}

export interface AgentTransactionRow {
  multiPaymentCode: string;
  status: string;
  grandTotal: number;
  createdAt: string | null;
  customerName: string | null;
  customerId: string | null;
  serviceType: string | null;
  totalItems: number;
}

export interface AgentPendingItem {
  multiPaymentCode: string;
  transactionCode: string | null;
  status: string;
  customerName: string | null;
  customerId: string | null;
  serviceType: string | null;
  total: number;
  adviceAttempts: number;
  createdAt: string | null;
}

export interface AgentDetail {
  agent: AgentSummary;
  lastPath: string | null;
  pending: AgentPendingItem[];
  recent: AgentTransactionRow[];
  reports: Array<{ id: number; categoryLabel: string; status: string; awaiting: string; customerName: string | null; lastMessageAt: string | null }>;
}

/** Detail satu agen: transaksi tertahan, 20 transaksi terakhir, laporan masalah terbuka. */
export async function getAgentDetail(username: string): Promise<AgentDetail | null> {
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT u.username, u.name, u.phone, l.loket_code, l.nama AS loket_nama, l.pulsa
       FROM users u
       LEFT JOIN lokets l ON l.id = u.loket_id
      WHERE u.username = ? AND ${AGENT_FILTER}
      LIMIT 1`,
    [username]
  );
  if (!users[0]) return null;
  const metrics = await loadMetrics([username]);
  const agent = buildSummary(users[0], metrics);

  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.multi_payment_code, i.transaction_code, i.status, i.customer_name, i.customer_id,
            i.service_type, i.total, i.advice_attempts, i.created_at
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE r.username = ?
        AND i.status IN ('PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')
      ORDER BY i.created_at ASC
      LIMIT 50`,
    [username]
  );

  const [recentRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.multi_payment_code, r.status, r.grand_total, r.created_at, r.total_items,
            (SELECT i.customer_name FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id LIMIT 1) AS customer_name,
            (SELECT i.customer_id FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id LIMIT 1) AS customer_id,
            (SELECT i.service_type FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id LIMIT 1) AS service_type
       FROM multi_payment_requests r
      WHERE r.username = ?
      ORDER BY r.created_at DESC
      LIMIT 20`,
    [username]
  );

  const [reportRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, category, status, awaiting, customer_name, last_message_at
       FROM transaction_reports
      WHERE reported_by = ? AND status <> 'SELESAI'
      ORDER BY last_message_at DESC
      LIMIT 20`,
    [username]
  );

  const presence = await pool
    .query<RowDataPacket[]>("SELECT last_path FROM user_presence WHERE username = ? LIMIT 1", [username])
    .then(([rows]) => rows)
    .catch(() => [] as RowDataPacket[]);

  return {
    agent,
    lastPath: presence[0]?.last_path ? String(presence[0].last_path) : null,
    pending: pendingRows.map((r) => ({
      multiPaymentCode: String(r.multi_payment_code),
      transactionCode: r.transaction_code ? String(r.transaction_code) : null,
      status: String(r.status),
      customerName: r.customer_name ? String(r.customer_name) : null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      serviceType: r.service_type ? String(r.service_type) : null,
      total: Number(r.total || 0),
      adviceAttempts: Number(r.advice_attempts || 0),
      createdAt: iso(r.created_at),
    })),
    recent: recentRows.map((r) => ({
      multiPaymentCode: String(r.multi_payment_code),
      status: String(r.status),
      grandTotal: Number(r.grand_total || 0),
      createdAt: iso(r.created_at),
      customerName: r.customer_name ? String(r.customer_name) : null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      serviceType: r.service_type ? String(r.service_type) : null,
      totalItems: Number(r.total_items || 0),
    })),
    reports: reportRows.map((r) => ({
      id: Number(r.id),
      categoryLabel: REPORT_CATEGORIES[String(r.category) as keyof typeof REPORT_CATEGORIES] || String(r.category),
      status: String(r.status),
      awaiting: String(r.awaiting),
      customerName: r.customer_name ? String(r.customer_name) : null,
      lastMessageAt: iso(r.last_message_at),
    })),
  };
}
