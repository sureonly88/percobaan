import pool from "@/lib/db";
import { createNotificationSafe } from "@/lib/notifications";
import { normalizeRole } from "@/lib/rbac";
import { ResultSetHeader, RowDataPacket } from "mysql2";

export const CASHIER_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;

export type CashierClosingStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "REJECTED";
export type CashierShiftCode = "REGULER" | "PAGI" | "SIANG" | "MALAM";

export const CASHIER_SHIFT_OPTIONS: CashierShiftCode[] = ["REGULER", "PAGI", "SIANG", "MALAM"];

export const CASHIER_DISCREPANCY_REASONS = [
  { code: "COUNTING_ERROR", label: "Salah hitung kas" },
  { code: "LATE_TRANSACTION", label: "Transaksi masuk terlambat" },
  { code: "CASH_SHORTAGE", label: "Kurang setor / kas kurang" },
  { code: "CASH_OVERAGE", label: "Kas lebih / kelebihan setor" },
  { code: "MANUAL_ADJUSTMENT", label: "Penyesuaian manual" },
  { code: "OTHER", label: "Lainnya" },
] as const;

export type CashierDiscrepancyReasonCode = (typeof CASHIER_DISCREPANCY_REASONS)[number]["code"];

export class CashierClosingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CashierClosingError";
    this.status = status;
  }
}

export interface CashierClosingDenominationInput {
  denomination: number;
  quantity: number;
}

interface ScopeOptions {
  role?: string | null;
  sessionUsername?: string | null;
  sessionLoketCode?: string | null;
  username?: string | null;
  loketCode?: string | null;
  shiftCode?: string | null;
}

interface OverviewOptions extends ScopeOptions {
  businessDate?: string | null;
}

interface SaveOptions extends ScopeOptions {
  businessDate?: string | null;
  openingCash?: number;
  otherCashAmount?: number;
  retainedCash?: number;
  cashierNote?: string | null;
  discrepancyNote?: string | null;
  discrepancyReasonCode?: string | null;
  proofReference?: string | null;
  proofNote?: string | null;
  denominations?: CashierClosingDenominationInput[];
  action?: "draft" | "submit";
}

interface OpeningOptions extends ScopeOptions {
  businessDate?: string | null;
  openingCash?: number;
  openingNote?: string | null;
}

interface ReviewOptions {
  role?: string | null;
  reviewerUsername?: string | null;
  closingId?: number;
  status?: CashierClosingStatus;
  verifierNote?: string | null;
  receivedAmount?: number | null;
}

interface ReopenRequestOptions {
  role?: string | null;
  requesterUsername?: string | null;
  closingId?: number;
  note?: string | null;
}

interface ApproveReopenOptions {
  role?: string | null;
  reviewerUsername?: string | null;
  closingId?: number;
  note?: string | null;
}

interface ClosingSummaryRow extends RowDataPacket {
  successful_request_count: number | string | null;
  successful_item_count: number | string | null;
  total_tagihan: number | string | null;
  total_admin: number | string | null;
  total_nominal: number | string | null;
}

