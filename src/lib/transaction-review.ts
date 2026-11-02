import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { auditLog } from "@/lib/audit-log";
import { getTransactionNetDebit, reconcileTransactionHold } from "@/lib/transaction-balance";

/**
 * Review transaksi yang status di provider tidak pasti (PENDING_REVIEW).
 *
 * Advice sudah habis tanpa konfirmasi, jadi sistem tidak boleh menebak. Admin
 * memutuskan berdasarkan bukti dari provider:
 *   - SUCCESS : langsung berlaku — saldo tetap terpotong, jurnal GL & komisi dibuat.
 *   - FAILED  : saldo dikembalikan → diajukan dulu, wajib disetujui user LAIN.
 * Selama belum diputuskan, saldo tetap ditahan dan advice masih boleh dicoba ulang.
 */

export class TransactionReviewError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ReviewDecision = "SUCCESS" | "FAILED";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReviewActor {
  username: string;
  role: string;
  ip?: string | null;
}

export interface ReviewQueueItem {
  transactionCode: string;
  provider: string;
  serviceType: string | null;
  productCode: string | null;
  loketCode: string | null;
  loketName: string | null;
  username: string | null;
  customerId: string;
  customerName: string | null;
  periods: string[];
  itemCount: number;
  totalAmount: number;
  heldAmount: number;
  adviceAttempts: number;
  idTrx: string | null;
  createdAt: string;
  lastError: string | null;
  pendingRequest: TransactionReview | null;
}

