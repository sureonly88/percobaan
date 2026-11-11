import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { postJournal, type JournalLineInput } from "@/lib/gl/journal";

/**
 * Pemeliharaan commission_ledger: men-VOID komisi milik item yang sudah tidak ada
 * (dihapus oleh cleanup import LEGACY) beserta jurnal pembaliknya.
 *
 * - Hanya baris ACCRUED yang di-VOID. Baris PAID (sudah dibayarkan) tidak disentuh —
 *   dilaporkan agar dipotong manual dari pembayaran komisi berikutnya.
 * - gl_journal_entries append-only: jurnal komisi dibalik dengan entri REVERSAL
 *   (reverses_entry_id), tidak dihapus.
 * - Semua fungsi memakai koneksi transaksi milik pemanggil.
 */

export interface VoidCommissionsResult {
  voided: number;
  voidedAmount: number;
  reversalEntryIds: number[];
  /** Baris PAID yang tidak bisa di-VOID otomatis. */
  paidNotVoided: number;
  paidAmount: number;
  warnings: string[];
}

interface LedgerRow extends RowDataPacket {
  id: number;
  status: "ACCRUED" | "PAID" | "VOID";
  commission_amount: string;
  gl_entry_id: number | null;
}

async function reverseCommissionEntry(
  conn: PoolConnection,
  entryId: number,
  reason: string,
  actor: string
): Promise<number | null> {
  const [entries] = await conn.query<RowDataPacket[]>(
    `SELECT e.id, e.entry_no, e.loket_code, e.provider, e.service_type
       FROM gl_journal_entries e
      WHERE e.id = ? AND e.reverses_entry_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM gl_journal_entries x WHERE x.reverses_entry_id = e.id)`,
    [entryId]
  );
  const entry = entries[0];
  if (!entry) return null; // sudah dibalik / tidak ada

  const [lines] = await conn.query<RowDataPacket[]>(
    `SELECT account_code, debit, credit, memo, dim_loket, dim_provider, dim_service, dim_product
       FROM gl_journal_lines WHERE entry_id = ? ORDER BY line_no`,
    [entryId]
  );
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
      description: `Pembalik komisi ${entry.entry_no} — ${reason}`.slice(0, 255),
      sourceType: "REVERSAL",
      sourceId: `COMMISSION-VOID-${entryId}`,
      referenceNo: String(entry.entry_no),
      loketCode: entry.loket_code ?? null,
      provider: entry.provider ?? null,
      serviceType: entry.service_type ?? null,
      createdBy: actor,
      reversesEntryId: entryId,
      lines: reversedLines,
    },
    conn
  );
  return posted.entryId;
}

/**
 * VOID baris commission_ledger yang cocok dengan `whereSql` (alias tabel `c`).
 */
async function voidCommissionRowsWhere(
  conn: PoolConnection,
  whereSql: string,
  params: unknown[],
  reason: string,
  actor: string
): Promise<VoidCommissionsResult> {
  const result: VoidCommissionsResult = {
    voided: 0,
    voidedAmount: 0,
    reversalEntryIds: [],
    paidNotVoided: 0,
    paidAmount: 0,
    warnings: [],
  };

  const [rows] = await conn.query<LedgerRow[]>(
    `SELECT c.id, c.status, c.commission_amount, c.gl_entry_id
       FROM commission_ledger c
      WHERE c.status <> 'VOID' AND (${whereSql})
      FOR UPDATE`,
    params
  );
  const accrued = rows.filter((r) => r.status === "ACCRUED");
  for (const r of rows) {
    if (r.status === "PAID") {
      result.paidNotVoided += 1;
      result.paidAmount += Number(r.commission_amount) || 0;
    }
  }
  if (accrued.length === 0) return result;

  const accruedIds = accrued.map((r) => Number(r.id));
  const glIds = Array.from(
    new Set(accrued.map((r) => r.gl_entry_id).filter((v): v is number => v != null).map(Number))
  );

  for (const glId of glIds) {
    // Jurnal komisi mencakup semua target satu item. Kalau masih dipakai baris
    // non-VOID lain (mis. PAID), jangan dibalik sebagian — laporkan saja.
    const [others] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM commission_ledger
        WHERE gl_entry_id = ? AND status <> 'VOID' AND id NOT IN (?)`,
      [glId, accruedIds]
    );
    if (Number(others[0]?.cnt || 0) > 0) {
      result.warnings.push(
        `Jurnal komisi #${glId} juga dipakai baris komisi yang sudah dibayar — tidak dibalik otomatis.`
      );
      continue;
    }
    const reversalId = await reverseCommissionEntry(conn, glId, reason, actor);
    if (reversalId) result.reversalEntryIds.push(reversalId);
  }

  await conn.query(
    `UPDATE commission_ledger SET status = 'VOID', notes = ? WHERE id IN (?) AND status = 'ACCRUED'`,
    [reason.slice(0, 255), accruedIds]
  );
  result.voided = accrued.length;
  result.voidedAmount = accrued.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0);
  return result;
}

/**
 * VOID komisi milik item-item yang akan dihapus. Dicocokkan pada pasangan
 * (payment_item_id, item_code) supaya tidak mengenai item lain yang kelak
 * memakai ulang id yang sama. Panggil SEBELUM item dihapus, dalam transaksi yang sama.
 */
export async function voidCommissionsForItems(
  conn: PoolConnection,
  items: Array<{ id: number; itemCode: string }>,
  reason: string,
  actor: string
): Promise<VoidCommissionsResult> {
  if (items.length === 0) {
    return { voided: 0, voidedAmount: 0, reversalEntryIds: [], paidNotVoided: 0, paidAmount: 0, warnings: [] };
  }
  const pairs = items.map((i) => [i.id, i.itemCode]);
  return voidCommissionRowsWhere(conn, `(c.payment_item_id, c.item_code) IN (?)`, [pairs], reason, actor);
}

/**
 * VOID komisi "yatim": baris ledger yang item-nya (id + item_code) sudah tidak ada
 * di multi_payment_items, dalam rentang paid_at [startDate, endDate].
 */
export async function voidOrphanCommissions(
  conn: PoolConnection,
  startDate: string,
  endDate: string,
  reason: string,
  actor: string
): Promise<VoidCommissionsResult> {
  return voidCommissionRowsWhere(
    conn,
    `c.paid_at >= ? AND c.paid_at < DATE_ADD(?, INTERVAL 1 DAY)
     AND NOT EXISTS (SELECT 1 FROM multi_payment_items i
                      WHERE i.id = c.payment_item_id AND i.item_code = c.item_code)`,
    [startDate, endDate],
    reason,
    actor
  );
}