interface CashierClosingRow extends RowDataPacket {
  id: number;
  business_date: string | Date;
  shift_code: CashierShiftCode | string;
  loket_code: string;
  loket_name: string | null;
  username: string;
  opening_id: number | null;
  opening_cash: number | string | null;
  system_request_count: number | string | null;
  system_transaction_count: number | string | null;
  system_amount_total: number | string | null;
  system_admin_total: number | string | null;
  system_cash_total: number | string | null;
  counted_cash_total: number | string | null;
  other_cash_amount: number | string | null;
  retained_cash: number | string | null;
  deposit_total: number | string | null;
  received_amount: number | string | null;
  received_difference_amount: number | string | null;
  discrepancy_amount: number | string | null;
  cashier_note: string | null;
  discrepancy_note: string | null;
  discrepancy_reason_code: string | null;
  proof_reference: string | null;
  proof_note: string | null;
  status: CashierClosingStatus;
  submitted_at: string | Date | null;
  received_at: string | Date | null;
  received_by: string | null;
  verified_at: string | Date | null;
  verified_by: string | null;
  verifier_note: string | null;
  reopen_requested_at: string | Date | null;
  reopen_requested_by: string | null;
  reopen_request_note: string | null;
  reopened_at: string | Date | null;
  reopened_by: string | null;
  reopen_note: string | null;
  revision_count: number | string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DenominationRow extends RowDataPacket {
  denomination: number | string;
  quantity: number | string;
  subtotal: number | string;
}

interface CashierUserOptionRow extends RowDataPacket {
  username: string;
  display_name: string;
  role: string | null;
  loket_code: string | null;
  loket_name: string | null;
}

interface LoketOptionRow extends RowDataPacket {
  nama: string;
  loket_code: string;
}

interface CashierOpeningRow extends RowDataPacket {
  id: number;
  business_date: string | Date;
  shift_code: CashierShiftCode | string;
  loket_code: string;
  loket_name: string | null;
  username: string;
  opening_cash: number | string | null;
  carried_cash: number | string | null;
  source_closing_id: number | null;
  opening_note: string | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  opened_at: string | Date;
  closed_at: string | Date | null;
  closed_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CashierClosingTrendRow extends RowDataPacket {
  business_date: string | Date;
  total_closings: number | string | null;
  submitted_count: number | string | null;
  verified_count: number | string | null;
  rejected_count: number | string | null;
  discrepancy_count: number | string | null;
  discrepancy_total: number | string | null;
}

interface CashierClosingMonitorRow extends RowDataPacket {
  pending_verification_count: number | string | null;
  reopen_request_count: number | string | null;
  receipt_mismatch_count: number | string | null;
  open_session_count: number | string | null;
}

interface CashierClosingDetailRow extends RowDataPacket {
  id: number;
  provider: string;
  service_type: string;
  customer_id: string;
  customer_name: string | null;
  product_code: string | null;
  period_label: string | null;
  transaction_code: string | null;
  amount: number | string | null;
  admin_fee: number | string | null;
  total: number | string | null;
  transaction_date: string | Date | null;
  username: string | null;
  loket_code: string | null;
  loket_name: string | null;
  multi_payment_code: string | null;
}

function getToday(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function normalizeDate(value?: string | null): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return getToday();
}

function cleanText(value?: string | null): string | null {
  const text = String(value || "").trim();
  return text ? text : null;
}

function normalizeShiftCode(value?: string | null): CashierShiftCode {
  const normalized = String(value || "").trim().toUpperCase();
  if (CASHIER_SHIFT_OPTIONS.includes(normalized as CashierShiftCode)) {
    return normalized as CashierShiftCode;
  }
  return "REGULER";
}

function normalizeDiscrepancyReasonCode(value?: string | null): CashierDiscrepancyReasonCode | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (CASHIER_DISCREPANCY_REASONS.some((item) => item.code === normalized)) {
    return normalized as CashierDiscrepancyReasonCode;
  }
  return null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeMoney(value: unknown): number {
  const num = Math.round(toNumber(value));
  if (num < 0) {
    throw new CashierClosingError("Nominal tidak boleh negatif", 400);
  }
  return num;
}

function formatDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return getToday();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return getToday();
  return date.toISOString().slice(0, 10);
}

function isPrivilegedRole(role?: string | null): boolean {
  const normalized = normalizeRole(role || "");
  return normalized === "admin" || normalized === "supervisor";
}

function resolveScope(options: ScopeOptions) {
  const privileged = isPrivilegedRole(options.role);
  const username = privileged ? cleanText(options.username) : cleanText(options.sessionUsername);
  const loketCode = privileged ? cleanText(options.loketCode) : cleanText(options.sessionLoketCode);
  const shiftCode = normalizeShiftCode(options.shiftCode);
  return { privileged, username, loketCode, shiftCode };
}

function sanitizeDenominations(input: CashierClosingDenominationInput[] | undefined) {
  const quantityMap = new Map<number, number>();
  for (const denom of CASHIER_DENOMINATIONS) {
    quantityMap.set(denom, 0);
  }

  for (const item of input || []) {
    const denomination = Math.round(toNumber(item?.denomination));
    const quantity = Math.max(0, Math.round(toNumber(item?.quantity)));
    if (!quantityMap.has(denomination)) continue;
    quantityMap.set(denomination, quantity);
  }

  return CASHIER_DENOMINATIONS.map((denomination) => {
    const quantity = quantityMap.get(denomination) || 0;
    return {
      denomination,
      quantity,
      subtotal: denomination * quantity,
    };
  });
}

function mapSummary(row?: ClosingSummaryRow | null) {
  const successfulRequestCount = toNumber(row?.successful_request_count);
  const successfulItemCount = toNumber(row?.successful_item_count);
  const totalTagihan = toNumber(row?.total_tagihan);
  const totalAdmin = toNumber(row?.total_admin);
  const totalNominal = toNumber(row?.total_nominal);

  return {
    successfulRequestCount,
    successfulItemCount,
    totalTagihan,
    totalAdmin,
    totalNominal,
    systemCashTotal: totalNominal,
  };
}

function mapClosing(row: CashierClosingRow, denominations: DenominationRow[]) {
  return {
    id: row.id,
    businessDate: formatDateOnly(row.business_date),
    shiftCode: normalizeShiftCode(row.shift_code),
    loketCode: row.loket_code,
    loketName: row.loket_name,
    username: row.username,
    openingId: row.opening_id,
    openingCash: toNumber(row.opening_cash),
    systemRequestCount: toNumber(row.system_request_count),
    systemTransactionCount: toNumber(row.system_transaction_count),
    systemAmountTotal: toNumber(row.system_amount_total),
    systemAdminTotal: toNumber(row.system_admin_total),
    systemCashTotal: toNumber(row.system_cash_total),
    countedCashTotal: toNumber(row.counted_cash_total),
    otherCashAmount: toNumber(row.other_cash_amount),
    retainedCash: toNumber(row.retained_cash),
    depositTotal: toNumber(row.deposit_total),
    receivedAmount: toNumber(row.received_amount),
    receivedDifferenceAmount: toNumber(row.received_difference_amount),
    discrepancyAmount: toNumber(row.discrepancy_amount),
    cashierNote: row.cashier_note,
    discrepancyNote: row.discrepancy_note,
    discrepancyReasonCode: row.discrepancy_reason_code,
    proofReference: row.proof_reference,
    proofNote: row.proof_note,
    status: row.status,
    submittedAt: formatDateTime(row.submitted_at),
    receivedAt: formatDateTime(row.received_at),
    receivedBy: row.received_by,
    verifiedAt: formatDateTime(row.verified_at),
    verifiedBy: row.verified_by,
    verifierNote: row.verifier_note,
    reopenRequestedAt: formatDateTime(row.reopen_requested_at),
    reopenRequestedBy: row.reopen_requested_by,
    reopenRequestNote: row.reopen_request_note,
    reopenedAt: formatDateTime(row.reopened_at),
    reopenedBy: row.reopened_by,
    reopenNote: row.reopen_note,
    revisionCount: toNumber(row.revision_count),
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at),
    denominations: denominations
      .map((item) => ({
        denomination: toNumber(item.denomination),
        quantity: toNumber(item.quantity),
        subtotal: toNumber(item.subtotal),
      }))
      .sort((a, b) => b.denomination - a.denomination),
  };
}

function mapOpening(row: CashierOpeningRow | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    businessDate: formatDateOnly(row.business_date),
    shiftCode: normalizeShiftCode(row.shift_code),
    loketCode: row.loket_code,
    loketName: row.loket_name,
    username: row.username,
    openingCash: toNumber(row.opening_cash),
    carriedCash: toNumber(row.carried_cash),
    sourceClosingId: row.source_closing_id,
    openingNote: row.opening_note,
    status: row.status,
    openedAt: formatDateTime(row.opened_at),
    closedAt: formatDateTime(row.closed_at),
    closedBy: row.closed_by,
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at),
  };
}


async function queryLiveSummary(businessDate: string, username?: string | null, loketCode?: string | null) {
  const where = ["i.status = 'SUCCESS'", "DATE(COALESCE(i.paid_at, i.created_at)) = ?"];
  const params: Array<string | number> = [businessDate];

  if (username) {
    where.push("r.username = ?");
    params.push(username);
  }

  if (loketCode) {
    where.push("r.loket_code = ?");
    params.push(loketCode);
  }

  const [rows] = await pool.query<ClosingSummaryRow[]>(
    `SELECT
        COUNT(DISTINCT r.id) AS successful_request_count,
        COUNT(*) AS successful_item_count,
        COALESCE(SUM(i.amount), 0) AS total_tagihan,
        COALESCE(SUM(i.admin_fee), 0) AS total_admin,
        COALESCE(SUM(i.total), 0) AS total_nominal
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE ${where.join(" AND ")}`,
    params
  );

  return mapSummary(rows[0]);
}

async function queryLiveSummaryByWindow(options: {
  username?: string | null;
  loketCode?: string | null;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
}) {
  const where = ["i.status = 'SUCCESS'"];
  const params: Array<string | number> = [];

  if (options.username) {
    where.push("r.username = ?");
    params.push(options.username);
  }

  if (options.loketCode) {
    where.push("r.loket_code = ?");
    params.push(options.loketCode);
  }

  if (options.startAt) {
    where.push("COALESCE(i.paid_at, i.created_at) >= ?");
    params.push(formatDateTime(options.startAt) || String(options.startAt));
  }

  if (options.endAt) {
    where.push("COALESCE(i.paid_at, i.created_at) <= ?");
    params.push(formatDateTime(options.endAt) || String(options.endAt));
  }

  const [rows] = await pool.query<ClosingSummaryRow[]>(
    `SELECT
        COUNT(DISTINCT r.id) AS successful_request_count,
        COUNT(*) AS successful_item_count,
        COALESCE(SUM(i.amount), 0) AS total_tagihan,
        COALESCE(SUM(i.admin_fee), 0) AS total_admin,
        COALESCE(SUM(i.total), 0) AS total_nominal
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE ${where.join(" AND ")}`,
    params
  );

  return mapSummary(rows[0]);
}

