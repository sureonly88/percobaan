import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { auditLog } from "@/lib/audit-log";
import { postJournal, type JournalLineInput } from "@/lib/gl/journal";
import { creditLoketBalance } from "@/lib/saldo-mutations";

/**
 * Pembatalan (void) transaksi — pengganti hard delete.
 *
 * Unit pembatalan = transaction_code (satu panggilan ke provider; PDAM bisa berisi
 * beberapa periode). Alur maker-checker:
 *   1. requestTransactionVoid  → status PENDING (alasan + referensi reversal provider)
 *   2. reviewTransactionVoid   → APPROVED / REJECTED oleh user LAIN
 * Saat APPROVED, dalam satu DB transaction:
 *   - item → VOID (data tidak dihapus), parent dihitung ulang
 *   - saldo loket dikembalikan sebesar yang benar-benar dipotong (ledger)
 *   - jurnal pembalik GL (REVERSAL) untuk jurnal pembayaran & komisi
 *   - komisi ACCRUED → VOID
 */

export class TransactionVoidError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type VoidStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RefundBasis = "LEDGER" | "ITEM_TOTAL" | "NONE";

export interface TransactionVoid {
  id: number;
  transactionCode: string;
  provider: string;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  itemIds: number[];
  totalAmount: number;
  refundAmount: number;
  refundBasis: RefundBasis;
  reason: string;
  providerReference: string | null;
  status: VoidStatus;
  warnings: string[];
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  glReversalEntryIds: number[];
}

export interface VoidActor {
  username: string;
  role: string;
  ip?: string | null;
}