export interface TransactionReview {
  id: number;
  transactionCode: string;
  provider: string;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  heldAmount: number;
  decision: ReviewDecision;
  evidence: string;
  note: string | null;
  status: ReviewStatus;
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

interface ItemRow extends RowDataPacket {
  id: number;
  multi_payment_id: number;
  item_code: string;
  provider: string;
  service_type: string | null;
  product_code: string | null;
  customer_id: string;
  customer_name: string | null;
  period_label: string | null;
  amount: string;
  admin_fee: string;
  total: string;
  status: string;
  loket_code: string | null;
  idempotency_key: string;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

function toReview(row: RowDataPacket): TransactionReview {
  return {
    id: Number(row.id),
    transactionCode: String(row.transaction_code),
    provider: String(row.provider),
    loketCode: row.loket_code ?? null,
    customerId: row.customer_id ?? null,
    customerName: row.customer_name ?? null,
    heldAmount: Number(row.held_amount || 0),
    decision: String(row.decision) as ReviewDecision,
    evidence: String(row.evidence || ""),
    note: row.note ?? null,
    status: String(row.status) as ReviewStatus,
    requestedBy: String(row.requested_by),
    requestedAt: iso(row.requested_at) || "",
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note ?? null,
  };
}

async function loadItems(db: PoolConnection | typeof pool, transactionCode: string, lock = false) {
  const [rows] = await db.query<ItemRow[]>(
    `SELECT i.id, i.multi_payment_id, i.item_code, i.provider, i.service_type, i.product_code,
            i.customer_id, i.customer_name, i.period_label, i.amount, i.admin_fee, i.total, i.status,
            r.loket_code, r.idempotency_key
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.transaction_code = ?
      ORDER BY i.id${lock ? " FOR UPDATE" : ""}`,
    [transactionCode]
  );
  return rows;
}

/** Hitung ulang status & paid_amount parent setelah status item berubah. */
async function syncParent(conn: PoolConnection, parentId: number) {
  await conn.execute(
    `UPDATE multi_payment_requests r
        SET r.paid_amount = (SELECT COALESCE(SUM(total), 0) FROM multi_payment_items
                              WHERE multi_payment_id = r.id AND status = 'SUCCESS'),
            r.status = (
              SELECT CASE
                       WHEN SUM(status IN ('PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')) > 0 THEN r.status
                       WHEN SUM(status = 'SUCCESS') = COUNT(*) THEN 'SUCCESS'
                       WHEN SUM(status = 'SUCCESS') > 0 THEN 'PARTIAL_SUCCESS'
                       ELSE 'FAILED'
                     END
                FROM multi_payment_items WHERE multi_payment_id = r.id AND status <> 'VOID'),
            r.paid_at = IF(r.paid_at IS NULL AND (SELECT COUNT(*) FROM multi_payment_items
                             WHERE multi_payment_id = r.id AND status = 'SUCCESS') > 0, NOW(), r.paid_at)
      WHERE r.id = ?`,
    [parentId]
  );
}

export async function listReviewQueue(): Promise<ReviewQueueItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.transaction_code, i.provider, MAX(i.service_type) AS service_type, MAX(i.product_code) AS product_code,
            MAX(r.loket_code) AS loket_code, MAX(r.loket_name) AS loket_name, MAX(r.username) AS username,
            MAX(i.customer_id) AS customer_id, MAX(i.customer_name) AS customer_name,
            GROUP_CONCAT(i.period_label ORDER BY i.period_label SEPARATOR ',') AS periods,
            COUNT(*) AS item_count, COALESCE(SUM(i.total), 0) AS total_amount,
            MAX(i.advice_attempts) AS advice_attempts, MIN(i.created_at) AS created_at,
            MAX(i.provider_error_message) AS last_error,
            MAX(JSON_UNQUOTE(JSON_EXTRACT(i.metadata_json, '$.idTrx'))) AS id_trx
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.status = 'PENDING_REVIEW' AND i.transaction_code IS NOT NULL
      GROUP BY i.transaction_code, i.provider
      ORDER BY created_at ASC
      LIMIT 200`
  );
  if (rows.length === 0) return [];

  const codes = rows.map((r) => String(r.transaction_code));
  const [ledgerRows] = await pool.query<RowDataPacket[]>(
    `SELECT reference_id, -COALESCE(SUM(amount), 0) AS net
       FROM loket_balance_ledger
      WHERE reference_type = 'TRANSACTION' AND reference_id IN (?)
      GROUP BY reference_id`,
    [codes]
  );
  const heldByCode = new Map(ledgerRows.map((r) => [String(r.reference_id), Math.max(0, Number(r.net || 0))]));

  const [requestRows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM transaction_reviews WHERE status = 'PENDING' AND transaction_code IN (?)",
    [codes]
  );
  const requestByCode = new Map(requestRows.map((r) => [String(r.transaction_code), toReview(r)]));

  return rows.map((r) => ({
    transactionCode: String(r.transaction_code),
    provider: String(r.provider),
    serviceType: r.service_type ?? null,
    productCode: r.product_code ?? null,
    loketCode: r.loket_code ?? null,
    loketName: r.loket_name ?? null,
    username: r.username ?? null,
    customerId: String(r.customer_id || ""),
    customerName: r.customer_name ?? null,
    periods: String(r.periods || "").split(",").filter(Boolean),
    itemCount: Number(r.item_count || 0),
    totalAmount: Number(r.total_amount || 0),
    heldAmount: heldByCode.get(String(r.transaction_code)) ?? 0,
    adviceAttempts: Number(r.advice_attempts || 0),
    idTrx: r.id_trx && r.id_trx !== "null" ? String(r.id_trx) : null,
    createdAt: iso(r.created_at) || "",
    lastError: r.last_error ?? null,
    pendingRequest: requestByCode.get(String(r.transaction_code)) ?? null,
  }));
}

export async function listReviews(status?: string | null): Promise<TransactionReview[]> {
  const valid = status && ["PENDING", "APPROVED", "REJECTED"].includes(status);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM transaction_reviews ${valid ? "WHERE status = ?" : ""} ORDER BY requested_at DESC, id DESC LIMIT 200`,
    valid ? [status] : []
  );
  return rows.map(toReview);
}

async function getReview(id: number): Promise<TransactionReview | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM transaction_reviews WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? toReview(rows[0]) : null;
}