async function getExactClosing(businessDate: string, username: string, loketCode: string, shiftCode: CashierShiftCode) {
  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT *
      FROM cashier_closings
      WHERE business_date = ? AND username = ? AND loket_code = ? AND shift_code = ?
      LIMIT 1`,
    [businessDate, username, loketCode, shiftCode]
  );

  const closing = rows[0];
  if (!closing) return null;

  const [denominations] = await pool.query<DenominationRow[]>(
    `SELECT denomination, quantity, subtotal
      FROM cashier_closing_denominations
      WHERE closing_id = ?
      ORDER BY denomination DESC`,
    [closing.id]
  );

  return mapClosing(closing, denominations);
}

async function getOpeningSession(businessDate: string, username: string, loketCode: string, shiftCode: CashierShiftCode) {
  const [rows] = await pool.query<CashierOpeningRow[]>(
    `SELECT *
      FROM cashier_openings
      WHERE business_date = ? AND username = ? AND loket_code = ? AND shift_code = ?
      LIMIT 1`,
    [businessDate, username, loketCode, shiftCode]
  );

  return mapOpening(rows[0]);
}

async function getLatestCarryForward(username: string, loketCode: string, businessDate: string) {
  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT *
      FROM cashier_closings
      WHERE username = ?
        AND loket_code = ?
        AND business_date < ?
        AND status = 'VERIFIED'
      ORDER BY business_date DESC, updated_at DESC
      LIMIT 1`,
    [username, loketCode, businessDate]
  );

  const latest = rows[0];
  return {
    openingCash: latest ? toNumber(latest.retained_cash) : 0,
    sourceClosingId: latest?.id ?? null,
  };
}

function getBusinessDateRange(businessDate: string) {
  return {
    startAt: `${businessDate} 00:00:00`,
    endAt: `${businessDate} 23:59:59`,
  };
}

async function getProductBreakdown(businessDate: string, username: string, loketCode: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        i.provider,
        i.service_type,
        COUNT(*) AS item_count,
        COALESCE(SUM(i.amount), 0) AS total_tagihan,
        COALESCE(SUM(i.admin_fee), 0) AS total_admin,
        COALESCE(SUM(i.total), 0) AS total
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.status = 'SUCCESS'
        AND r.username = ?
        AND r.loket_code = ?
        AND DATE(COALESCE(i.paid_at, i.created_at)) = ?
      GROUP BY i.provider, i.service_type
      ORDER BY total DESC`,
    [username, loketCode, businessDate]
  );

  return rows.map((row) => ({
    provider: String(row.provider),
    serviceType: String(row.service_type),
    itemCount: toNumber(row.item_count),
    totalTagihan: toNumber(row.total_tagihan),
    totalAdmin: toNumber(row.total_admin),
    total: toNumber(row.total),
  }));
}

async function getClosingTransactionRows(params: {
  username: string;
  loketCode: string;
  startAt: string | Date;
  endAt: string | Date;
}) {
  const [rows] = await pool.query<CashierClosingDetailRow[]>(
    `SELECT
        i.id,
        i.provider,
        i.service_type,
        i.customer_id,
        i.customer_name,
        i.product_code,
        i.period_label,
        i.transaction_code,
        i.amount,
        i.admin_fee,
        i.total,
        COALESCE(i.paid_at, i.created_at) AS transaction_date,
        r.username,
        r.loket_code,
        r.loket_name,
        r.multi_payment_code
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.status = 'SUCCESS'
        AND r.username = ?
        AND r.loket_code = ?
        AND COALESCE(i.paid_at, i.created_at) >= ?
        AND COALESCE(i.paid_at, i.created_at) <= ?
      ORDER BY COALESCE(i.paid_at, i.created_at) DESC, i.id DESC`,
    [
      params.username,
      params.loketCode,
      formatDateTime(params.startAt) || String(params.startAt),
      formatDateTime(params.endAt) || String(params.endAt),
    ]
  );

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    serviceType: row.service_type,
    customerId: row.customer_id,
    customerName: row.customer_name,
    productCode: row.product_code,
    periodLabel: row.period_label,
    transactionCode: row.transaction_code,
    amount: toNumber(row.amount),
    adminFee: toNumber(row.admin_fee),
    total: toNumber(row.total),
    transactionDate: formatDateTime(row.transaction_date),
    username: row.username,
    loketCode: row.loket_code,
    loketName: row.loket_name,
    multiPaymentCode: row.multi_payment_code,
  }));
}

async function getMonitoringSnapshot(scope: {
  businessDate: string;
  username?: string | null;
  loketCode?: string | null;
  shiftCode?: CashierShiftCode;
}) {
  const monitorWhere = ["business_date = ?"];
  const monitorParams: Array<string | number> = [scope.businessDate];

  if (scope.username) {
    monitorWhere.push("username = ?");
    monitorParams.push(scope.username);
  }

  if (scope.loketCode) {
    monitorWhere.push("loket_code = ?");
    monitorParams.push(scope.loketCode);
  }

  if (scope.shiftCode) {
    monitorWhere.push("shift_code = ?");
    monitorParams.push(scope.shiftCode);
  }

  const [monitorRows] = await pool.query<CashierClosingMonitorRow[]>(
    `SELECT
        SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) AS pending_verification_count,
        SUM(CASE WHEN reopen_requested_at IS NOT NULL AND reopened_at IS NULL THEN 1 ELSE 0 END) AS reopen_request_count,
        SUM(CASE WHEN received_at IS NOT NULL AND received_difference_amount != 0 THEN 1 ELSE 0 END) AS receipt_mismatch_count,
        0 AS open_session_count
      FROM cashier_closings
      WHERE ${monitorWhere.join(" AND ")}`,
    monitorParams
  );

  const openingWhere = ["business_date = ?", "status = 'OPEN'"];
  const openingParams: Array<string | number> = [scope.businessDate];

  if (scope.username) {
    openingWhere.push("username = ?");
    openingParams.push(scope.username);
  }

  if (scope.loketCode) {
    openingWhere.push("loket_code = ?");
    openingParams.push(scope.loketCode);
  }

  if (scope.shiftCode) {
    openingWhere.push("shift_code = ?");
    openingParams.push(scope.shiftCode);
  }

  const [openingRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
      FROM cashier_openings
      WHERE ${openingWhere.join(" AND ")}`,
    openingParams
  );

  const trendWhere = ["business_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ?"];
  const trendParams: Array<string | number> = [scope.businessDate, scope.businessDate];

  if (scope.username) {
    trendWhere.push("username = ?");
    trendParams.push(scope.username);
  }

  if (scope.loketCode) {
    trendWhere.push("loket_code = ?");
    trendParams.push(scope.loketCode);
  }

  if (scope.shiftCode) {
    trendWhere.push("shift_code = ?");
    trendParams.push(scope.shiftCode);
  }

  const [trendRows] = await pool.query<CashierClosingTrendRow[]>(
    `SELECT
        business_date,
        COUNT(*) AS total_closings,
        SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) AS submitted_count,
        SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN discrepancy_amount != 0 THEN 1 ELSE 0 END) AS discrepancy_count,
        SUM(ABS(COALESCE(discrepancy_amount, 0))) AS discrepancy_total
      FROM cashier_closings
      WHERE ${trendWhere.join(" AND ")}
      GROUP BY business_date
      ORDER BY business_date ASC`,
    trendParams
  );

  const monitor = monitorRows[0] ?? {
    pending_verification_count: 0,
    reopen_request_count: 0,
    receipt_mismatch_count: 0,
    open_session_count: 0,
  };

  return {
    pendingVerificationCount: toNumber(monitor.pending_verification_count),
    reopenRequestCount: toNumber(monitor.reopen_request_count),
    receiptMismatchCount: toNumber(monitor.receipt_mismatch_count),
    openSessionCount: toNumber(openingRows[0]?.cnt ?? 0),
    trends: trendRows.map((row) => ({
      businessDate: formatDateOnly(row.business_date),
      totalClosings: toNumber(row.total_closings),
      submittedCount: toNumber(row.submitted_count),
      verifiedCount: toNumber(row.verified_count),
      rejectedCount: toNumber(row.rejected_count),
      discrepancyCount: toNumber(row.discrepancy_count),
      discrepancyTotal: toNumber(row.discrepancy_total),
    })),
  };
}

