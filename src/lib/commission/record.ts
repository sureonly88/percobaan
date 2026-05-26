import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import {
  recordCommissionsSafe,
  type CommissionContext,
  type RecordCommissionsResult,
} from "./calculate";

interface ItemRow extends RowDataPacket {
  id: number;
  item_code: string;
  transaction_code: string | null;
  multi_payment_code: string | null;
  loket_code: string;
  username: string;
  provider: string;
  service_type: string | null;
  product_code: string | null;
  amount: string;
  admin_fee: string;
  total: string;
  paid_at: Date | null;
  status: string;
}

/**
 * Cari semua multi_payment_items SUKSES untuk transaction_code tertentu lalu catat komisinya.
 * Aman dipanggil berulang-ulang (idempoten).
 */
export async function recordCommissionsForTransactionCode(
  transactionCode: string
): Promise<RecordCommissionsResult[]> {
  const [rows] = await pool.query<ItemRow[]>(
    `SELECT i.id, i.item_code, i.transaction_code, r.multi_payment_code,
            r.loket_code, r.username,
            i.provider, i.service_type, i.product_code,
            i.amount, i.admin_fee, i.total, i.paid_at, i.status
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.transaction_code = ? AND i.status = 'SUCCESS'`,
    [transactionCode]
  );

  const results: RecordCommissionsResult[] = [];
  for (const row of rows) {
    const ctx: CommissionContext = {
      paymentItemId: row.id,
      itemCode: row.item_code,
      transactionCode: row.transaction_code,
      multiPaymentCode: row.multi_payment_code,
      paidAt: row.paid_at ?? new Date(),
      loketCode: row.loket_code,
      username: row.username,
      provider: row.provider,
      serviceType: row.service_type,
      productCode: row.product_code,
      amount: Number(row.amount) || 0,
      adminFee: Number(row.admin_fee) || 0,
      total: Number(row.total) || 0,
    };
    const r = await recordCommissionsSafe(ctx);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Sama seperti di atas tapi untuk satu multi_payment_code (header).
 */
export async function recordCommissionsForMultiPaymentCode(
  multiPaymentCode: string
): Promise<RecordCommissionsResult[]> {
  const [rows] = await pool.query<ItemRow[]>(
    `SELECT i.id, i.item_code, i.transaction_code, r.multi_payment_code,
            r.loket_code, r.username,
            i.provider, i.service_type, i.product_code,
            i.amount, i.admin_fee, i.total, i.paid_at, i.status
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE r.multi_payment_code = ? AND i.status = 'SUCCESS'`,
    [multiPaymentCode]
  );

  const results: RecordCommissionsResult[] = [];
  for (const row of rows) {
    const ctx: CommissionContext = {
      paymentItemId: row.id,
      itemCode: row.item_code,
      transactionCode: row.transaction_code,
      multiPaymentCode: row.multi_payment_code,
      paidAt: row.paid_at ?? new Date(),
      loketCode: row.loket_code,
      username: row.username,
      provider: row.provider,
      serviceType: row.service_type,
      productCode: row.product_code,
      amount: Number(row.amount) || 0,
      adminFee: Number(row.admin_fee) || 0,
      total: Number(row.total) || 0,
    };
    const r = await recordCommissionsSafe(ctx);
    if (r) results.push(r);
  }
  return results;
}
