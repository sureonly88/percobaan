import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { creditLoketBalance, debitLoketBalance } from "@/lib/saldo-mutations";

/**
 * Penyelesaian saldo per transaksi berbasis loket_balance_ledger.
 *
 * Model: saldo ditahan (hold) sebelum provider dipanggil dan TETAP ditahan selama
 * status belum final (PENDING / PENDING_ADVICE / PENDING_REVIEW). Saat status final:
 *   - SUCCESS → potongan bersih disesuaikan ke nominal final (tidak memotong dua kali)
 *   - FAILED  → seluruh potongan bersih dikembalikan
 *
 * Potongan bersih = -SUM(amount) ledger dengan reference TRANSACTION/<kode>, sehingga
 * fungsi ini idempoten: dipanggil berulang dari jalur mana pun (pay, advice,
 * stale-pending, auto-resolve) hasilnya sama.
 */

export async function getTransactionNetDebit(
  transactionCode: string,
  db: PoolConnection | typeof pool = pool
): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) AS net
       FROM loket_balance_ledger
      WHERE reference_type = 'TRANSACTION' AND reference_id = ?`,
    [transactionCode]
  );
  return Math.max(0, -Number(rows[0]?.net || 0));
}

export interface SettleTransactionBalanceInput {
  transactionCode: string;
  loketCode: string;
  outcome: "SUCCESS" | "FAILED";
  /** SUCCESS: nominal final yang seharusnya terpotong. */
  targetAmount?: number;
  /** SUCCESS sebagian (masih ada item pending): jangan kurangi potongan yang sudah ditahan. */
  atLeast?: boolean;
  actor?: string | null;
  note?: string | null;
  /** Jalankan di DB transaction milik pemanggil (tanpa begin/commit sendiri). */
  connection?: PoolConnection;
}

export interface SettleTransactionBalanceResult {
  /** Positif = saldo dipotong tambahan, negatif = saldo dikembalikan. */
  adjusted: number;
  netDebitBefore: number;
  balance: number | null;
  forced?: boolean;
}

export async function settleTransactionBalance(
  input: SettleTransactionBalanceInput
): Promise<SettleTransactionBalanceResult> {
  const external = input.connection;
  const conn = external ?? (await pool.getConnection());
  try {
    if (!external) await conn.beginTransaction();
    // Kunci baris loket agar penyelesaian paralel untuk transaksi yang sama berurutan
    await conn.query("SELECT id FROM lokets WHERE loket_code = ? LIMIT 1 FOR UPDATE", [input.loketCode]);

    const netDebitBefore = await getTransactionNetDebit(input.transactionCode, conn);
    let target = 0;
    if (input.outcome === "SUCCESS") {
      target = Math.max(0, Math.round(Number(input.targetAmount || 0)));
      if (input.atLeast) target = Math.max(target, netDebitBefore);
    }
    const diff = target - netDebitBefore;

    const ledgerBase = {
      referenceType: "TRANSACTION",
      referenceId: input.transactionCode,
      note: input.note ?? null,
      actor: input.actor ?? null,
    };
    let result: SettleTransactionBalanceResult = { adjusted: 0, netDebitBefore, balance: null };

    if (diff > 0) {
      // Provider sudah memotong — paksa potong walau saldo kurang, dicatat sebagai anomali oleh pemanggil
      const debit = await debitLoketBalance({
        connection: conn,
        loketCode: input.loketCode,
        amount: diff,
        allowNegative: true,
        ledger: { ...ledgerBase, type: "PAYMENT_SETTLE_DEBIT" },
      });
      if (!debit.ok) throw new Error(`Loket ${input.loketCode} tidak ditemukan`);
      result = { adjusted: diff, netDebitBefore, balance: debit.balance, forced: Boolean(debit.forced) };
    } else if (diff < 0) {
      const credit = await creditLoketBalance({
        connection: conn,
        loketCode: input.loketCode,
        amount: -diff,
        ledger: { ...ledgerBase, type: input.outcome === "FAILED" ? "PAYMENT_RELEASE" : "PAYMENT_SETTLE_CREDIT" },
      });
      if (!credit.ok) throw new Error(`Loket ${input.loketCode} tidak ditemukan`);
      result = { adjusted: diff, netDebitBefore, balance: credit.balance };
    }

    if (!external) await conn.commit();
    return result;
  } catch (err) {
    if (!external) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (!external) conn.release();
  }
}

/**
 * Samakan hold transaksi dengan status item-itemnya:
 *   hold seharusnya = SUM(total) item berstatus SUCCESS atau masih pending.
 * Item FAILED/VOID tidak ditahan. Dipakai setelah status item berubah di luar alur
 * pay (advice, SUPERSEDED_BY_PAYMENT, auto-reverse, cancel stale pending).
 */
export async function reconcileTransactionHold(
  transactionCode: string,
  opts: { actor?: string | null; note?: string | null; connection?: PoolConnection } = {}
): Promise<SettleTransactionBalanceResult | null> {
  const db = opts.connection ?? pool;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT r.loket_code,
            COUNT(*) AS item_count,
            COALESCE(SUM(CASE WHEN i.status IN ('SUCCESS','PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')
                              THEN i.total ELSE 0 END), 0) AS required_hold
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.transaction_code = ?
      GROUP BY r.loket_code
      LIMIT 1`,
    [transactionCode]
  );
  const row = rows[0];
  if (!row || !row.loket_code) return null;
  const requiredHold = Number(row.required_hold || 0);
  return settleTransactionBalance({
    transactionCode,
    loketCode: String(row.loket_code),
    outcome: requiredHold > 0 ? "SUCCESS" : "FAILED",
    targetAmount: requiredHold,
    actor: opts.actor ?? null,
    note: opts.note ?? null,
    connection: opts.connection,
  });
}