async function getCashierOptions(role?: string | null, sessionUsername?: string | null, sessionLoketCode?: string | null) {
  const [rows] = await pool.query<CashierUserOptionRow[]>(
    `SELECT
        u.username,
        COALESCE(NULLIF(u.name, ''), u.username) AS display_name,
        COALESCE(u.role, 'kasir') AS role,
        l.loket_code,
        l.nama AS loket_name
      FROM users u
      LEFT JOIN lokets l ON u.loket_id = l.id
      WHERE l.loket_code IS NOT NULL
        AND COALESCE(u.role, 'kasir') <> 'switcher'
      ORDER BY l.nama ASC, display_name ASC`
  );

  let mapped = rows.map((row) => ({
    username: row.username,
    displayName: row.display_name,
    role: row.role || "kasir",
    loketCode: row.loket_code || "",
    loketName: row.loket_name || row.loket_code || "-",
  }));

  if (!isPrivilegedRole(role)) {
    mapped = mapped.filter((item) => {
      return item.username === cleanText(sessionUsername) && item.loketCode === cleanText(sessionLoketCode);
    });

    if (mapped.length === 0 && cleanText(sessionUsername) && cleanText(sessionLoketCode)) {
      mapped = [
        {
          username: cleanText(sessionUsername) || "",
          displayName: cleanText(sessionUsername) || "",
          role: normalizeRole(role || ""),
          loketCode: cleanText(sessionLoketCode) || "",
          loketName: cleanText(sessionLoketCode) || "",
        },
      ];
    }
  }

  return mapped;
}

async function getLoketOptions(role?: string | null, sessionLoketCode?: string | null) {
  const [rows] = await pool.query<LoketOptionRow[]>(
    `SELECT nama, loket_code
      FROM lokets
      WHERE nama IS NOT NULL AND nama != ''
      ORDER BY nama ASC`
  );

  let mapped = rows.map((row) => ({ nama: row.nama, loketCode: row.loket_code }));
  if (!isPrivilegedRole(role)) {
    mapped = mapped.filter((item) => item.loketCode === cleanText(sessionLoketCode));
    if (mapped.length === 0 && cleanText(sessionLoketCode)) {
      mapped = [{ nama: cleanText(sessionLoketCode) || "", loketCode: cleanText(sessionLoketCode) || "" }];
    }
  }

  return mapped;
}

