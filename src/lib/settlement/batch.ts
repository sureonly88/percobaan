import pool from "@/lib/db";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { postSettlementApproval } from "@/lib/gl/posting-rules";

export type BatchStatus = "DRAFT" | "APPROVED" | "PAID" | "VOID";

export interface SettlementBatchRow {
  id: number;
  batchCode: string;
  batchDate: string;
  loketCode: string;
  loketName: string | null;
  status: BatchStatus;
  transactionCount: number;
  totalGross: number;
  totalAdminFee: number;
  totalProviderAmt: number;
  netPayable: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  paidReference: string | null;
  glEntryId: number | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateOnly(d: Date | string): string {
  const dd = typeof d === "string" ? new Date(d) : d;
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
}

function generateBatchCode(date: string, loketCode: string): string {
  const safe = loketCode.replace(/[^A-Za-z0-9]/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `STL-${date.replace(/-/g, "")}-${safe}-${rand}`;
}

/**
 * Cari semua transaksi pembayaran SUKSES untuk tanggal X yang belum masuk batch manapun.
 */
async function findEligibleTransactions(opts: {
  loketCode?: string;
  date: string;
  conn?: PoolConnection;
}): Promise<
  Array<{
    payment_request_id: number;
    idempotency_key: string;
    provider: string;
    loket_code: string;
    amount: number;
    admin_fee: number;
    total: number;
    transaction_date: string;
  }>
> {
  const conn = opts.conn ?? pool;
  const params: (string | number)[] = [opts.date, opts.date];
  let where = "DATE(mpr.paid_at) >= ? AND DATE(mpr.paid_at) <= ? AND mpr.status = 'SUCCESS'";
  if (opts.loketCode) {
    where += " AND mpr.loket_code = ?";
    params.push(opts.loketCode);
  }

  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pr.id AS payment_request_id,
            mpr.idempotency_key,
            COALESCE(mpr.loket_code, pr.loket_code) AS loket_code,
            mpi.provider,
            COALESCE(SUM(mpi.amount), 0) AS amount,
            COALESCE(SUM(mpi.admin_fee), 0) AS admin_fee,
            COALESCE(SUM(mpi.total), mpr.grand_total) AS total,
            mpr.paid_at AS transaction_date
       FROM multi_payment_requests mpr
       LEFT JOIN payment_requests pr ON pr.idempotency_key = mpr.idempotency_key
       LEFT JOIN multi_payment_items mpi
              ON mpi.multi_payment_id = mpr.id AND mpi.status = 'SUCCESS'
       LEFT JOIN settlement_batch_items sbi ON sbi.idempotency_key = mpr.idempotency_key
      WHERE ${where} AND sbi.id IS NULL
      GROUP BY mpr.id`,
    params
  );

  return rows.map((r) => ({
    payment_request_id: r.payment_request_id ? Number(r.payment_request_id) : 0,
    idempotency_key: r.idempotency_key,
    provider: r.provider ?? "UNKNOWN",
    loket_code: r.loket_code,
    amount: Number(r.amount),
    admin_fee: Number(r.admin_fee),
    total: Number(r.total),
    transaction_date: r.transaction_date,
  }));
}

/**
 * Generate DRAFT batches untuk semua loket yang punya transaksi pada tanggal X.
 * Jika sudah ada batch untuk (date, loketCode), skip (idempotent).
 */
export async function generateDailyBatches(opts: {
  date?: string;
  loketCode?: string;
  createdBy?: string | null;
}): Promise<{ created: number; skipped: number; batches: string[] }> {
  const date = opts.date ?? dateOnly(new Date());
  const conn = await pool.getConnection();
  let created = 0;
  let skipped = 0;
  const batches: string[] = [];

  try {
    await conn.beginTransaction();

    const eligibleAll = await findEligibleTransactions({
      loketCode: opts.loketCode,
      date,
      conn,
    });

    // Group per loket_code
    const grouped = new Map<string, typeof eligibleAll>();
    for (const t of eligibleAll) {
      const arr = grouped.get(t.loket_code) ?? [];
      arr.push(t);
      grouped.set(t.loket_code, arr);
    }

    for (const [loketCode, items] of Array.from(grouped.entries())) {
      // Cek apakah batch (date, loket) sudah ada
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id, batch_code FROM settlement_batches
          WHERE batch_date = ? AND loket_code = ? LIMIT 1`,
        [date, loketCode]
      );
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const [loketRows] = await conn.query<RowDataPacket[]>(
        "SELECT nama FROM lokets WHERE loket_code = ? LIMIT 1",
        [loketCode]
      );
      const loketName = loketRows[0]?.nama ?? null;

      const batchCode = generateBatchCode(date, loketCode);
      const totals = items.reduce(
        (acc: { gross: number; adminFee: number; providerAmt: number }, it) => {
          acc.gross += it.total;
          acc.adminFee += it.admin_fee;
          acc.providerAmt += it.amount;
          return acc;
        },
        { gross: 0, adminFee: 0, providerAmt: 0 }
      );
      // Net payable = kas yang harus disetor ke pusat = gross - admin_fee (bagian loket)
      // (Bisa disesuaikan dengan kebijakan: di sini admin fee jadi hak loket.)
      const netPayable = totals.gross - totals.adminFee;

      const [insRes] = await conn.execute<ResultSetHeader>(
        `INSERT INTO settlement_batches
          (batch_code, batch_date, loket_code, loket_name, status,
           transaction_count, total_gross, total_admin_fee, total_provider_amt,
           net_payable, created_at, created_by)
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          batchCode,
          date,
          loketCode,
          loketName,
          items.length,
          totals.gross,
          totals.adminFee,
          totals.providerAmt,
          netPayable,
          opts.createdBy ?? null,
        ]
      );
      const batchId = insRes.insertId;

      for (const it of items) {
        await conn.execute(
          `INSERT INTO settlement_batch_items
            (batch_id, payment_request_id, idempotency_key, provider, loket_code,
             amount, admin_fee, total, transaction_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            batchId,
            it.payment_request_id || null,
            it.idempotency_key,
            it.provider,
            it.loket_code,
            it.amount,
            it.admin_fee,
            it.total,
            it.transaction_date,
          ]
        );
      }

