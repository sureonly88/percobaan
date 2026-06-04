import pool from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import type { CreatePaymentLinkInput, PaymentInvoice, PaymentInvoiceItem, PaymentInvoiceStatus } from "./types";
import { generateInvoiceCode, randomToken } from "./code";

function parseJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : (value as Record<string, unknown>);
  } catch {
    return {};
  }
}

function mapInvoice(row: RowDataPacket): PaymentInvoice {
  return {
    id: Number(row.id),
    invoiceCode: String(row.invoice_code),
    publicToken: String(row.public_token),
    idempotencyKey: String(row.idempotency_key),
    status: row.status as PaymentInvoiceStatus,
    loketCode: row.loket_code ?? null,
    loketName: row.loket_name ?? null,
    createdBy: row.created_by ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    customerEmail: row.customer_email ?? null,
    totalItems: Number(row.total_items || 0),
    totalAmount: Number(row.total_amount || 0),
    totalAdmin: Number(row.total_admin || 0),
    gatewayFee: Number(row.gateway_fee || 0),
    grandTotal: Number(row.grand_total || 0),
    gatewayOrderId: row.gateway_order_id ?? null,
    gatewayTxId: row.gateway_tx_id ?? null,
    paymentMethod: row.payment_method ?? null,
    snapToken: row.snap_token ?? null,
    snapUrl: row.snap_url ?? null,
    gatewayStatus: row.gateway_status ?? null,
    multiPaymentCode: row.multi_payment_code ?? null,
    receiptToken: row.receipt_token ?? null,
    notes: row.notes ?? null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    paidGatewayAt: row.paid_gateway_at ? String(row.paid_gateway_at) : null,
    providerProcessedAt: row.provider_processed_at ? String(row.provider_processed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapItem(row: RowDataPacket): PaymentInvoiceItem {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    itemCode: String(row.item_code),
    provider: row.provider,
    serviceType: String(row.service_type),
    customerId: String(row.customer_id),
    customerName: row.customer_name ?? null,
    productCode: row.product_code ?? null,
    providerRef: row.provider_ref ?? null,
    periodLabel: row.period_label ?? null,
    amount: Number(row.amount || 0),
    adminFee: Number(row.admin_fee || 0),
    total: Number(row.total || 0),
    metadata: parseJson(row.metadata_json),
    inquirySnapshot: parseJson(row.inquiry_snapshot),
    status: String(row.status),
  };
}

export async function addInvoiceEvent(params: {
  invoiceId: number;
  eventType: string;
  actorType?: "user" | "system" | "gateway" | "public";
  actorUsername?: string | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  payload?: unknown;
}) {
  await pool.execute(
    `INSERT INTO payment_invoice_events
     (invoice_id, event_type, actor_type, actor_username, before_status, after_status, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      params.invoiceId,
      params.eventType,
      params.actorType || "system",
      params.actorUsername || null,
      params.beforeStatus || null,
      params.afterStatus || null,
      params.payload ? JSON.stringify(params.payload) : null,
    ]
  );
}

export async function createPaymentInvoice(input: CreatePaymentLinkInput) {
  const invoiceCode = generateInvoiceCode();
  const publicToken = randomToken();
  const receiptToken = randomToken();
  const totalAmount = input.items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalAdmin = input.items.reduce((s, i) => s + Number(i.adminFee || 0), 0);
  const grandTotal = input.items.reduce((s, i) => s + Number(i.total || 0), 0);
  const expiresAt = new Date(Date.now() + (input.expiresInMinutes || 24 * 60) * 60 * 1000);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [res] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payment_invoices
       (invoice_code, public_token, idempotency_key, status, loket_code, loket_name, created_by,
        customer_name, customer_phone, customer_email, total_items, total_amount, total_admin,
        gateway_fee, grand_total, receipt_token, notes, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'UNPAID', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())`,
      [
        invoiceCode,
        publicToken,
        input.idempotencyKey,
        input.loketCode,
        input.loketName,
        input.createdBy,
        input.customerName || null,
        input.customerPhone || null,
        input.customerEmail || null,
        input.items.length,
        totalAmount,
        totalAdmin,
        grandTotal,
        receiptToken,
        input.notes || null,
        expiresAt,
      ]
    );
    const invoiceId = Number(res.insertId);
    for (let idx = 0; idx < input.items.length; idx++) {
      const item = input.items[idx];
      const itemCode = item.itemCode || `${invoiceCode}-${idx + 1}`;
      await connection.execute(
        `INSERT INTO payment_invoice_items
         (invoice_id, item_code, provider, service_type, customer_id, customer_name, product_code,
          provider_ref, period_label, amount, admin_fee, total, inquiry_snapshot, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          invoiceId,
          itemCode,
          item.provider,
          item.serviceType,
          item.customerId,
          item.customerName || null,
          item.productCode || null,
          item.providerRef || null,
          item.periodLabel || null,
          item.amount,
          item.adminFee,
          item.total,
          item.inquirySnapshot ? JSON.stringify(item.inquirySnapshot) : null,
          item.metadata ? JSON.stringify(item.metadata) : null,
        ]
      );
    }
    await connection.execute(
      `INSERT INTO payment_invoice_events
       (invoice_id, event_type, actor_type, actor_username, after_status, payload, created_at)
       VALUES (?, 'PAYMENT_LINK_CREATED', 'user', ?, 'UNPAID', ?, NOW())`,
      [invoiceId, input.createdBy, JSON.stringify({ totalItems: input.items.length, grandTotal })]
    );
    await connection.commit();
    return { invoiceId, invoiceCode, publicToken, receiptToken, expiresAt };
  } catch (error) {
    await connection.rollback();
    const err = error as { code?: string };
    if (err.code === "ER_DUP_ENTRY") {
      const existing = await findInvoiceByIdempotencyKey(input.idempotencyKey);
      if (existing) return { invoiceId: existing.id, invoiceCode: existing.invoiceCode, publicToken: existing.publicToken, receiptToken: existing.receiptToken || "", expiresAt: existing.expiresAt ? new Date(existing.expiresAt) : expiresAt };
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function findInvoiceByIdempotencyKey(key: string) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoices WHERE idempotency_key = ? LIMIT 1`, [key]);
  return rows[0] ? mapInvoice(rows[0]) : null;
}

export async function findInvoiceByCode(code: string) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoices WHERE invoice_code = ? LIMIT 1`, [code]);
  return rows[0] ? mapInvoice(rows[0]) : null;
}

export async function findInvoiceByPublicToken(token: string) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoices WHERE public_token = ? LIMIT 1`, [token]);
  return rows[0] ? mapInvoice(rows[0]) : null;
}

export async function findInvoiceByGatewayOrderId(orderId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoices WHERE gateway_order_id = ? LIMIT 1`, [orderId]);
  return rows[0] ? mapInvoice(rows[0]) : null;
}

export async function findInvoiceByReceiptToken(token: string) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoices WHERE receipt_token = ? LIMIT 1`, [token]);
  return rows[0] ? mapInvoice(rows[0]) : null;
}

