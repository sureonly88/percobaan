import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";

type DbExecutor = Pool | PoolConnection;

interface BalanceMutationOptions {
  loketCode?: string;
  loketId?: number;
  amount: number;
  connection?: DbExecutor;
  allowNegative?: boolean;
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
    return { ok: true, balance: await getBalance(db, opts) };
  }

  if (opts.allowNegative) {
    const [forced] = await db.execute<ResultSetHeader>(
      `UPDATE lokets SET pulsa = pulsa - ? WHERE ${where.clause}`,
      [amount, where.value]
    );
    return { ok: Number(forced.affectedRows || 0) > 0, balance: await getBalance(db, opts), forced: true };
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
  return { ok: Number(res.affectedRows || 0) > 0, balance: await getBalance(db, opts) };
}
