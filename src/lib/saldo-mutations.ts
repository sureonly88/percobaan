import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

type DbExecutor = Pool | PoolConnection;

/** Konteks mutasi yang dicatat ke loket_balance_ledger. */
export interface BalanceLedgerInfo {
  /** Mis. PAYMENT_HOLD, PAYMENT_REFUND, PAYMENT_ADJUST, ADVICE_DEBIT, TOPUP, VOID_REFUND */
  type: string;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  actor?: string | null;
}

interface BalanceMutationOptions {
  loketCode?: string;
  loketId?: number;
  amount: number;
  connection?: DbExecutor;
  allowNegative?: boolean;
  ledger?: BalanceLedgerInfo;
}

function whereClause(opts: Pick<BalanceMutationOptions, "loketCode" | "loketId">) {
  if (opts.loketId != null) return { clause: "id = ?", value: opts.loketId };
  if (opts.loketCode) return { clause: "loket_code = ?", value: opts.loketCode };
  throw new Error("loketCode atau loketId wajib diisi");
}

async function getBalance(db: DbExecutor, opts: Pick<BalanceMutationOptions, "loketCode" | "loketId">) {
  const where = whereClause(opts);
  const [rows] = await db.query<RowDataPacket[]>(`SELECT pulsa FROM lokets WHERE ${where.clause} LIMIT 1`, [where.value]);
  return rows[0] ? Number(rows[0].pulsa || 0) : null;
}

/**
 * Catat mutasi ke loket_balance_ledger (best-effort — kegagalan pencatatan tidak
 * boleh menggagalkan mutasi saldo yang sudah terjadi). balance_after dibaca setelah
 * UPDATE; di luar DB transaction nilainya bisa sudah termasuk mutasi paralel lain.
 */
async function recordLedger(
  db: DbExecutor,
  opts: BalanceMutationOptions,
  signedAmount: number,
  balanceAfter: number | null
) {
  const info = opts.ledger;
  try {
    await db.execute(
      `INSERT INTO loket_balance_ledger
         (loket_code, loket_id, mutation_type, amount, balance_after, reference_type, reference_id, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        opts.loketCode ?? null,
        opts.loketId ?? null,
        info?.type || (signedAmount < 0 ? "DEBIT" : "CREDIT"),
        signedAmount,
        balanceAfter,
        info?.referenceType ?? null,
        info?.referenceId ?? null,
        info?.note ? info.note.slice(0, 255) : null,
        info?.actor ?? null,
      ]
    );
  } catch (err) {
    console.error("[saldo-mutations] Gagal mencatat loket_balance_ledger:", err);
  }
}

export async function debitLoketBalance(opts: BalanceMutationOptions) {
  const db = opts.connection || pool;
  const amount = Math.max(0, Number(opts.amount || 0));
  if (amount <= 0) return { ok: true, balance: await getBalance(db, opts) };
  const where = whereClause(opts);

  const [res] = await db.execute<ResultSetHeader>(
    `UPDATE lokets SET pulsa = pulsa - ? WHERE ${where.clause} AND pulsa >= ?`,
    [amount, where.value, amount]
  );
  if (Number(res.affectedRows || 0) > 0) {
    const balance = await getBalance(db, opts);
    await recordLedger(db, opts, -amount, balance);
    return { ok: true, balance };
  }

  if (opts.allowNegative) {
    const [forced] = await db.execute<ResultSetHeader>(
      `UPDATE lokets SET pulsa = pulsa - ? WHERE ${where.clause}`,
      [amount, where.value]
    );
    const ok = Number(forced.affectedRows || 0) > 0;
    const balance = await getBalance(db, opts);
    if (ok) await recordLedger(db, opts, -amount, balance);
    return { ok, balance, forced: true };
  }

  return { ok: false, balance: await getBalance(db, opts), forced: false };
}

export async function creditLoketBalance(opts: BalanceMutationOptions) {
  const db = opts.connection || pool;
  const amount = Math.max(0, Number(opts.amount || 0));
  if (amount <= 0) return { ok: true, balance: await getBalance(db, opts) };
  const where = whereClause(opts);
  const [res] = await db.execute<ResultSetHeader>(
    `UPDATE lokets SET pulsa = pulsa + ? WHERE ${where.clause}`,
    [amount, where.value]
  );
  const ok = Number(res.affectedRows || 0) > 0;
  const balance = await getBalance(db, opts);
  if (ok) await recordLedger(db, opts, amount, balance);
  return { ok, balance };
}