export async function getInvoiceItems(invoiceId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM payment_invoice_items WHERE invoice_id = ? ORDER BY id ASC`, [invoiceId]);
  return rows.map(mapItem);
}

export async function getInvoiceEvents(invoiceId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, event_type, actor_type, actor_username, before_status, after_status,
            CAST(payload AS CHAR) AS payload, created_at
       FROM payment_invoice_events
      WHERE invoice_id = ?
      ORDER BY id ASC`,
    [invoiceId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    eventType: String(row.event_type),
    actorType: String(row.actor_type),
    actorUsername: row.actor_username ? String(row.actor_username) : null,
    beforeStatus: row.before_status ? String(row.before_status) : null,
    afterStatus: row.after_status ? String(row.after_status) : null,
    payload: parseJson(row.payload),
    createdAt: String(row.created_at),
  }));
}

export async function listInvoices(params: { status?: string; search?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (params.status && params.status !== "ALL") {
    where.push("status = ?");
    values.push(params.status);
  }
  if (params.search) {
    where.push("(invoice_code LIKE ? OR COALESCE(customer_name,'') LIKE ? OR COALESCE(customer_phone,'') LIKE ? OR COALESCE(loket_code,'') LIKE ?)");
    const q = `%${params.search}%`;
    values.push(q, q, q, q);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (params.page - 1) * params.pageSize;
  const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM payment_invoices ${whereSql}`, values);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_invoices ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, params.pageSize, offset]
  );
  return { items: rows.map(mapInvoice), totalItems: Number(countRows[0]?.total || 0) };
}

export async function listPaidGatewayInvoices(limit = 20) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_invoices
      WHERE status = 'PAID_GATEWAY' AND multi_payment_code IS NULL
      ORDER BY paid_gateway_at ASC, id ASC
      LIMIT ?`,
    [limit]
  );
  return rows.map(mapInvoice);
}

export async function listProviderProcessableInvoices(limit = 20, staleMinutes = 15) {
  const staleCutoff = new Date(Date.now() - Math.max(1, staleMinutes) * 60_000);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_invoices
      WHERE multi_payment_code IS NULL
        AND (
          status = 'PAID_GATEWAY'
          OR (status = 'PROCESSING_PROVIDER' AND updated_at < ?)
        )
      ORDER BY FIELD(status, 'PAID_GATEWAY', 'PROCESSING_PROVIDER'), paid_gateway_at ASC, updated_at ASC, id ASC
      LIMIT ?`,
    [staleCutoff, limit]
  );
  return rows.map(mapInvoice);
}

export async function claimInvoiceForProviderProcessing(invoiceId: number, staleMinutes = 15) {
  const staleCutoff = new Date(Date.now() - Math.max(1, staleMinutes) * 60_000);
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE payment_invoices
        SET status = 'PROCESSING_PROVIDER', updated_at = NOW()
      WHERE id = ?
        AND multi_payment_code IS NULL
        AND (
          status = 'PAID_GATEWAY'
          OR (status = 'PROCESSING_PROVIDER' AND updated_at < ?)
        )`,
    [invoiceId, staleCutoff]
  );
  return Number(res.affectedRows || 0) > 0;
}