/** reconcileTransactionHold untuk banyak transaksi sekaligus. Best-effort per transaksi. */
export async function reconcileHoldsForTransactions(
  transactionCodes: string[],
  opts: { actor?: string | null; note?: string | null } = {}
): Promise<Array<{ transactionCode: string; adjusted: number; error?: string }>> {
  const out: Array<{ transactionCode: string; adjusted: number; error?: string }> = [];
  for (const code of Array.from(new Set(transactionCodes.filter(Boolean)))) {
    try {
      const res = await reconcileTransactionHold(code, opts);
      out.push({ transactionCode: code, adjusted: res?.adjusted ?? 0 });
    } catch (err) {
      console.error(`[transaction-balance] Gagal menyesuaikan hold ${code}:`, err);
      out.push({ transactionCode: code, adjusted: 0, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  return out;
}

/**
 * Saldo yang sedang ditahan per loket: potongan bersih (ledger) dari transaksi yang
 * itemnya masih belum final. Saldo loket (pulsa) sudah tidak termasuk nilai ini.
 */
export async function getHeldBalances(
  loketCodes?: string[]
): Promise<Map<string, { held: number; count: number }>> {
  const filter = loketCodes && loketCodes.length > 0;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.loket_code, COUNT(*) AS cnt, COALESCE(SUM(t.net), 0) AS held
       FROM (
         SELECT p.loket_code, p.transaction_code,
                -(SELECT COALESCE(SUM(l.amount), 0) FROM loket_balance_ledger l
                   WHERE l.reference_type = 'TRANSACTION' AND l.reference_id = p.transaction_code) AS net
           FROM (
             SELECT DISTINCT r.loket_code, i.transaction_code
               FROM multi_payment_items i
               JOIN multi_payment_requests r ON r.id = i.multi_payment_id
              WHERE i.status IN ('PENDING','PENDING_ADVICE','PENDING_PROVIDER','PENDING_REVIEW')
                AND i.transaction_code IS NOT NULL
                ${filter ? "AND r.loket_code IN (?)" : ""}
           ) p
       ) t
      WHERE t.net > 0
      GROUP BY t.loket_code`,
    filter ? [loketCodes] : []
  );
  const out = new Map<string, { held: number; count: number }>();
  for (const row of rows) {
    out.set(String(row.loket_code), { held: Number(row.held || 0), count: Number(row.cnt || 0) });
  }
  return out;
}

export interface ProviderContactInfo {
  /** Saldo yang sedang ditahan untuk transaksi ini (potongan bersih ledger). */
  heldAmount: number;
  /**
   * true bila request MUNGKIN sudah sampai ke provider: ada hold di ledger (hold selalu
   * dibuat tepat sebelum provider dipanggil), ada event PAYMENT_PROVIDER_REQUEST, atau
   * transaksi dibuat sebelum ledger aktif (tidak bisa dibuktikan → dianggap mungkin).
   */
  providerMayHaveBeenContacted: boolean;
  reason: "HOLD_RECORDED" | "PROVIDER_REQUEST_LOGGED" | "BEFORE_LEDGER" | "NOT_CONTACTED";
}

const LEDGER_MIGRATION = "20261102_z_transaction_voids_and_balance_ledger.sql";

/** Nilai apakah transaksi (berdasarkan kode) mungkin sudah diproses provider. */
export async function assessProviderContact(
  transactionCodes: string[]
): Promise<Map<string, ProviderContactInfo>> {
  const out = new Map<string, ProviderContactInfo>();
  const codes = Array.from(new Set(transactionCodes.filter(Boolean)));
  if (codes.length === 0) return out;

  const [[migration]] = await pool.query<RowDataPacket[]>(
    "SELECT run_at FROM schema_migrations WHERE filename = ? LIMIT 1",
    [LEDGER_MIGRATION]
  );
  const ledgerSince: Date | null = migration?.run_at ? new Date(migration.run_at) : null;

  const [ledgerRows] = await pool.query<RowDataPacket[]>(
    `SELECT reference_id, COUNT(*) AS cnt, -COALESCE(SUM(amount), 0) AS net
       FROM loket_balance_ledger
      WHERE reference_type = 'TRANSACTION' AND reference_id IN (?)
      GROUP BY reference_id`,
    [codes]
  );
  const ledgerByCode = new Map(ledgerRows.map((r) => [String(r.reference_id), r]));

  const [eventRows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT transaction_code FROM transaction_events
      WHERE event_type = 'PAYMENT_PROVIDER_REQUEST' AND transaction_code IN (?)`,
    [codes]
  );
  const requested = new Set(eventRows.map((r) => String(r.transaction_code)));

  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT transaction_code, MIN(created_at) AS created_at
       FROM multi_payment_items WHERE transaction_code IN (?) GROUP BY transaction_code`,
    [codes]
  );
  const createdByCode = new Map(itemRows.map((r) => [String(r.transaction_code), new Date(r.created_at)]));

  for (const code of codes) {
    const ledger = ledgerByCode.get(code);
    const heldAmount = Math.max(0, Number(ledger?.net || 0));
    const createdAt = createdByCode.get(code);
    let reason: ProviderContactInfo["reason"] = "NOT_CONTACTED";
    if (ledger && Number(ledger.cnt) > 0) reason = "HOLD_RECORDED";
    else if (requested.has(code)) reason = "PROVIDER_REQUEST_LOGGED";
    else if (!ledgerSince || !createdAt || createdAt < ledgerSince) reason = "BEFORE_LEDGER";
    out.set(code, { heldAmount, providerMayHaveBeenContacted: reason !== "NOT_CONTACTED", reason });
  }
  return out;
}