interface ItemRow extends RowDataPacket {
  id: number;
  multi_payment_id: number;
  item_code: string;
  provider: string;
  customer_id: string;
  customer_name: string | null;
  total: string;
  status: string;
  metadata_json: string | null;
  loket_code: string | null;
  idempotency_key: string;
  request_payload: string | null;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toVoid(row: RowDataPacket): TransactionVoid {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
  return {
    id: Number(row.id),
    transactionCode: String(row.transaction_code),
    provider: String(row.provider),
    loketCode: row.loket_code ?? null,
    customerId: row.customer_id ?? null,
    customerName: row.customer_name ?? null,
    itemIds: parseJsonArray<number>(row.item_ids).map(Number),
    totalAmount: Number(row.total_amount || 0),
    refundAmount: Number(row.refund_amount || 0),
    refundBasis: String(row.refund_basis || "NONE") as RefundBasis,
    reason: String(row.reason || ""),
    providerReference: row.provider_reference ?? null,
    status: String(row.status) as VoidStatus,
    warnings: parseJsonArray<string>(row.warnings),
    requestedBy: String(row.requested_by),
    requestedAt: iso(row.requested_at) || "",
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note ?? null,
    glReversalEntryIds: parseJsonArray<number>(row.gl_reversal_entry_ids).map(Number),
  };
}

async function loadItems(db: PoolConnection | typeof pool, transactionCode: string, lock = false) {
  const [rows] = await db.query<ItemRow[]>(
    `SELECT i.id, i.multi_payment_id, i.item_code, i.provider, i.customer_id, i.customer_name,
            i.total, i.status, CAST(i.metadata_json AS CHAR) AS metadata_json,
            r.loket_code, r.idempotency_key, CAST(r.request_payload AS CHAR) AS request_payload
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.transaction_code = ?
      ORDER BY i.id${lock ? " FOR UPDATE" : ""}`,
    [transactionCode]
  );
  return rows;
}

/** Transaksi yang tidak pernah memotong saldo loket (input manual / impor data lama). */
function isNonBalanceItem(item: ItemRow): boolean {
  if (item.item_code.startsWith("MANUAL-")) return true;
  if ((item.request_payload || "").includes("pedami-payment-import")) return true;
  try {
    const meta = item.metadata_json ? JSON.parse(item.metadata_json) : null;
    if (meta?.flag === "MANUAL") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function requestTransactionVoid(input: {
  transactionCode: string;
  reason: string;
  providerReference?: string | null;
  actor: VoidActor;
}): Promise<TransactionVoid> {
  const transactionCode = String(input.transactionCode || "").trim();
  const reason = String(input.reason || "").trim();
  const providerReference = String(input.providerReference || "").trim() || null;
  if (!transactionCode) throw new TransactionVoidError("Kode transaksi wajib diisi");
  if (reason.length < 10) throw new TransactionVoidError("Alasan pembatalan wajib diisi (minimal 10 karakter)");

  const items = await loadItems(pool, transactionCode);
  if (items.length === 0) throw new TransactionVoidError("Transaksi tidak ditemukan", 404);

  const statuses = new Set(items.map((i) => i.status));
  if (["PENDING", "PENDING_ADVICE", "PENDING_PROVIDER", "PENDING_REVIEW"].some((s) => statuses.has(s))) {
    throw new TransactionVoidError(
      "Transaksi masih pending. Selesaikan lewat menu Advice terlebih dahulu sebelum dibatalkan.",
      409
    );
  }
  const successItems = items.filter((i) => i.status === "SUCCESS");
  if (successItems.length === 0) {
    throw new TransactionVoidError(
      statuses.has("VOID")
        ? "Transaksi sudah dibatalkan"
        : "Transaksi gagal tidak perlu dibatalkan — saldo sudah dikembalikan otomatis saat gagal",
      409
    );
  }

  const [pendingRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM transaction_voids WHERE transaction_code = ? AND status = 'PENDING' LIMIT 1",
    [transactionCode]
  );
  if (pendingRows.length > 0) {
    throw new TransactionVoidError("Sudah ada pengajuan pembatalan yang menunggu persetujuan untuk transaksi ini", 409);
  }

  const totalAmount = successItems.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const loketCode = successItems[0].loket_code;
  const warnings: string[] = [];

  // Nominal pengembalian = yang benar-benar dipotong dari saldo (ledger), bukan total tampilan.
  const [ledgerRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS net
       FROM loket_balance_ledger
      WHERE reference_type = 'TRANSACTION' AND reference_id = ?`,
    [transactionCode]
  );
  let refundAmount = 0;
  let refundBasis: RefundBasis = "NONE";
  if (Number(ledgerRows[0]?.cnt || 0) > 0) {
    refundAmount = Math.max(0, -Number(ledgerRows[0].net || 0));
    refundBasis = "LEDGER";
  } else if (successItems.every(isNonBalanceItem)) {
    warnings.push("Transaksi input manual/impor — tidak pernah memotong saldo, saldo tidak dikembalikan.");
  } else {
    refundAmount = totalAmount;
    refundBasis = "ITEM_TOTAL";
    warnings.push(
      "Transaksi dibuat sebelum ledger saldo aktif — nominal pengembalian dihitung dari total item. Periksa mutasi saldo sebelum menyetujui."
    );
  }
  if (refundAmount > 0 && (!loketCode || loketCode.startsWith("API-"))) {
    warnings.push(`Loket "${loketCode || "-"}" tidak terdaftar — pengembalian saldo akan gagal.`);
  }

  const itemIds = successItems.map((i) => i.id);
  const [paidCommission] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(commission_amount), 0) AS total
       FROM commission_ledger WHERE payment_item_id IN (?) AND status = 'PAID'`,
    [itemIds]
  );
  if (Number(paidCommission[0]?.total || 0) > 0) {
    warnings.push(
      `Komisi Rp ${Number(paidCommission[0].total).toLocaleString("id-ID")} sudah dibayarkan — perlu dipotong manual dari pembayaran komisi berikutnya.`
    );
  }

  const idempotencyKeys = Array.from(new Set(successItems.map((i) => i.idempotency_key)));
  const [settlementRows] = await pool.query<RowDataPacket[]>(
    `SELECT b.batch_code, b.status
       FROM settlement_batch_items sbi
       JOIN settlement_batches b ON b.id = sbi.batch_id
      WHERE sbi.idempotency_key IN (?)`,
    [idempotencyKeys]
  );
  for (const row of settlementRows) {
    warnings.push(
      `Transaksi sudah masuk settlement batch ${row.batch_code} (${row.status}) — perlu penyesuaian setoran.`
    );
  }

  const [result] = await pool.execute<import("mysql2").ResultSetHeader>(
    `INSERT INTO transaction_voids
       (transaction_code, provider, loket_code, customer_id, customer_name, item_ids,
        total_amount, refund_amount, refund_basis, reason, provider_reference, status,
        warnings, requested_by, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW())`,
    [
      transactionCode,
      successItems[0].provider,
      loketCode,
      successItems[0].customer_id,
      successItems[0].customer_name,
      JSON.stringify(itemIds),
      totalAmount,
      refundAmount,
      refundBasis,
      reason.slice(0, 500),
      providerReference,
      JSON.stringify(warnings),
      input.actor.username,
    ]
  );

  await auditLog({
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    actorIp: input.actor.ip ?? null,
    action: "TRANSACTION_VOID_REQUESTED",
    entityType: "transaction",
    entityId: transactionCode,
    after: { voidId: result.insertId, itemIds, totalAmount, refundAmount, refundBasis },
    context: { reason, providerReference, warnings },
  });

  const created = await getTransactionVoid(result.insertId);
  if (!created) throw new TransactionVoidError("Gagal membaca pengajuan pembatalan", 500);
  return created;
}

export async function getTransactionVoid(id: number): Promise<TransactionVoid | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM transaction_voids WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? toVoid(rows[0]) : null;
}

export async function listTransactionVoids(status?: string | null): Promise<TransactionVoid[]> {
  const valid = status && ["PENDING", "APPROVED", "REJECTED"].includes(status);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM transaction_voids ${valid ? "WHERE status = ?" : ""} ORDER BY requested_at DESC, id DESC LIMIT 200`,
    valid ? [status] : []
  );
  return rows.map(toVoid);
}

/** Buat jurnal pembalik untuk semua jurnal pembayaran & komisi transaksi ini yang belum dibalik. */
async function reverseJournals(
  conn: PoolConnection,
  voidRow: TransactionVoid,
  actor: string
): Promise<number[]> {
  const [entries] = await conn.query<RowDataPacket[]>(
    `SELECT e.id, e.entry_no, e.loket_code, e.provider, e.service_type
       FROM gl_journal_entries e
      WHERE e.reverses_entry_id IS NULL
        AND (
          (e.source_type = 'PAYMENT' AND e.source_id = ?)
          OR e.id IN (SELECT gl_entry_id FROM commission_ledger
                       WHERE payment_item_id IN (?) AND gl_entry_id IS NOT NULL)
        )
        AND NOT EXISTS (SELECT 1 FROM gl_journal_entries x WHERE x.reverses_entry_id = e.id)
      ORDER BY e.id`,
    [voidRow.transactionCode, voidRow.itemIds.length ? voidRow.itemIds : [0]]
  );

  const reversalIds: number[] = [];
  for (const entry of entries) {
    const [lines] = await conn.query<RowDataPacket[]>(
      `SELECT account_code, debit, credit, memo, dim_loket, dim_provider, dim_service, dim_product
         FROM gl_journal_lines WHERE entry_id = ? ORDER BY line_no`,
      [entry.id]
    );
    // Balik sisi debit ↔ kredit
    const reversedLines: JournalLineInput[] = lines.map((ln) => ({
      accountCode: String(ln.account_code),
      debit: Number(ln.credit || 0) || undefined,
      credit: Number(ln.debit || 0) || undefined,
      memo: ln.memo ?? null,
      dimLoket: ln.dim_loket ?? null,
      dimProvider: ln.dim_provider ?? null,
      dimService: ln.dim_service ?? null,
      dimProduct: ln.dim_product ?? null,
    }));
    const posted = await postJournal(
      {
        description: `Pembatalan ${voidRow.transactionCode} — pembalik ${entry.entry_no}`,
        sourceType: "REVERSAL",
        sourceId: `VOID-${voidRow.id}`,
        referenceNo: String(entry.entry_no),
        loketCode: entry.loket_code ?? null,
        provider: entry.provider ?? null,
        serviceType: entry.service_type ?? null,
        createdBy: actor,
        reversesEntryId: Number(entry.id),
        lines: reversedLines,
      },
      conn
    );
    reversalIds.push(posted.entryId);
  }
  return reversalIds;
}

export async function reviewTransactionVoid(input: {
  id: number;
  action: "approve" | "reject";
  note?: string | null;
  actor: VoidActor;
}): Promise<TransactionVoid> {
  const note = String(input.note || "").trim() || null;
  if (input.action === "reject" && !note) {
    throw new TransactionVoidError("Catatan penolakan wajib diisi");
  }

  const conn = await pool.getConnection();
  let voidRow: TransactionVoid;
  let reversalIds: number[] = [];
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM transaction_voids WHERE id = ? LIMIT 1 FOR UPDATE",
      [input.id]
    );
    if (!rows[0]) throw new TransactionVoidError("Pengajuan pembatalan tidak ditemukan", 404);
    voidRow = toVoid(rows[0]);
    if (voidRow.status !== "PENDING") {
      throw new TransactionVoidError(`Pengajuan sudah diproses (${voidRow.status})`, 409);
    }
    if (voidRow.requestedBy === input.actor.username) {
      throw new TransactionVoidError("Pengajuan harus disetujui/ditolak oleh user lain (bukan pengaju)", 403);
    }

    if (input.action === "approve") {
      const items = (await loadItems(conn, voidRow.transactionCode, true)).filter((i) =>
        voidRow.itemIds.includes(Number(i.id))
      );
      if (items.length !== voidRow.itemIds.length || items.some((i) => i.status !== "SUCCESS")) {
        throw new TransactionVoidError(
          "Status transaksi sudah berubah sejak diajukan. Tolak pengajuan ini lalu ajukan ulang.",
          409
        );
      }

      await conn.query(
        `UPDATE multi_payment_items
            SET status = 'VOID', provider_error_code = 'VOIDED', provider_error_message = ?
          WHERE id IN (?) AND status = 'SUCCESS'`,
        [`Dibatalkan (void #${voidRow.id}) oleh ${input.actor.username}: ${voidRow.reason}`.slice(0, 255), voidRow.itemIds]
      );

      const parentIds = Array.from(new Set(items.map((i) => Number(i.multi_payment_id))));
      for (const parentId of parentIds) {
        await conn.execute(
          `UPDATE multi_payment_requests r
              SET r.paid_amount = (SELECT COALESCE(SUM(total), 0) FROM multi_payment_items
                                    WHERE multi_payment_id = r.id AND status = 'SUCCESS'),
                  r.status = IF(
                    (SELECT COUNT(*) FROM multi_payment_items
                      WHERE multi_payment_id = r.id AND status NOT IN ('VOID')) = 0,
                    'VOID', r.status)
            WHERE r.id = ?`,
          [parentId]
        );
      }

      if (voidRow.refundAmount > 0) {
        const credit = await creditLoketBalance({
          connection: conn,
          loketCode: voidRow.loketCode || "",
          amount: voidRow.refundAmount,
          ledger: {
            type: "VOID_REFUND",
            referenceType: "TRANSACTION",
            referenceId: voidRow.transactionCode,
            note: `Pembatalan #${voidRow.id}: ${voidRow.reason}`,
            actor: input.actor.username,
          },
        });
        if (!credit.ok) {
          throw new TransactionVoidError(`Gagal mengembalikan saldo ke loket ${voidRow.loketCode || "-"}`, 500);
        }
      }

      reversalIds = await reverseJournals(conn, voidRow, input.actor.username);

      await conn.query(
        `UPDATE commission_ledger
            SET status = 'VOID', notes = ?
          WHERE payment_item_id IN (?) AND status = 'ACCRUED'`,
        [`Transaksi dibatalkan (void #${voidRow.id})`, voidRow.itemIds]
      );
    }

    await conn.execute(
      `UPDATE transaction_voids
          SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?, gl_reversal_entry_ids = ?
        WHERE id = ?`,
      [
        input.action === "approve" ? "APPROVED" : "REJECTED",
        input.actor.username,
        note,
        JSON.stringify(reversalIds),
        voidRow.id,
      ]
    );

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

  await auditLog({
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    actorIp: input.actor.ip ?? null,
    action: input.action === "approve" ? "TRANSACTION_VOID_APPROVED" : "TRANSACTION_VOID_REJECTED",
    entityType: "transaction",
    entityId: voidRow.transactionCode,
    before: { status: "PENDING" },
    after: {
      voidId: voidRow.id,
      status: input.action === "approve" ? "APPROVED" : "REJECTED",
      refundAmount: input.action === "approve" ? voidRow.refundAmount : 0,
      glReversalEntryIds: reversalIds,
    },
    context: { note, requestedBy: voidRow.requestedBy },
  });

  const updated = await getTransactionVoid(voidRow.id);
  if (!updated) throw new TransactionVoidError("Gagal membaca pengajuan pembatalan", 500);
  return updated;
}