export async function expirePaymentInvoices() {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE payment_invoices
        SET status = 'EXPIRED', updated_at = NOW()
      WHERE status IN ('UNPAID', 'PAYMENT_PENDING')
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`
  );
  return Number(res.affectedRows || 0);
}

export async function updateInvoiceGateway(params: {
  invoiceId: number;
  status: PaymentInvoiceStatus;
  gatewayOrderId?: string | null;
  snapToken?: string | null;
  snapUrl?: string | null;
  gatewayTxId?: string | null;
  paymentMethod?: string | null;
  gatewayStatus?: string | null;
  gatewayPayload?: unknown;
  paidGateway?: boolean;
}) {
  await pool.execute(
    `UPDATE payment_invoices
        SET status = ?,
            gateway_order_id = COALESCE(?, gateway_order_id),
            snap_token = COALESCE(?, snap_token),
            snap_url = COALESCE(?, snap_url),
            gateway_tx_id = COALESCE(?, gateway_tx_id),
            payment_method = COALESCE(?, payment_method),
            gateway_status = COALESCE(?, gateway_status),
            gateway_payload = COALESCE(?, gateway_payload),
            paid_gateway_at = CASE WHEN ? THEN NOW() ELSE paid_gateway_at END,
            updated_at = NOW()
      WHERE id = ?`,
    [
      params.status,
      params.gatewayOrderId || null,
      params.snapToken || null,
      params.snapUrl || null,
      params.gatewayTxId || null,
      params.paymentMethod || null,
      params.gatewayStatus || null,
      params.gatewayPayload ? JSON.stringify(params.gatewayPayload) : null,
      params.paidGateway ? 1 : 0,
      params.invoiceId,
    ]
  );
}

export async function updateInvoiceStatus(invoiceId: number, status: PaymentInvoiceStatus) {
  await pool.execute(`UPDATE payment_invoices SET status = ?, updated_at = NOW() WHERE id = ?`, [status, invoiceId]);
}

export async function finalizeInvoiceProvider(params: { invoiceId: number; status: PaymentInvoiceStatus; multiPaymentCode: string; results: Array<{ itemCode: string; status: string }> }) {
  await pool.execute(
    `UPDATE payment_invoices
        SET status = ?, multi_payment_code = ?, provider_processed_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [params.status, params.multiPaymentCode, params.invoiceId]
  );
  for (const r of params.results) {
    await pool.execute(
      `UPDATE payment_invoice_items SET status = ?, multi_payment_item_code = ?, updated_at = NOW()
       WHERE invoice_id = ? AND item_code = ?`,
      [r.status === "PENDING" ? "PROCESSING" : r.status, r.itemCode, params.invoiceId, r.itemCode]
    );
  }
}
