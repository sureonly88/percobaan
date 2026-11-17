import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { ACCOUNT } from "@/lib/gl/accounts";
import { postJournal, type JournalLineInput } from "@/lib/gl/journal";

export type CommissionTarget = "KASIR" | "LOKET";
export type CommissionType = "PERCENT" | "FLAT";
export type CommissionBasis = "AMOUNT" | "ADMIN_FEE" | "TOTAL";
export type CommissionScope = "GLOBAL" | "LOKET" | "PROVIDER" | "LOKET_PROVIDER";

export interface CommissionRule {
  id: number;
  name: string;
  scope: CommissionScope;
  loketCode: string | null;
  provider: string | null;
  serviceType: string | null;
  target: CommissionTarget;
  type: CommissionType;
  value: number;
  basis: CommissionBasis;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
}

export interface CommissionContext {
  paymentItemId: number;
  itemCode: string;
  transactionCode: string | null;
  multiPaymentCode: string | null;
  paidAt: Date;
  loketCode: string;
  username: string;
  provider: string;
  serviceType: string | null;
  productCode: string | null;
  amount: number;
  adminFee: number;
  total: number;
}

interface RuleRow extends RowDataPacket {
  id: number;
  name: string;
  scope: CommissionScope;
  loket_code: string | null;
  provider: string | null;
  service_type: string | null;
  target: CommissionTarget;
  type: CommissionType;
  value: string;
  basis: CommissionBasis;
  min_amount: string | null;
  max_amount: string | null;
  priority: number;
  is_active: number;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
}

function round0(n: number) {
  return Math.round(n);
}

function specificity(rule: { scope: CommissionScope }): number {
  switch (rule.scope) {
    case "LOKET_PROVIDER":
      return 4;
    case "LOKET":
      return 3;
    case "PROVIDER":
      return 2;
    case "GLOBAL":
    default:
      return 1;
  }
}

function ruleMatches(rule: RuleRow, ctx: CommissionContext, today: string): boolean {
  if (!rule.is_active) return false;
  if (rule.valid_from && today < rule.valid_from) return false;
  if (rule.valid_to && today > rule.valid_to) return false;
  if (rule.loket_code && rule.loket_code !== ctx.loketCode) return false;
  if (rule.provider && rule.provider.toUpperCase() !== ctx.provider.toUpperCase()) return false;
  if (rule.service_type && rule.service_type !== (ctx.serviceType || "")) return false;
  return true;
}

function pickBaseAmount(basis: CommissionBasis, ctx: CommissionContext): number {
  switch (basis) {
    case "AMOUNT":
      return ctx.amount;
    case "TOTAL":
      return ctx.total;
    case "ADMIN_FEE":
    default:
      return ctx.adminFee;
  }
}

function computeCommission(rule: RuleRow, base: number): number {
  const v = Number(rule.value);
  let amt = rule.type === "PERCENT" ? (base * v) / 100 : v;
  const min = rule.min_amount != null ? Number(rule.min_amount) : null;
  const max = rule.max_amount != null ? Number(rule.max_amount) : null;
  if (min != null && amt < min) amt = min;
  if (max != null && amt > max) amt = max;
  return round0(Math.max(0, amt));
}

/**
 * Pilih satu rule terbaik per target (KASIR, LOKET):
 * - paling spesifik (LOKET_PROVIDER > LOKET > PROVIDER > GLOBAL)
 * - priority lebih besar menang jika sama-sama spesifik
 */
async function selectRulesForContext(ctx: CommissionContext): Promise<RuleRow[]> {
  const [rows] = await pool.query<RuleRow[]>(
    `SELECT * FROM commission_rules
     WHERE is_active = 1
       AND (loket_code IS NULL OR loket_code = ?)
       AND (provider   IS NULL OR provider   = ?)`,
    [ctx.loketCode, ctx.provider]
  );
  const today = ctx.paidAt.toISOString().slice(0, 10);
  const matched = rows.filter((r) => ruleMatches(r, ctx, today));

  const byTarget = new Map<CommissionTarget, RuleRow>();
  for (const r of matched) {
    const existing = byTarget.get(r.target);
    if (!existing) {
      byTarget.set(r.target, r);
      continue;
    }
    const sNew = specificity(r);
    const sOld = specificity(existing);
    if (sNew > sOld || (sNew === sOld && r.priority > existing.priority)) {
      byTarget.set(r.target, r);
    }
  }
  return Array.from(byTarget.values());
}

export interface RecordCommissionsResult {
  /** Baris ledger baru yang dicatat pada panggilan ini. */
  inserted: number;
  /** Baris yang sudah tercatat sebelumnya untuk item yang sama (idempoten). */
  alreadyRecorded: number;
  /** Bentrok kunci dengan item lain / error insert — tidak dicatat, dilog sebagai error. */
  errors: number;
  totalKasir: number;
  totalLoket: number;
  glEntryId: number | null;
}

