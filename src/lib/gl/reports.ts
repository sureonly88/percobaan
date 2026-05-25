import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { ACCOUNT_TYPES, NORMAL_BALANCE, type AccountType } from "./accounts";

export interface AccountRow {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: "DEBIT" | "CREDIT";
  parentCode: string | null;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
}

export async function listAccounts(opts?: { activeOnly?: boolean }): Promise<AccountRow[]> {
  const where = opts?.activeOnly ? "WHERE is_active = 1" : "";
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT code, name, account_type, normal_balance, parent_code,
            description, is_active, is_system
       FROM gl_accounts ${where}
      ORDER BY code ASC`
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    accountType: r.account_type,
    normalBalance: r.normal_balance,
    parentCode: r.parent_code,
    description: r.description,
    isActive: !!r.is_active,
    isSystem: !!r.is_system,
  }));
}

export interface JournalEntryFilter {
  from?: string;
  to?: string;
  sourceType?: string;
  provider?: string;
  loketCode?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface JournalEntryListItem {
  id: number;
  entryNo: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  loketCode: string | null;
  provider: string | null;
  totalDebit: number;
  totalCredit: number;
  reversesEntryId: number | null;
  createdBy: string | null;
  createdAt: string;
}

export async function listJournalEntries(
  filter: JournalEntryFilter = {}
): Promise<{ items: JournalEntryListItem[]; total: number }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.from) {
    where.push("entry_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("entry_date <= ?");
    params.push(filter.to);
  }
  if (filter.sourceType) {
    where.push("source_type = ?");
    params.push(filter.sourceType);
  }
  if (filter.provider) {
    where.push("provider = ?");
    params.push(filter.provider);
  }
  if (filter.loketCode) {
    where.push("loket_code = ?");
    params.push(filter.loketCode);
  }
  if (filter.search) {
    where.push("(entry_no LIKE ? OR description LIKE ? OR source_id LIKE ?)");
    const s = `%${filter.search}%`;
    params.push(s, s, s);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM gl_journal_entries ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, entry_no, entry_date, description, source_type, source_id,
            loket_code, provider, total_debit, total_credit,
            reverses_entry_id, created_by, created_at
       FROM gl_journal_entries
       ${whereSql}
       ORDER BY entry_date DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    total,
    items: rows.map((r) => ({
      id: Number(r.id),
      entryNo: r.entry_no,
      entryDate: String(r.entry_date).slice(0, 10),
      description: r.description,
      sourceType: r.source_type,
      sourceId: r.source_id,
      loketCode: r.loket_code,
      provider: r.provider,
      totalDebit: Number(r.total_debit),
      totalCredit: Number(r.total_credit),
      reversesEntryId: r.reverses_entry_id ? Number(r.reverses_entry_id) : null,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
  };
}

export interface JournalLineDetail {
  lineNo: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export async function getJournalEntryDetail(entryId: number): Promise<{
  entry: JournalEntryListItem | null;
  lines: JournalLineDetail[];
}> {
  const [entryRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, entry_no, entry_date, description, source_type, source_id,
            loket_code, provider, total_debit, total_credit,
            reverses_entry_id, created_by, created_at
       FROM gl_journal_entries WHERE id = ? LIMIT 1`,
    [entryId]
  );
  if (entryRows.length === 0) return { entry: null, lines: [] };
  const e = entryRows[0];
  const entry: JournalEntryListItem = {
    id: Number(e.id),
    entryNo: e.entry_no,
    entryDate: String(e.entry_date).slice(0, 10),
    description: e.description,
    sourceType: e.source_type,
    sourceId: e.source_id,
    loketCode: e.loket_code,
    provider: e.provider,
    totalDebit: Number(e.total_debit),
    totalCredit: Number(e.total_credit),
    reversesEntryId: e.reverses_entry_id ? Number(e.reverses_entry_id) : null,
    createdBy: e.created_by,
    createdAt: e.created_at,
  };

  const [lineRows] = await pool.query<RowDataPacket[]>(
    `SELECT l.line_no, l.account_code, a.name AS account_name,
            l.debit, l.credit, l.memo
       FROM gl_journal_lines l
       LEFT JOIN gl_accounts a ON a.code = l.account_code
      WHERE l.entry_id = ?
      ORDER BY l.line_no ASC`,
    [entryId]
  );
  return {
    entry,
    lines: lineRows.map((r) => ({
      lineNo: Number(r.line_no),
      accountCode: r.account_code,
      accountName: r.account_name ?? r.account_code,
      debit: Number(r.debit),
      credit: Number(r.credit),
      memo: r.memo,
    })),
  };
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: "DEBIT" | "CREDIT";
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export async function getTrialBalance(opts?: {
  from?: string;
  to?: string;
  loketCode?: string;
}): Promise<TrialBalanceRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.from) {
    where.push("e.entry_date >= ?");
    params.push(opts.from);
  }
  if (opts?.to) {
    where.push("e.entry_date <= ?");
    params.push(opts.to);
  }
  if (opts?.loketCode) {
    where.push("(l.dim_loket = ? OR e.loket_code = ?)");
    params.push(opts.loketCode, opts.loketCode);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(l.debit), 0) AS total_debit,
            COALESCE(SUM(l.credit), 0) AS total_credit
       FROM gl_accounts a
       LEFT JOIN gl_journal_lines l ON l.account_code = a.code
       LEFT JOIN gl_journal_entries e ON e.id = l.entry_id
       ${whereSql}
      GROUP BY a.code, a.name, a.account_type, a.normal_balance
      ORDER BY a.code ASC`,
    params
  );

  return rows.map((r) => {
    const accountType = r.account_type as AccountType;
    const totalDebit = Number(r.total_debit);
    const totalCredit = Number(r.total_credit);
    const isDebitNormal = NORMAL_BALANCE[accountType] === "DEBIT";
    const balance = isDebitNormal
      ? totalDebit - totalCredit
      : totalCredit - totalDebit;
    return {
      accountCode: r.code,
      accountName: r.name,
      accountType,
      normalBalance: r.normal_balance,
      totalDebit,
      totalCredit,
      balance,
    };
  });
}

export interface AccountLedgerRow {
  entryId: number;
  entryNo: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export async function getAccountLedger(opts: {
  accountCode: string;
  from?: string;
  to?: string;
  loketCode?: string;
}): Promise<{ account: { code: string; name: string; normalBalance: "DEBIT" | "CREDIT" } | null; rows: AccountLedgerRow[] }> {
  const [accRows] = await pool.query<RowDataPacket[]>(
    `SELECT code, name, normal_balance FROM gl_accounts WHERE code = ? LIMIT 1`,
    [opts.accountCode]
  );
  if (accRows.length === 0) return { account: null, rows: [] };
  const account = {
    code: accRows[0].code as string,
    name: accRows[0].name as string,
    normalBalance: accRows[0].normal_balance as "DEBIT" | "CREDIT",
  };

  const where: string[] = ["l.account_code = ?"];
  const params: (string | number)[] = [opts.accountCode];
  if (opts.from) {
    where.push("e.entry_date >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    where.push("e.entry_date <= ?");
    params.push(opts.to);
  }
  if (opts.loketCode) {
    where.push("(l.dim_loket = ? OR e.loket_code = ?)");
    params.push(opts.loketCode, opts.loketCode);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT e.id AS entry_id, e.entry_no, e.entry_date, e.description,
            e.source_type, e.source_id, l.debit, l.credit
       FROM gl_journal_lines l
       INNER JOIN gl_journal_entries e ON e.id = l.entry_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.entry_date ASC, e.id ASC, l.line_no ASC`,
    params
  );

  let runningBalance = 0;
  const result: AccountLedgerRow[] = rows.map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    runningBalance += account.normalBalance === "DEBIT" ? debit - credit : credit - debit;
    return {
      entryId: Number(r.entry_id),
      entryNo: r.entry_no,
      entryDate: String(r.entry_date).slice(0, 10),
      description: r.description,
      sourceType: r.source_type,
      sourceId: r.source_id,
      debit,
      credit,
      balance: runningBalance,
    };
  });

  return { account, rows: result };
}

