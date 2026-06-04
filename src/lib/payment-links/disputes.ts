import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { addInvoiceEvent, findInvoiceByCode } from "./repository";
import { auditLog } from "@/lib/audit-log";

export type PaymentDisputeStatus = "OPEN" | "RETRYING" | "REFUND_NEEDED" | "REFUND_PROCESSED" | "RESOLVED" | "CANCELLED";

export interface PaymentDispute {
  id: number;
  invoiceId: number;
  invoiceCode: string;
  status: PaymentDisputeStatus;
  reason: string | null;
  resolutionNote: string | null;
  refundAmount: number;
  refundReference: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invoiceStatus?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  grandTotal?: number;
  gatewayStatus?: string | null;
  paymentMethod?: string | null;
  paidGatewayAt?: string | null;
  providerProcessedAt?: string | null;
  loketCode?: string | null;
  loketName?: string | null;
}

const VALID_STATUSES: PaymentDisputeStatus[] = ["OPEN", "RETRYING", "REFUND_NEEDED", "REFUND_PROCESSED", "RESOLVED", "CANCELLED"];

function mapRow(row: RowDataPacket): PaymentDispute {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    invoiceCode: String(row.invoice_code),
    status: row.status as PaymentDisputeStatus,
    reason: row.reason ?? null,
    resolutionNote: row.resolution_note ?? null,
    refundAmount: Number(row.refund_amount || 0),
    refundReference: row.refund_reference ?? null,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    invoiceStatus: row.invoice_status ? String(row.invoice_status) : undefined,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    grandTotal: row.grand_total == null ? undefined : Number(row.grand_total),
    gatewayStatus: row.gateway_status ?? null,
    paymentMethod: row.payment_method ?? null,
    paidGatewayAt: row.paid_gateway_at ? String(row.paid_gateway_at) : null,
    providerProcessedAt: row.provider_processed_at ? String(row.provider_processed_at) : null,
    loketCode: row.loket_code ?? null,
    loketName: row.loket_name ?? null,
  };
}

export function isPaymentDisputeStatus(value: string): value is PaymentDisputeStatus {
  return VALID_STATUSES.includes(value as PaymentDisputeStatus);
}

export async function ensureDisputeForInvoice(params: {
  invoiceId: number;
  invoiceCode: string;
  reason?: string;
  createdBy?: string | null;
  refundAmount?: number;
}) {
  await pool.execute(
    `INSERT INTO payment_disputes
     (invoice_id, invoice_code, status, reason, refund_amount, created_by, created_at, updated_at)
     VALUES (?, ?, 'OPEN', ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       reason = COALESCE(payment_disputes.reason, VALUES(reason)),
       refund_amount = CASE WHEN payment_disputes.refund_amount = 0 THEN VALUES(refund_amount) ELSE payment_disputes.refund_amount END,
       updated_at = NOW()`,
    [params.invoiceId, params.invoiceCode, params.reason || "Provider gagal setelah gateway sukses", params.refundAmount || 0, params.createdBy || "SYSTEM"]
  );
}