/**
 * Kunci idempotensi komisi — harus sama persis dengan kolom generated
 * `commission_ledger.dedup_key` (migrasi 20261111_commission_ledger_dedup_key.sql).
 * Tidak memakai payment_item_id karena id multi_payment_items bisa terpakai ulang
 * setelah item dihapus (cleanup import LEGACY).
 */
export function commissionDedupKey(transactionCode: string | null, itemCode: string): string {
  return `${transactionCode ?? ""}|${itemCode}`;
}

interface ExistingLedgerRow extends RowDataPacket {
  id: number;
  payment_item_id: number;
  item_code: string;
  transaction_code: string | null;
  item_still_exists: number;
}

/**
 * Hitung & catat komisi untuk satu item pembayaran SUKSES.
 *
 * Idempotensi ledger: UNIQUE (dedup_key, target) di commission_ledger, dengan
 * dedup_key = transaction_code|item_code untuk baris non-VOID. Bila INSERT bentrok,
 * baris yang ada diperiksa: kalau payment_item_id-nya milik item lain yang masih
 * hidup, itu dicatat sebagai error (bukan di-skip diam-diam).
 *
 * Jurnal GL (jika ada komisi > 0), diposting untuk baris yang belum punya gl_entry_id:
 *   Dr Beban Komisi Kasir / Loket
 *      Cr Hutang Komisi Kasir / Loket
 */
export async function recordCommissions(
  ctx: CommissionContext
): Promise<RecordCommissionsResult> {
  const result: RecordCommissionsResult = {
    inserted: 0,
    alreadyRecorded: 0,
    errors: 0,
    totalKasir: 0,
    totalLoket: 0,
    glEntryId: null,
  };
  const dedupKey = commissionDedupKey(ctx.transactionCode, ctx.itemCode);

  const rules = await selectRulesForContext(ctx);
  if (rules.length === 0) return result;

  const inserts: Array<{
    rule: RuleRow;
    base: number;
    amount: number;
    beneficiary: string;
  }> = [];

  for (const rule of rules) {
    const base = pickBaseAmount(rule.basis, ctx);
    const amount = computeCommission(rule, base);
    if (amount <= 0) continue;
    const beneficiary = rule.target === "KASIR" ? ctx.username : ctx.loketCode;
    inserts.push({ rule, base, amount, beneficiary });
  }

  if (inserts.length === 0) return result;

  for (const ins of inserts) {
    try {
      await pool.execute<ResultSetHeader>(
        `INSERT INTO commission_ledger
          (payment_item_id, item_code, transaction_code, multi_payment_code, paid_at,
           loket_code, username, provider, service_type, product_code,
           target, beneficiary, rule_id, rule_name, rule_type, rule_value, basis,
           base_amount, commission_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCRUED')`,
        [
          ctx.paymentItemId,
          ctx.itemCode,
          ctx.transactionCode,
          ctx.multiPaymentCode,
          ctx.paidAt,
          ctx.loketCode,
          ctx.username,
          ctx.provider,
          ctx.serviceType,
          ctx.productCode,
          ins.rule.target,
          ins.beneficiary,
          ins.rule.id,
          ins.rule.name,
          ins.rule.type,
          ins.rule.value,
          ins.rule.basis,
          ins.base,
          ins.amount,
        ]
      );
      result.inserted += 1;
      if (ins.rule.target === "KASIR") result.totalKasir += ins.amount;
      else result.totalLoket += ins.amount;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code !== "ER_DUP_ENTRY") {
        result.errors += 1;
        console.error("[Commission] insert ledger gagal:", {
          itemCode: ctx.itemCode,
          transactionCode: ctx.transactionCode,
          target: ins.rule.target,
          err: err.message,
        });
        continue;
      }
      // Bentrok kunci: pastikan baris yang ada memang milik item ini.
      const [existing] = await pool.query<ExistingLedgerRow[]>(
        `SELECT c.id, c.payment_item_id, c.item_code, c.transaction_code,
                EXISTS(SELECT 1 FROM multi_payment_items i
                        WHERE i.id = c.payment_item_id AND i.item_code = c.item_code) AS item_still_exists
           FROM commission_ledger c
          WHERE c.dedup_key = ? AND c.target = ?
          LIMIT 1`,
        [dedupKey, ins.rule.target]
      );
      const row = existing[0];
      if (!row) {
        result.errors += 1;
        console.error("[Commission] ER_DUP_ENTRY tapi baris pemilik kunci tidak ditemukan:", {
          itemCode: ctx.itemCode,
          transactionCode: ctx.transactionCode,
          target: ins.rule.target,
          err: err.message,
        });
      } else if (Number(row.payment_item_id) === ctx.paymentItemId || !Number(row.item_still_exists)) {
        // Sama item (atau item lama yang dihapus lalu diimpor ulang dengan kode sama) → sudah dicatat.
        result.alreadyRecorded += 1;
      } else {
        result.errors += 1;
        console.error("[Commission] kunci komisi bentrok dengan item lain:", {
          itemCode: ctx.itemCode,
          transactionCode: ctx.transactionCode,
          paymentItemId: ctx.paymentItemId,
          target: ins.rule.target,
          existingLedgerId: row.id,
          existingPaymentItemId: row.payment_item_id,
        });
      }
    }
  }

  result.glEntryId = await postCommissionJournal(ctx, dedupKey);
  return result;
}