/** Posting jurnal GL & komisi untuk transaksi yang dikonfirmasi sukses (best-effort, idempoten). */
async function postSuccessSideEffects(items: ItemRow[], transactionCode: string, actor: string) {
  const amount = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const adminFee = items.reduce((s, i) => s + Number(i.admin_fee || 0), 0);
  const total = items.reduce((s, i) => s + Number(i.total || 0), 0);
  try {
    const { postPaymentSuccess } = await import("@/lib/gl/posting-rules");
    await postPaymentSuccess({
      idempotencyKey: transactionCode,
      provider: items[0].provider,
      serviceType: items[0].service_type,
      loketCode: String(items[0].loket_code || ""),
      amount,
      adminFee,
      total,
      customerName: items[0].customer_name,
      customerId: items[0].customer_id,
      productCode: items[0].product_code,
      username: actor,
    });
  } catch (err) {
    console.error("[transaction-review] Posting GL gagal:", err);
  }
  try {
    const { recordCommissionsForTransactionCode } = await import("@/lib/commission/record");
    await recordCommissionsForTransactionCode(transactionCode);
  } catch (err) {
    console.error("[transaction-review] Pencatatan komisi gagal:", err);
  }
}

export async function submitReviewDecision(input: {
  transactionCode: string;
  decision: ReviewDecision;
  evidence: string;
  note?: string | null;
  actor: ReviewActor;
}): Promise<TransactionReview> {
  const transactionCode = String(input.transactionCode || "").trim();
  const evidence = String(input.evidence || "").trim();
  const note = String(input.note || "").trim() || null;
  if (!transactionCode) throw new TransactionReviewError("Kode transaksi wajib diisi");
  if (input.decision !== "SUCCESS" && input.decision !== "FAILED") {
    throw new TransactionReviewError("Keputusan harus SUCCESS atau FAILED");
  }
  if (evidence.length < 5) {
    throw new TransactionReviewError("Bukti dari provider wajib diisi (no. referensi / keterangan, minimal 5 karakter)");
  }

  const conn = await pool.getConnection();
  let reviewId = 0;
  let successItems: ItemRow[] = [];
  try {
    await conn.beginTransaction();
    const items = await loadItems(conn, transactionCode, true);
    if (items.length === 0) throw new TransactionReviewError("Transaksi tidak ditemukan", 404);
    const reviewItems = items.filter((i) => i.status === "PENDING_REVIEW");
    if (reviewItems.length === 0) {
      throw new TransactionReviewError("Transaksi tidak sedang menunggu review (status sudah berubah)", 409);
    }
    const [pending] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM transaction_reviews WHERE transaction_code = ? AND status = 'PENDING' LIMIT 1 FOR UPDATE",
      [transactionCode]
    );
    if (pending.length > 0) {
      throw new TransactionReviewError("Sudah ada pengajuan yang menunggu persetujuan untuk transaksi ini", 409);
    }

    const heldAmount = await getTransactionNetDebit(transactionCode, conn);
    const first = reviewItems[0];
    const isSuccess = input.decision === "SUCCESS";

    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO transaction_reviews
         (transaction_code, provider, loket_code, customer_id, customer_name, held_amount, decision,
          evidence, note, status, requested_by, requested_at, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        transactionCode,
        first.provider,
        first.loket_code,
        first.customer_id,
        first.customer_name,
        heldAmount,
        input.decision,
        evidence.slice(0, 255),
        note ? note.slice(0, 500) : null,
        isSuccess ? "APPROVED" : "PENDING",
        input.actor.username,
        isSuccess ? input.actor.username : null,
        isSuccess ? new Date() : null,
      ]
    );
    reviewId = ins.insertId;

    if (isSuccess) {
      // Konfirmasi sukses: tidak ada uang keluar dari perusahaan → langsung berlaku
      await conn.query(
        `UPDATE multi_payment_items
            SET status = 'SUCCESS', provider_error_code = NULL, provider_error_message = NULL,
                paid_at = NOW(), failed_at = NULL
          WHERE id IN (?) AND status = 'PENDING_REVIEW'`,
        [reviewItems.map((i) => i.id)]
      );
      for (const parentId of Array.from(new Set(reviewItems.map((i) => Number(i.multi_payment_id))))) {
        await syncParent(conn, parentId);
      }
      // Samakan hold dengan total item SUCCESS (biasanya sudah sama → tidak ada mutasi)
      await reconcileTransactionHold(transactionCode, {
        connection: conn,
        actor: input.actor.username,
        note: `Review #${reviewId}: dikonfirmasi sukses`,
      });
      successItems = reviewItems;
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

  if (successItems.length > 0) {
    await postSuccessSideEffects(successItems, transactionCode, input.actor.username);
  }

  await auditLog({
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    actorIp: input.actor.ip ?? null,
    action: input.decision === "SUCCESS" ? "TRANSACTION_REVIEW_CONFIRMED_SUCCESS" : "TRANSACTION_REVIEW_FAILED_REQUESTED",
    entityType: "transaction",
    entityId: transactionCode,
    before: { status: "PENDING_REVIEW" },
    after: { reviewId, decision: input.decision, status: input.decision === "SUCCESS" ? "SUCCESS" : "PENDING_REVIEW" },
    context: { evidence, note },
  });

  const review = await getReview(reviewId);
  if (!review) throw new TransactionReviewError("Gagal membaca data review", 500);
  return review;
}