export async function listDisputes(params: { status?: string; search?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (params.status && params.status !== "ALL") {
    where.push("d.status = ?");
    values.push(params.status);
  }
  if (params.search) {
    where.push("(d.invoice_code LIKE ? OR COALESCE(i.customer_name,'') LIKE ? OR COALESCE(i.customer_phone,'') LIKE ? OR COALESCE(i.loket_code,'') LIKE ?)");
    const q = `%${params.search}%`;
    values.push(q, q, q, q);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (params.page - 1) * params.pageSize;

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
       FROM payment_disputes d
       JOIN payment_invoices i ON i.id = d.invoice_id
      ${whereSql}`,
    values
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT d.*, i.status AS invoice_status, i.customer_name, i.customer_phone, i.grand_total,
            i.gateway_status, i.payment_method, i.paid_gateway_at, i.provider_processed_at,
            i.loket_code, i.loket_name
       FROM payment_disputes d
       JOIN payment_invoices i ON i.id = d.invoice_id
      ${whereSql}
      ORDER BY FIELD(d.status, 'OPEN','RETRYING','REFUND_NEEDED','REFUND_PROCESSED','RESOLVED','CANCELLED'), d.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...values, params.pageSize, offset]
  );
  return { items: rows.map(mapRow), totalItems: Number(countRows[0]?.total || 0) };
}

export async function syncFailedProviderDisputes(createdBy = "SYSTEM") {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO payment_disputes
     (invoice_id, invoice_code, status, reason, refund_amount, created_by, created_at, updated_at)
     SELECT i.id, i.invoice_code, 'OPEN', 'Provider gagal setelah gateway sukses', i.grand_total, ?, NOW(), NOW()
       FROM payment_invoices i
       LEFT JOIN payment_disputes d ON d.invoice_id = i.id
      WHERE i.status = 'FAILED_PROVIDER'
        AND d.id IS NULL`,
    [createdBy]
  );
  return Number(res.affectedRows || 0);
}

export async function updateDispute(params: {
  invoiceCode: string;
  status: PaymentDisputeStatus;
  reason?: string | null;
  resolutionNote?: string | null;
  refundAmount?: number | null;
  refundReference?: string | null;
  actorUsername: string;
  actorRole?: string | null;
  actorIp?: string | null;
}) {
  const invoice = await findInvoiceByCode(params.invoiceCode);
  if (!invoice) throw new Error("Invoice tidak ditemukan");
  await ensureDisputeForInvoice({
    invoiceId: invoice.id,
    invoiceCode: invoice.invoiceCode,
    reason: params.reason || "Dibuat manual dari halaman refund/dispute",
    createdBy: params.actorUsername,
  });

  const [beforeRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_disputes WHERE invoice_id = ? LIMIT 1`,
    [invoice.id]
  );
  const before = beforeRows[0] ? mapRow(beforeRows[0]) : null;
  const resolved = params.status === "RESOLVED" || params.status === "REFUND_PROCESSED" || params.status === "CANCELLED";

  await pool.execute(
    `UPDATE payment_disputes
        SET status = ?,
            reason = COALESCE(?, reason),
            resolution_note = COALESCE(?, resolution_note),
            refund_amount = COALESCE(?, refund_amount),
            refund_reference = COALESCE(?, refund_reference),
            updated_by = ?,
            resolved_by = CASE WHEN ? THEN ? ELSE resolved_by END,
            resolved_at = CASE WHEN ? THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
      WHERE invoice_id = ?`,
    [
      params.status,
      params.reason || null,
      params.resolutionNote || null,
      params.refundAmount == null ? null : params.refundAmount,
      params.refundReference || null,
      params.actorUsername,
      resolved ? 1 : 0,
      params.actorUsername,
      resolved ? 1 : 0,
      invoice.id,
    ]
  );

  await addInvoiceEvent({
    invoiceId: invoice.id,
    eventType: "PAYMENT_DISPUTE_UPDATED",
    actorType: "user",
    actorUsername: params.actorUsername,
    beforeStatus: before?.status || null,
    afterStatus: params.status,
    payload: {
      reason: params.reason || null,
      resolutionNote: params.resolutionNote || null,
      refundAmount: params.refundAmount ?? null,
      refundReference: params.refundReference || null,
    },
  });

  await auditLog({
    actorType: "user",
    actorUsername: params.actorUsername,
    actorRole: params.actorRole || null,
    actorIp: params.actorIp || null,
    action: "PAYMENT_DISPUTE_UPDATE",
    entityType: "payment_dispute",
    entityId: invoice.invoiceCode,
    before,
    after: { status: params.status, reason: params.reason || null, refundReference: params.refundReference || null },
    context: { invoiceId: invoice.id, invoiceCode: invoice.invoiceCode },
  });

  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_disputes WHERE invoice_id = ? LIMIT 1`, [invoice.id]);
  return rows[0] ? mapRow(rows[0]) : null;
}
