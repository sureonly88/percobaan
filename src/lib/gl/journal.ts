import pool from "@/lib/db";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type JournalSourceType =
  | "PAYMENT"
  | "TOPUP"
  | "SETTLEMENT"
  | "REVERSAL"
  | "MANUAL"
  | "OPENING";

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
  dimLoket?: string | null;
  dimProvider?: string | null;
  dimService?: string | null;
  dimProduct?: string | null;
}

export interface PostJournalInput {
  entryDate?: Date | string;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  referenceNo?: string | null;
  loketCode?: string | null;
  provider?: string | null;
  serviceType?: string | null;
  createdBy?: string | null;
  reversesEntryId?: number | null;
  lines: JournalLineInput[];
}

export interface PostJournalResult {
  entryId: number;
  entryNo: string;
  totalDebit: number;
  totalCredit: number;
}

const TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateEntryNo(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const ts = String(date.getTime()).slice(-6);
  return `JE-${y}${m}${day}-${ts}${rand}`;
}

/**
 * Post jurnal double-entry. Mengembalikan ID entry baru.
 * Throws jika SUM(debit) != SUM(credit) atau lines kosong / invalid.
 */
export async function postJournal(
  input: PostJournalInput,
  externalConn?: PoolConnection
): Promise<PostJournalResult> {
  if (!input.lines || input.lines.length < 2) {
    throw new Error("postJournal: minimal 2 baris jurnal diperlukan");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const ln of input.lines) {
    const d = round2(Number(ln.debit ?? 0));
    const c = round2(Number(ln.credit ?? 0));
    if (d < 0 || c < 0) throw new Error("postJournal: nilai debit/kredit negatif tidak diizinkan");
    if (d > 0 && c > 0) throw new Error("postJournal: satu baris tidak boleh ada debit DAN kredit sekaligus");
    if (d === 0 && c === 0) throw new Error("postJournal: setiap baris harus memiliki debit atau kredit");
    if (!ln.accountCode) throw new Error("postJournal: accountCode wajib diisi per baris");
    totalDebit += d;
    totalCredit += c;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (Math.abs(totalDebit - totalCredit) > TOLERANCE) {
    throw new Error(
      `postJournal: jurnal tidak seimbang (debit=${totalDebit}, kredit=${totalCredit})`
    );
  }

  const date = input.entryDate
    ? typeof input.entryDate === "string"
      ? new Date(input.entryDate)
      : input.entryDate
    : new Date();
  const dateStr = formatDate(date);
  const entryNo = generateEntryNo(new Date());

  const conn = externalConn ?? (await pool.getConnection());
  const ownsConn = !externalConn;
  if (ownsConn) await conn.beginTransaction();

  try {
    const [insertRes] = await conn.execute<ResultSetHeader>(
      `INSERT INTO gl_journal_entries
        (entry_no, entry_date, description, source_type, source_id, reference_no,
         loket_code, provider, service_type, total_debit, total_credit,
         reverses_entry_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        entryNo,
        dateStr,
        input.description.slice(0, 255),
        input.sourceType,
        input.sourceId ?? null,
        input.referenceNo ?? null,
        input.loketCode ?? null,
        input.provider ?? null,
        input.serviceType ?? null,
        totalDebit,
        totalCredit,
        input.reversesEntryId ?? null,
        input.createdBy ?? null,
      ]
    );
    const entryId = insertRes.insertId;

    let lineNo = 1;
    for (const ln of input.lines) {
      await conn.execute(
        `INSERT INTO gl_journal_lines
          (entry_id, line_no, account_code, debit, credit, memo,
           dim_loket, dim_provider, dim_service, dim_product)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          lineNo++,
          ln.accountCode,
          round2(Number(ln.debit ?? 0)),
          round2(Number(ln.credit ?? 0)),
          ln.memo ?? null,
          ln.dimLoket ?? input.loketCode ?? null,
          ln.dimProvider ?? input.provider ?? null,
          ln.dimService ?? input.serviceType ?? null,
          ln.dimProduct ?? null,
        ]
      );
    }

    if (ownsConn) await conn.commit();

    return { entryId, entryNo, totalDebit, totalCredit };
  } catch (err) {
    if (ownsConn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownsConn) conn.release();
  }
}

/**
 * Cek apakah journal entry untuk source tertentu sudah ada.
 * Berguna untuk idempotensi posting (jangan double-post).
 */
export async function hasJournalForSource(
  sourceType: JournalSourceType,
  sourceId: string
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM gl_journal_entries
      WHERE source_type = ? AND source_id = ? AND reverses_entry_id IS NULL
      LIMIT 1`,
    [sourceType, sourceId]
  );
  return rows.length > 0;
}

/**
 * Post jurnal best-effort: jika gagal, hanya log error tanpa throw.
 * Cocok untuk inject ke flow payment success (jangan rollback payment yang sudah sukses).
 */
export async function postJournalSafe(input: PostJournalInput): Promise<PostJournalResult | null> {
  try {
    return await postJournal(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[GL] postJournalSafe gagal:", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