export async function getCashierClosingOverview(options: OverviewOptions) {
  const businessDate = normalizeDate(options.businessDate);
  const scope = resolveScope(options);

  if (!scope.privileged && (!scope.username || !scope.loketCode)) {
    throw new CashierClosingError("Akun Anda belum terhubung ke loket kasir", 400);
  }

  const historyWhere = ["business_date = ?", "shift_code = ?"];
  const historyParams: Array<string | number> = [businessDate, scope.shiftCode];

  if (!scope.privileged || scope.username) {
    historyWhere.push("username = ?");
    historyParams.push(scope.username || "");
  }

  if (!scope.privileged || scope.loketCode) {
    historyWhere.push("loket_code = ?");
    historyParams.push(scope.loketCode || "");
  }

  const historyPromise = pool.query<CashierClosingRow[]>(
    `SELECT *
      FROM cashier_closings
      WHERE ${historyWhere.join(" AND ")}
      ORDER BY updated_at DESC, id DESC
      LIMIT 30`,
    historyParams
  );

  const openingPromise = scope.username && scope.loketCode
    ? getOpeningSession(businessDate, scope.username, scope.loketCode, scope.shiftCode)
    : Promise.resolve(null);
  const exactClosingPromise = scope.username && scope.loketCode
    ? getExactClosing(businessDate, scope.username, scope.loketCode, scope.shiftCode)
    : Promise.resolve(null);
  const carryForwardPromise = scope.username && scope.loketCode
    ? getLatestCarryForward(scope.username, scope.loketCode, businessDate)
    : Promise.resolve({ openingCash: 0, sourceClosingId: null });

  const [historyResult, cashierOptions, loketOptions, closing, carryForward] = await Promise.all([
    historyPromise,
    getCashierOptions(options.role, options.sessionUsername, options.sessionLoketCode),
    getLoketOptions(options.role, options.sessionLoketCode),
    exactClosingPromise,
    carryForwardPromise,
  ]);

  const windowRange = getBusinessDateRange(businessDate);
  const summaryWindow = {
    startAt: windowRange.startAt,
    endAt: closing?.submittedAt || windowRange.endAt,
  };

  const [summary, productBreakdown] = await Promise.all([
    scope.username && scope.loketCode
      ? queryLiveSummaryByWindow({
          username: scope.username,
          loketCode: scope.loketCode,
          startAt: summaryWindow.startAt,
          endAt: summaryWindow.endAt,
        })
      : queryLiveSummary(businessDate, scope.username, scope.loketCode),
    scope.username && scope.loketCode
      ? getProductBreakdown(businessDate, scope.username, scope.loketCode)
      : Promise.resolve([]),
  ]);

  const [historyRows] = historyResult;
  const history = historyRows.map((row) => ({
    id: row.id,
    businessDate: formatDateOnly(row.business_date),
    shiftCode: normalizeShiftCode(row.shift_code),
    loketCode: row.loket_code,
    loketName: row.loket_name,
    username: row.username,
    openingId: row.opening_id,
    openingCash: toNumber(row.opening_cash),
    systemCashTotal: toNumber(row.system_cash_total),
    countedCashTotal: toNumber(row.counted_cash_total),
    retainedCash: toNumber(row.retained_cash),
    depositTotal: toNumber(row.deposit_total),
    receivedAmount: toNumber(row.received_amount),
    receivedDifferenceAmount: toNumber(row.received_difference_amount),
    discrepancyAmount: toNumber(row.discrepancy_amount),
    discrepancyReasonCode: row.discrepancy_reason_code,
    proofReference: row.proof_reference,
    status: row.status,
    submittedAt: formatDateTime(row.submitted_at),
    receivedAt: formatDateTime(row.received_at),
    receivedBy: row.received_by,
    verifiedAt: formatDateTime(row.verified_at),
    verifiedBy: row.verified_by,
    reopenRequestedAt: formatDateTime(row.reopen_requested_at),
    reopenRequestedBy: row.reopen_requested_by,
    revisionCount: toNumber(row.revision_count),
    updatedAt: formatDateTime(row.updated_at),
  }));

  const effectiveSummary = closing
    ? {
        successfulRequestCount: closing.systemRequestCount,
        successfulItemCount: closing.systemTransactionCount,
        totalTagihan: closing.systemAmountTotal,
        totalAdmin: closing.systemAdminTotal,
        totalNominal: closing.systemCashTotal,
        systemCashTotal: closing.systemCashTotal,
      }
    : summary;

  return {
    businessDate,
    shiftCode: scope.shiftCode,
    discrepancyReasons: [...CASHIER_DISCREPANCY_REASONS],
    filters: {
      canSelectAll: scope.privileged,
      username: scope.username,
      loketCode: scope.loketCode,
    },
    summary,
    effectiveSummary,
    suggestedOpeningCash: carryForward.openingCash,
    carrySourceClosingId: carryForward.sourceClosingId,
    closing,
    history,
    productBreakdown,
    cashierOptions,
    loketOptions,
    denominations: [...CASHIER_DENOMINATIONS],
  };
}

async function resolveCashierIdentity(username: string, loketCode: string) {
  const [rows] = await pool.query<CashierUserOptionRow[]>(
    `SELECT
        u.username,
        COALESCE(NULLIF(u.name, ''), u.username) AS display_name,
        COALESCE(u.role, 'kasir') AS role,
        l.loket_code,
        l.nama AS loket_name
      FROM users u
      LEFT JOIN lokets l ON u.loket_id = l.id
      WHERE u.username = ?
      LIMIT 1`,
    [username]
  );

  const row = rows[0];
  if (!row) {
    throw new CashierClosingError("Kasir tidak ditemukan", 404);
  }

  if (row.loket_code && row.loket_code !== loketCode) {
    throw new CashierClosingError("Kasir tidak terdaftar pada loket yang dipilih", 400);
  }

  return {
    username: row.username,
    loketCode,
    loketName: row.loket_name || loketCode,
  };
}

function buildClosingLink(businessDate: string, username: string, loketCode: string) {
  const params = new URLSearchParams({ businessDate, username, loketCode });
  return `/tutup-kasir?${params.toString()}`;
}