interface PendingGlRow extends RowDataPacket {
  id: number;
  target: CommissionTarget;
  commission_amount: string;
}

/**
 * Posting jurnal komisi untuk baris ledger item ini yang belum punya gl_entry_id.
 * Idempoten lewat kolom gl_entry_id (dikunci FOR UPDATE), jadi aman diulang dan
 * melengkapi jurnal yang dulu gagal diposting. Best-effort: error hanya dilog.
 */
async function postCommissionJournal(
  ctx: CommissionContext,
  dedupKey: string
): Promise<number | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<PendingGlRow[]>(
      `SELECT id, target, commission_amount FROM commission_ledger
        WHERE dedup_key = ? AND gl_entry_id IS NULL
        ORDER BY id FOR UPDATE`,
      [dedupKey]
    );
    if (rows.length === 0) {
      await conn.commit();
      return null;
    }
    const ids = rows.map((r) => Number(r.id));

    // Kompatibilitas data lama: jurnal format `COMMISSION-{item_code}` yang sudah
    // diposting tapi belum ditautkan ke baris ledger mana pun → tautkan, jangan posting ulang.
    const [legacy] = await conn.query<RowDataPacket[]>(
      `SELECT e.id FROM gl_journal_entries e
        WHERE e.source_type = 'PAYMENT' AND e.source_id = ? AND e.reverses_entry_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM gl_journal_entries x WHERE x.reverses_entry_id = e.id)
          AND NOT EXISTS (SELECT 1 FROM commission_ledger c WHERE c.gl_entry_id = e.id)
        ORDER BY e.id LIMIT 1`,
      [`COMMISSION-${ctx.itemCode}`]
    );
    if (legacy[0]) {
      const entryId = Number(legacy[0].id);
      await conn.query(`UPDATE commission_ledger SET gl_entry_id = ? WHERE id IN (?)`, [entryId, ids]);
      await conn.commit();
      return entryId;
    }

    let totalKasir = 0;
    let totalLoket = 0;
    for (const r of rows) {
      if (r.target === "KASIR") totalKasir += Number(r.commission_amount) || 0;
      else totalLoket += Number(r.commission_amount) || 0;
    }

    const dim = {
      dimLoket: ctx.loketCode,
      dimProvider: ctx.provider,
      dimService: ctx.serviceType,
      dimProduct: ctx.productCode,
    };
    const lines: JournalLineInput[] = [];
    if (totalKasir > 0) {
      lines.push({ accountCode: ACCOUNT.BEBAN_KOMISI_KASIR, debit: totalKasir, memo: `Komisi kasir ${ctx.username}`, ...dim });
      lines.push({ accountCode: ACCOUNT.HUTANG_KOMISI_KASIR, credit: totalKasir, memo: `Hutang komisi kasir ${ctx.username}`, ...dim });
    }
    if (totalLoket > 0) {
      lines.push({ accountCode: ACCOUNT.BEBAN_KOMISI_LOKET, debit: totalLoket, memo: `Komisi loket ${ctx.loketCode}`, ...dim });
      lines.push({ accountCode: ACCOUNT.HUTANG_KOMISI_LOKET, credit: totalLoket, memo: `Hutang komisi loket ${ctx.loketCode}`, ...dim });
    }
    if (lines.length < 2) {
      await conn.commit();
      return null;
    }

    // source_id unik per kelompok baris ledger (id baris pertama); item_code saja
    // tidak unik — tagihan yang sama bisa dibayar ulang dengan transaction_code lain.
    const posted = await postJournal(
      {
        entryDate: ctx.paidAt,
        description: `Komisi ${ctx.provider} — ${ctx.itemCode}`,
        sourceType: "PAYMENT",
        sourceId: `COMMISSION-CL${ids[0]}`,
        referenceNo: ctx.transactionCode || ctx.itemCode,
        loketCode: ctx.loketCode,
        provider: ctx.provider,
        serviceType: ctx.serviceType,
        createdBy: ctx.username,
        lines,
      },
      conn
    );
    await conn.query(`UPDATE commission_ledger SET gl_entry_id = ? WHERE id IN (?)`, [posted.entryId, ids]);
    await conn.commit();
    return posted.entryId;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    console.error("[Commission] posting jurnal komisi gagal:", {
      itemCode: ctx.itemCode,
      transactionCode: ctx.transactionCode,
      err: (e as Error).message,
    });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Wrapper aman — tidak boleh menggagalkan transaksi pembayaran.
 */
export async function recordCommissionsSafe(
  ctx: CommissionContext
): Promise<RecordCommissionsResult | null> {
  try {
    return await recordCommissions(ctx);
  } catch (e) {
    console.error("[Commission] recordCommissionsSafe gagal:", (e as Error).message);
    return null;
  }
}