export interface MarginRow {
  provider: string;
  serviceType: string | null;
  loketCode: string | null;
  transactionCount: number;
  totalAmount: number;
  totalAdminFee: number;
  totalGross: number;
  marginPct: number;
}

/**
 * Margin per provider/service_type/loket dari multi_payment_items SUCCESS.
 * Margin = total_admin_fee / total_amount * 100  (proxy untuk gross margin)
 */
export async function getMarginReport(opts: {
  from?: string;
  to?: string;
  loketCode?: string;
  provider?: string;
  groupBy?: "PROVIDER" | "SERVICE" | "PRODUCT" | "LOKET";
}): Promise<MarginRow[]> {
  const where: string[] = ["mpi.status = 'SUCCESS'"];
  const params: (string | number)[] = [];
  if (opts.from) {
    where.push("mpi.paid_at >= ?");
    params.push(`${opts.from} 00:00:00`);
  }
  if (opts.to) {
    where.push("mpi.paid_at <= ?");
    params.push(`${opts.to} 23:59:59`);
  }
  if (opts.loketCode) {
    where.push("mpr.loket_code = ?");
    params.push(opts.loketCode);
  }
  if (opts.provider) {
    where.push("mpi.provider = ?");
    params.push(opts.provider);
  }

  const groupBy = opts.groupBy ?? "PROVIDER";
  let groupCols: string;
  let selectCols: string;
  switch (groupBy) {
    case "SERVICE":
      groupCols = "mpi.provider, mpi.service_type";
      selectCols = "mpi.provider AS provider, mpi.service_type AS service_type, NULL AS loket_code";
      break;
    case "PRODUCT":
      groupCols = "mpi.provider, mpi.product_code";
      selectCols =
        "mpi.provider AS provider, mpi.product_code AS service_type, NULL AS loket_code";
      break;
    case "LOKET":
      groupCols = "mpr.loket_code, mpi.provider";
      selectCols =
        "mpi.provider AS provider, NULL AS service_type, mpr.loket_code AS loket_code";
      break;
    default:
      groupCols = "mpi.provider";
      selectCols = "mpi.provider AS provider, NULL AS service_type, NULL AS loket_code";
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${selectCols},
            COUNT(*) AS trx_count,
            COALESCE(SUM(mpi.amount), 0) AS total_amount,
            COALESCE(SUM(mpi.admin_fee), 0) AS total_admin_fee,
            COALESCE(SUM(mpi.total), 0) AS total_gross
       FROM multi_payment_items mpi
       INNER JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
      WHERE ${where.join(" AND ")}
      GROUP BY ${groupCols}
      ORDER BY total_admin_fee DESC`,
    params
  );

  return rows.map((r) => {
    const totalAmount = Number(r.total_amount);
    const totalAdmin = Number(r.total_admin_fee);
    const marginPct = totalAmount > 0 ? (totalAdmin / totalAmount) * 100 : 0;
    return {
      provider: r.provider,
      serviceType: r.service_type ?? null,
      loketCode: r.loket_code ?? null,
      transactionCount: Number(r.trx_count),
      totalAmount,
      totalAdminFee: totalAdmin,
      totalGross: Number(r.total_gross),
      marginPct,
    };
  });
}

// Util utk validasi UI (mencegah unused-warning untuk ACCOUNT_TYPES)
export { ACCOUNT_TYPES };