export async function saveCashierClosing(options: SaveOptions) {
  const businessDate = normalizeDate(options.businessDate);
  const scope = resolveScope(options);
  const action = options.action === "submit" ? "submit" : "draft";

  if (!scope.username || !scope.loketCode) {
    throw new CashierClosingError("Kasir dan loket wajib dipilih", 400);
  }

  const discrepancyReasonCode = normalizeDiscrepancyReasonCode(options.discrepancyReasonCode);
  const proofReference = cleanText(options.proofReference);
  const proofNote = cleanText(options.proofNote);
  const otherCashAmount = normalizeMoney(options.otherCashAmount);
  const retainedCash = normalizeMoney(options.retainedCash);
  const cashierNote = cleanText(options.cashierNote);
  const discrepancyNote = cleanText(options.discrepancyNote);
  const sanitizedDenominations = sanitizeDenominations(options.denominations);
  const denominationTotal = sanitizedDenominations.reduce((sum, item) => sum + item.subtotal, 0);
  const countedCashTotal = denominationTotal + otherCashAmount;

  if (retainedCash > countedCashTotal) {
    throw new CashierClosingError("Uang yang ditahan tidak boleh melebihi total kas fisik", 400);
  }

  const openingSession = await getOpeningSession(businessDate, scope.username, scope.loketCode, scope.shiftCode);

  const summary = await queryLiveSummary(businessDate, scope.username, scope.loketCode);
  const openingCashInput = hasValue(options.openingCash) ? normalizeMoney(options.openingCash) : null;
  const carryForward = await getLatestCarryForward(scope.username, scope.loketCode, businessDate);
  const openingCash = openingCashInput ?? toNumber(openingSession?.openingCash) ?? carryForward.openingCash;
  const expectedCash = openingCash + summary.systemCashTotal;
  const discrepancyAmount = countedCashTotal - expectedCash;

  if (action === "submit" && discrepancyAmount !== 0 && !discrepancyNote) {
    throw new CashierClosingError("Catatan selisih wajib diisi saat ada selisih kas", 400);
  }
  if (action === "submit" && discrepancyAmount !== 0 && !discrepancyReasonCode) {
    throw new CashierClosingError("Alasan selisih wajib dipilih saat ada selisih kas", 400);
  }

  const cashier = await resolveCashierIdentity(scope.username, scope.loketCode);
  const status: CashierClosingStatus = action === "submit" ? "SUBMITTED" : "DRAFT";
  const depositTotal = countedCashTotal - retainedCash;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query<CashierClosingRow[]>(
      `SELECT *
        FROM cashier_closings
        WHERE business_date = ? AND username = ? AND loket_code = ? AND shift_code = ?
        LIMIT 1
        FOR UPDATE`,
      [businessDate, cashier.username, cashier.loketCode, scope.shiftCode]
    );

    const existing = existingRows[0];
    if (existing && (existing.status === "SUBMITTED" || existing.status === "VERIFIED")) {
      throw new CashierClosingError("Closing yang sudah diajukan/diverifikasi tidak dapat diubah lagi", 409);
    }

    let closingId = existing?.id || 0;
    if (!existing) {
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO cashier_closings (
            business_date, shift_code, loket_code, loket_name, username, opening_id,
            opening_cash, system_request_count, system_transaction_count,
            system_amount_total, system_admin_total, system_cash_total,
            counted_cash_total, other_cash_amount, retained_cash, deposit_total,
            discrepancy_amount, cashier_note, discrepancy_note, discrepancy_reason_code, proof_reference, proof_note, status,
            submitted_at, verified_at, verified_by, verifier_note,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
        [
          businessDate,
          scope.shiftCode,
          cashier.loketCode,
          cashier.loketName,
          cashier.username,
          openingSession?.id ?? null,
          openingCash,
          summary.successfulRequestCount,
          summary.successfulItemCount,
          summary.totalTagihan,
          summary.totalAdmin,
          summary.systemCashTotal,
          countedCashTotal,
          otherCashAmount,
          retainedCash,
          depositTotal,
          discrepancyAmount,
          cashierNote,
          discrepancyNote,
          discrepancyReasonCode,
          proofReference,
          proofNote,
          status,
          action === "submit" ? new Date() : null,
        ]
      );

      closingId = insertResult.insertId;
    } else {
      await connection.execute<ResultSetHeader>(
        `UPDATE cashier_closings
          SET loket_name = ?,
              opening_id = ?,
              opening_cash = ?,
              system_request_count = ?,
              system_transaction_count = ?,
              system_amount_total = ?,
              system_admin_total = ?,
              system_cash_total = ?,
              counted_cash_total = ?,
              other_cash_amount = ?,
              retained_cash = ?,
              deposit_total = ?,
              received_amount = 0,
              received_difference_amount = 0,
              discrepancy_amount = ?,
              cashier_note = ?,
              discrepancy_note = ?,
              discrepancy_reason_code = ?,
              proof_reference = ?,
              proof_note = ?,
              status = ?,
              submitted_at = ?,
              received_at = NULL,
              received_by = NULL,
              verified_at = NULL,
              verified_by = NULL,
              verifier_note = NULL,
              updated_at = NOW()
          WHERE id = ?`,
        [
          cashier.loketName,
          openingSession?.id ?? null,
          openingCash,
          summary.successfulRequestCount,
          summary.successfulItemCount,
          summary.totalTagihan,
          summary.totalAdmin,
          summary.systemCashTotal,
          countedCashTotal,
          otherCashAmount,
          retainedCash,
          depositTotal,
          discrepancyAmount,
          cashierNote,
          discrepancyNote,
          discrepancyReasonCode,
          proofReference,
          proofNote,
          status,
          action === "submit" ? new Date() : null,
          existing.id,
        ]
      );
      closingId = existing.id;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM cashier_closing_denominations WHERE closing_id = ?`,
      [closingId]
    );

    for (const denomination of sanitizedDenominations) {
      if (denomination.quantity <= 0) continue;
      await connection.execute<ResultSetHeader>(
        `INSERT INTO cashier_closing_denominations
          (closing_id, denomination, quantity, subtotal, created_at, updated_at)
          VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [closingId, denomination.denomination, denomination.quantity, denomination.subtotal]
      );
    }

    if (action === "submit" && openingSession?.id) {
      await connection.execute<ResultSetHeader>(
        `UPDATE cashier_openings
          SET status = 'CLOSED',
              closed_at = NOW(),
              closed_by = ?,
              updated_at = NOW()
          WHERE id = ?`,
        [cashier.username, openingSession.id]
      );
    }

    await connection.commit();

    if (action === "submit") {
      const severity = discrepancyAmount === 0 ? "info" : "warning";
      const link = buildClosingLink(businessDate, cashier.username, cashier.loketCode);
      const message = `Closing ${cashier.username} untuk loket ${cashier.loketCode} tanggal ${businessDate} diajukan. Setoran Rp ${depositTotal.toLocaleString("id-ID")}${discrepancyAmount !== 0 ? `, selisih Rp ${Math.abs(discrepancyAmount).toLocaleString("id-ID")}` : ""}.`;

      await createNotificationSafe({
        recipientRole: "admin",
        category: "transaksi",
        severity,
        title: "Closing Kasir Diajukan",
        message,
        link,
      });
      await createNotificationSafe({
        recipientRole: "supervisor",
        category: "transaksi",
        severity,
        title: "Closing Kasir Diajukan",
        message,
        link,
      });
    }

    return {
      success: true,
      closingId,
      status,
      businessDate,
      shiftCode: scope.shiftCode,
      username: cashier.username,
      loketCode: cashier.loketCode,
      countedCashTotal,
      depositTotal,
      discrepancyAmount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reviewCashierClosing(options: ReviewOptions) {
  const reviewerRole = normalizeRole(options.role || "");
  if (reviewerRole !== "admin" && reviewerRole !== "supervisor") {
    throw new CashierClosingError("Hanya admin/supervisor yang dapat memverifikasi closing", 403);
  }

  const closingId = Math.round(toNumber(options.closingId));
  if (!closingId) {
    throw new CashierClosingError("ID closing tidak valid", 400);
  }

  const status = options.status;
  if (status !== "VERIFIED" && status !== "REJECTED") {
    throw new CashierClosingError("Status verifikasi tidak valid", 400);
  }

  const verifierNote = cleanText(options.verifierNote);
  const receivedAmount = hasValue(options.receivedAmount) ? normalizeMoney(options.receivedAmount) : null;
  if (status === "REJECTED" && !verifierNote) {
    throw new CashierClosingError("Catatan verifikasi wajib diisi saat menolak closing", 400);
  }
  if (status === "VERIFIED" && receivedAmount === null) {
    throw new CashierClosingError("Nominal setoran yang diterima admin wajib diisi", 400);
  }

  const reviewerUsername = cleanText(options.reviewerUsername) || reviewerRole;

  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT * FROM cashier_closings WHERE id = ? LIMIT 1`,
    [closingId]
  );

  const closing = rows[0];
  if (!closing) {
    throw new CashierClosingError("Data closing tidak ditemukan", 404);
  }

  if (closing.status !== "SUBMITTED") {
    throw new CashierClosingError("Hanya closing berstatus diajukan yang dapat diproses", 409);
  }

  const submittedDepositTotal = toNumber(closing.deposit_total);
  const receivedDifferenceAmount = receivedAmount !== null ? receivedAmount - submittedDepositTotal : 0;

  await pool.execute<ResultSetHeader>(
    `UPDATE cashier_closings
      SET status = ?,
          received_amount = ?,
          received_difference_amount = ?,
          received_at = ?,
          received_by = ?,
          verified_at = NOW(),
          verified_by = ?,
          verifier_note = ?,
          updated_at = NOW()
      WHERE id = ?`,
    [
      status,
      receivedAmount ?? 0,
      receivedDifferenceAmount,
      receivedAmount !== null ? new Date() : null,
      receivedAmount !== null ? reviewerUsername : null,
      reviewerUsername,
      verifierNote,
      closingId,
    ]
  );

  const businessDate = formatDateOnly(closing.business_date);
  const link = buildClosingLink(businessDate, closing.username, closing.loket_code);
  const severity = status === "VERIFIED"
    ? (receivedDifferenceAmount === 0 ? "success" : "warning")
    : "warning";
  const title = status === "VERIFIED" ? "Closing Kasir Diverifikasi" : "Closing Kasir Ditolak";
  const message = status === "VERIFIED"
    ? `Closing Anda untuk loket ${closing.loket_code} tanggal ${businessDate} telah diverifikasi oleh ${reviewerUsername}. Setoran diajukan Rp ${submittedDepositTotal.toLocaleString("id-ID")}, diterima admin Rp ${(receivedAmount ?? 0).toLocaleString("id-ID")}${receivedDifferenceAmount !== 0 ? `, selisih admin Rp ${Math.abs(receivedDifferenceAmount).toLocaleString("id-ID")}` : ""}.`
    : `Closing Anda untuk loket ${closing.loket_code} tanggal ${businessDate} ditolak oleh ${reviewerUsername}.${receivedAmount !== null ? ` Nominal diterima admin Rp ${receivedAmount.toLocaleString("id-ID")}.` : ""}${verifierNote ? ` Catatan: ${verifierNote}` : ""}`;

  await createNotificationSafe({
    recipientUsername: closing.username,
    category: "transaksi",
    severity,
    title,
    message,
    link,
  });

  return {
    success: true,
    closingId,
    status,
    receivedAmount: receivedAmount ?? 0,
    receivedDifferenceAmount,
  };
}

export async function openCashierSession(options: OpeningOptions) {
  const businessDate = normalizeDate(options.businessDate);
  const scope = resolveScope(options);

  if (!scope.username || !scope.loketCode) {
    throw new CashierClosingError("Kasir dan loket wajib dipilih untuk buka kas", 400);
  }

  const cashier = await resolveCashierIdentity(scope.username, scope.loketCode);
  const carryForward = await getLatestCarryForward(cashier.username, cashier.loketCode, businessDate);
  const openingCash = hasValue(options.openingCash) ? normalizeMoney(options.openingCash) : carryForward.openingCash;
  const openingNote = cleanText(options.openingNote);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [closingRows] = await connection.query<CashierClosingRow[]>(
      `SELECT *
        FROM cashier_closings
        WHERE business_date = ? AND username = ? AND loket_code = ? AND shift_code = ?
        LIMIT 1
        FOR UPDATE`,
      [businessDate, cashier.username, cashier.loketCode, scope.shiftCode]
    );

    const existingClosing = closingRows[0];
    if (existingClosing && ["SUBMITTED", "VERIFIED"].includes(existingClosing.status) && !existingClosing.reopened_at) {
      throw new CashierClosingError("Shift ini sudah ditutup. Ajukan reopen jika ingin membuka kembali.", 409);
    }

    const [openingRows] = await connection.query<CashierOpeningRow[]>(
      `SELECT *
        FROM cashier_openings
        WHERE business_date = ? AND username = ? AND loket_code = ? AND shift_code = ?
        LIMIT 1
        FOR UPDATE`,
      [businessDate, cashier.username, cashier.loketCode, scope.shiftCode]
    );

    const existingOpening = openingRows[0];
    let openingId = existingOpening?.id || 0;
    if (!existingOpening) {
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO cashier_openings (
            business_date, shift_code, loket_code, loket_name, username,
            opening_cash, carried_cash, source_closing_id, opening_note,
            status, opened_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', NOW(), NOW(), NOW())`,
        [
          businessDate,
          scope.shiftCode,
          cashier.loketCode,
          cashier.loketName,
          cashier.username,
          openingCash,
          carryForward.openingCash,
          carryForward.sourceClosingId,
          openingNote,
        ]
      );
      openingId = insertResult.insertId;
    } else {
      await connection.execute<ResultSetHeader>(
        `UPDATE cashier_openings
          SET loket_name = ?,
              opening_cash = ?,
              carried_cash = ?,
              source_closing_id = ?,
              opening_note = ?,
              status = 'OPEN',
              opened_at = COALESCE(opened_at, NOW()),
              closed_at = NULL,
              closed_by = NULL,
              updated_at = NOW()
          WHERE id = ?`,
        [
          cashier.loketName,
          openingCash,
          carryForward.openingCash,
          carryForward.sourceClosingId,
          openingNote,
          existingOpening.id,
        ]
      );
      openingId = existingOpening.id;
    }

    await connection.commit();

    const openingSession = await getOpeningSession(businessDate, cashier.username, cashier.loketCode, scope.shiftCode);
    return {
      success: true,
      businessDate,
      shiftCode: scope.shiftCode,
      openingSession,
      suggestedOpeningCash: carryForward.openingCash,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function requestCashierClosingReopen(options: ReopenRequestOptions) {
  const closingId = Math.round(toNumber(options.closingId));
  const requesterUsername = cleanText(options.requesterUsername);
  const requesterRole = normalizeRole(options.role || "");
  const note = cleanText(options.note);

  if (!closingId) {
    throw new CashierClosingError("ID closing tidak valid", 400);
  }
  if (!requesterUsername) {
    throw new CashierClosingError("User pengaju reopen tidak valid", 401);
  }
  if (!note) {
    throw new CashierClosingError("Catatan permintaan reopen wajib diisi", 400);
  }

  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT * FROM cashier_closings WHERE id = ? LIMIT 1`,
    [closingId]
  );

  const closing = rows[0];
  if (!closing) {
    throw new CashierClosingError("Data closing tidak ditemukan", 404);
  }
  if (requesterRole === "kasir" && closing.username !== requesterUsername) {
    throw new CashierClosingError("Anda hanya bisa request reopen untuk closing milik sendiri", 403);
  }
  if (closing.status === "DRAFT") {
    throw new CashierClosingError("Closing draft tidak perlu diajukan reopen", 409);
  }
  if (closing.reopen_requested_at && !closing.reopened_at) {
    throw new CashierClosingError("Permintaan reopen sudah diajukan dan menunggu persetujuan", 409);
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE cashier_closings
      SET reopen_requested_at = NOW(),
          reopen_requested_by = ?,
          reopen_request_note = ?,
          updated_at = NOW()
      WHERE id = ?`,
    [requesterUsername, note, closingId]
  );

  const businessDate = formatDateOnly(closing.business_date);
  const link = buildClosingLink(businessDate, closing.username, closing.loket_code);
  const message = `Kasir ${closing.username} mengajukan reopen closing ${closing.loket_code} tanggal ${businessDate}. Alasan: ${note}`;
  await createNotificationSafe({
    recipientRole: "admin",
    category: "transaksi",
    severity: "warning",
    title: "Permintaan Reopen Closing",
    message,
    link,
  });
  await createNotificationSafe({
    recipientRole: "supervisor",
    category: "transaksi",
    severity: "warning",
    title: "Permintaan Reopen Closing",
    message,
    link,
  });

  return { success: true, closingId };
}