      created++;
      batches.push(batchCode);
    }

    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }

  return { created, skipped, batches };
}

export async function listBatches(filter: {
  status?: BatchStatus;
  loketCode?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SettlementBatchRow[]; total: number }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter.loketCode) {
    where.push("loket_code = ?");
    params.push(filter.loketCode);
  }
  if (filter.from) {
    where.push("batch_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("batch_date <= ?");
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM settlement_batches ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM settlement_batches ${whereSql}
      ORDER BY batch_date DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { total, items: rows.map(mapBatchRow) };
}

export async function getBatch(id: number): Promise<{
  batch: SettlementBatchRow | null;
  items: Array<{
    id: number;
    idempotencyKey: string;
    provider: string;
    amount: number;
    adminFee: number;
    total: number;
    transactionDate: string;
  }>;
}> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM settlement_batches WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return { batch: null, items: [] };
  const batch = mapBatchRow(rows[0]);

  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, idempotency_key, provider, amount, admin_fee, total, transaction_date
       FROM settlement_batch_items WHERE batch_id = ? ORDER BY transaction_date ASC`,
    [id]
  );
  return {
    batch,
    items: itemRows.map((r) => ({
      id: Number(r.id),
      idempotencyKey: r.idempotency_key,
      provider: r.provider,
      amount: Number(r.amount),
      adminFee: Number(r.admin_fee),
      total: Number(r.total),
      transactionDate: r.transaction_date,
    })),
  };
}

export async function approveBatch(opts: {
  id: number;
  username: string | null;
}): Promise<SettlementBatchRow> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM settlement_batches WHERE id = ? LIMIT 1 FOR UPDATE`,
      [opts.id]
    );
    if (rows.length === 0) throw new Error("Batch tidak ditemukan");
    const batch = mapBatchRow(rows[0]);
    if (batch.status !== "DRAFT") {
      throw new Error(`Batch tidak dapat di-approve dari status ${batch.status}`);
    }
    await conn.execute(
      `UPDATE settlement_batches
          SET status = 'APPROVED', approved_at = NOW(), approved_by = ?
        WHERE id = ?`,
      [opts.username ?? null, opts.id]
    );
    await conn.commit();

    // Post jurnal di luar tx (postSettlementApproval pakai pool sendiri & best-effort)
    const gl = await postSettlementApproval({
      batchCode: batch.batchCode,
      loketCode: batch.loketCode,
      netPayable: batch.netPayable,
      username: opts.username,
    });
    if (gl) {
      await pool.execute(
        "UPDATE settlement_batches SET gl_entry_id = ? WHERE id = ?",
        [gl.entryId, opts.id]
      );
    }
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }

  const refreshed = await getBatch(opts.id);
  return refreshed.batch!;
}

export async function markBatchPaid(opts: {
  id: number;
  username: string | null;
  reference?: string | null;
  notes?: string | null;
}): Promise<SettlementBatchRow> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT status FROM settlement_batches WHERE id = ? LIMIT 1",
    [opts.id]
  );
  if (rows.length === 0) throw new Error("Batch tidak ditemukan");
  const status = rows[0].status as BatchStatus;
  if (status !== "APPROVED") {
    throw new Error(`Batch harus berstatus APPROVED untuk ditandai PAID (sekarang: ${status})`);
  }
  await pool.execute(
    `UPDATE settlement_batches
        SET status = 'PAID', paid_at = NOW(), paid_by = ?, paid_reference = ?,
            notes = COALESCE(?, notes)
      WHERE id = ?`,
    [opts.username ?? null, opts.reference ?? null, opts.notes ?? null, opts.id]
  );
  const refreshed = await getBatch(opts.id);
  return refreshed.batch!;
}

function mapBatchRow(r: RowDataPacket): SettlementBatchRow {
  return {
    id: Number(r.id),
    batchCode: r.batch_code,
    batchDate: String(r.batch_date).slice(0, 10),
    loketCode: r.loket_code,
    loketName: r.loket_name ?? null,
    status: r.status,
    transactionCount: Number(r.transaction_count),
    totalGross: Number(r.total_gross),
    totalAdminFee: Number(r.total_admin_fee),
    totalProviderAmt: Number(r.total_provider_amt),
    netPayable: Number(r.net_payable),
    notes: r.notes ?? null,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
    approvedAt: r.approved_at ?? null,
    approvedBy: r.approved_by ?? null,
    paidAt: r.paid_at ?? null,
    paidBy: r.paid_by ?? null,
    paidReference: r.paid_reference ?? null,
    glEntryId: r.gl_entry_id ? Number(r.gl_entry_id) : null,
  };
}