export async function approveFailedReview(input: {
  id: number;
  action: "approve" | "reject";
  note?: string | null;
  actor: ReviewActor;
}): Promise<TransactionReview> {
  const note = String(input.note || "").trim() || null;
  if (input.action === "reject" && !note) throw new TransactionReviewError("Catatan penolakan wajib diisi");

  const conn = await pool.getConnection();
  let review: TransactionReview;
  let released = 0;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM transaction_reviews WHERE id = ? LIMIT 1 FOR UPDATE",
      [input.id]
    );
    if (!rows[0]) throw new TransactionReviewError("Pengajuan tidak ditemukan", 404);
    review = toReview(rows[0]);
    if (review.status !== "PENDING" || review.decision !== "FAILED") {
      throw new TransactionReviewError(`Pengajuan sudah diproses (${review.status})`, 409);
    }
    if (review.requestedBy === input.actor.username) {
      throw new TransactionReviewError("Pengembalian saldo harus disetujui oleh user lain (bukan pengaju)", 403);
    }

    if (input.action === "approve") {
      const items = await loadItems(conn, review.transactionCode, true);
      const reviewItems = items.filter((i) => i.status === "PENDING_REVIEW");
      if (reviewItems.length === 0) {
        throw new TransactionReviewError(
          "Status transaksi sudah berubah (mis. advice sudah memberi konfirmasi). Tolak pengajuan ini.",
          409
        );
      }
      await conn.query(
        `UPDATE multi_payment_items
            SET status = 'FAILED', provider_error_code = 'REVIEW_FAILED',
                provider_error_message = ?, failed_at = NOW()
          WHERE id IN (?) AND status = 'PENDING_REVIEW'`,
        [`Dinyatakan gagal lewat review #${review.id}: ${review.evidence}`.slice(0, 255), reviewItems.map((i) => i.id)]
      );
      for (const parentId of Array.from(new Set(reviewItems.map((i) => Number(i.multi_payment_id))))) {
        await syncParent(conn, parentId);
      }
      const settle = await reconcileTransactionHold(review.transactionCode, {
        connection: conn,
        actor: input.actor.username,
        note: `Review #${review.id}: dinyatakan gagal`,
      });
      released = Math.max(0, -(settle?.adjusted ?? 0));
    }

    await conn.execute(
      `UPDATE transaction_reviews
          SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?
        WHERE id = ?`,
      [input.action === "approve" ? "APPROVED" : "REJECTED", input.actor.username, note, review.id]
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
    action: input.action === "approve" ? "TRANSACTION_REVIEW_FAILED_APPROVED" : "TRANSACTION_REVIEW_FAILED_REJECTED",
    entityType: "transaction",
    entityId: review.transactionCode,
    before: { status: "PENDING_REVIEW" },
    after: {
      reviewId: review.id,
      status: input.action === "approve" ? "FAILED" : "PENDING_REVIEW",
      released,
    },
    context: { note, requestedBy: review.requestedBy, evidence: review.evidence },
  });

  const updated = await getReview(review.id);
  if (!updated) throw new TransactionReviewError("Gagal membaca data review", 500);
  return updated;
}