export async function approveCashierClosingReopen(options: ApproveReopenOptions) {
  const reviewerRole = normalizeRole(options.role || "");
  if (reviewerRole !== "admin" && reviewerRole !== "supervisor") {
    throw new CashierClosingError("Hanya admin/supervisor yang dapat menyetujui reopen", 403);
  }

  const closingId = Math.round(toNumber(options.closingId));
  const reviewerUsername = cleanText(options.reviewerUsername) || reviewerRole;
  const note = cleanText(options.note);

  if (!closingId) {
    throw new CashierClosingError("ID closing tidak valid", 400);
  }

  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT * FROM cashier_closings WHERE id = ? LIMIT 1`,
    [closingId]
  );

  const closing = rows[0];
  if (!closing) {
    throw new CashierClosingError("Data closing tidak ditemukan", 404);
  }
  if (closing.reopened_at) {
    throw new CashierClosingError("Closing ini sudah pernah di-reopen sebelumnya", 409);
  }
  // Admin/supervisor bisa force-reopen langsung tanpa menunggu request dari kasir
  const needsAutoRequest = !closing.reopen_requested_at;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (closing.opening_id) {
      await connection.execute<ResultSetHeader>(
        `UPDATE cashier_openings
          SET status = 'OPEN',
              closed_at = NULL,
              closed_by = NULL,
              updated_at = NOW()
          WHERE id = ?`,
        [closing.opening_id]
      );
    } else {
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO cashier_openings (
            business_date, shift_code, loket_code, loket_name, username,
            opening_cash, carried_cash, source_closing_id, opening_note,
            status, opened_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', NOW(), NOW(), NOW())`,
        [
          formatDateOnly(closing.business_date),
          normalizeShiftCode(closing.shift_code),
          closing.loket_code,
          closing.loket_name,
          closing.username,
          toNumber(closing.opening_cash),
          toNumber(closing.opening_cash),
          null,
          note || `Reopen closing #${closing.id}`,
        ]
      );

      await connection.execute<ResultSetHeader>(
        `UPDATE cashier_closings SET opening_id = ? WHERE id = ?`,
        [insertResult.insertId, closing.id]
      );
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE cashier_closings
        SET status = 'DRAFT',
            submitted_at = NULL,
            received_amount = 0,
            received_difference_amount = 0,
            received_at = NULL,
            received_by = NULL,
            verified_at = NULL,
            verified_by = NULL,
            verifier_note = NULL,
            reopen_requested_at = COALESCE(reopen_requested_at, NOW()),
            reopen_requested_by = COALESCE(reopen_requested_by, ?),
            reopen_request_note = COALESCE(reopen_request_note, ?),
            reopened_at = NOW(),
            reopened_by = ?,
            reopen_note = ?,
            revision_count = COALESCE(revision_count, 0) + 1,
            updated_at = NOW()
        WHERE id = ?`,
      [reviewerUsername, note || `Force reopen oleh ${reviewerUsername}`, reviewerUsername, note, closing.id]
    );

    await connection.commit();

    const businessDate = formatDateOnly(closing.business_date);
    await createNotificationSafe({
      recipientUsername: closing.username,
      category: "transaksi",
      severity: "info",
      title: "Permintaan Reopen Disetujui",
      message: `Closing loket ${closing.loket_code} tanggal ${businessDate} dibuka kembali oleh ${reviewerUsername}.${note ? ` Catatan: ${note}` : ""}`,
      link: buildClosingLink(businessDate, closing.username, closing.loket_code),
    });

    return { success: true, closingId: closing.id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function assertCashierCanProcessPayment(options: { username: string; loketCode: string }) {
  const businessDate = getToday();
  const [closingRows] = await pool.query<RowDataPacket[]>(
    `SELECT status
      FROM cashier_closings
      WHERE business_date = ?
        AND username = ?
        AND loket_code = ?
        AND status IN ('SUBMITTED', 'VERIFIED')
      LIMIT 1`,
    [businessDate, options.username, options.loketCode]
  );

  if (closingRows.length > 0) {
    throw new CashierClosingError("Kasir sudah menutup loket untuk hari ini. Ajukan reopen jika perlu koreksi.", 409);
  }
}

export async function getAllClosingsForReview(options: {
  role?: string | null;
  businessDate?: string | null;
  status?: string | null;
}) {
  const role = normalizeRole(options.role || "");
  if (role !== "admin" && role !== "supervisor") {
    throw new CashierClosingError("Hanya admin/supervisor yang dapat mengakses halaman verifikasi", 403);
  }

  const businessDate = normalizeDate(options.businessDate);
  const statusFilter = options.status || null;

  const where = ["business_date = ?"];
  const params: Array<string | number> = [businessDate];

  if (statusFilter && ["SUBMITTED", "VERIFIED", "REJECTED", "DRAFT"].includes(statusFilter)) {
    where.push("status = ?");
    params.push(statusFilter);
  } else {
    where.push("status IN ('SUBMITTED', 'DRAFT', 'REJECTED')");
  }

  const [rows] = await pool.query<CashierClosingRow[]>(
    `SELECT * FROM cashier_closings WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 100`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    businessDate: formatDateOnly(row.business_date),
    loketCode: row.loket_code,
    loketName: row.loket_name,
    username: row.username,
    openingCash: toNumber(row.opening_cash),
    systemCashTotal: toNumber(row.system_cash_total),
    countedCashTotal: toNumber(row.counted_cash_total),
    retainedCash: toNumber(row.retained_cash),
    depositTotal: toNumber(row.deposit_total),
    receivedAmount: toNumber(row.received_amount),
    receivedDifferenceAmount: toNumber(row.received_difference_amount),
    discrepancyAmount: toNumber(row.discrepancy_amount),
    discrepancyReasonCode: row.discrepancy_reason_code,
    cashierNote: row.cashier_note,
    discrepancyNote: row.discrepancy_note,
    proofReference: row.proof_reference,
    status: row.status,
    submittedAt: formatDateTime(row.submitted_at),
    receivedAt: formatDateTime(row.received_at),
    receivedBy: row.received_by,
    verifiedAt: formatDateTime(row.verified_at),
    verifiedBy: row.verified_by,
    verifierNote: row.verifier_note,
    reopenRequestedAt: formatDateTime(row.reopen_requested_at),
    reopenRequestedBy: row.reopen_requested_by,
    reopenRequestNote: row.reopen_request_note,
    revisionCount: toNumber(row.revision_count),
    updatedAt: formatDateTime(row.updated_at),
  }));
}