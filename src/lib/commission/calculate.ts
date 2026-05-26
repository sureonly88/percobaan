import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { ACCOUNT } from "@/lib/gl/accounts";
import { hasJournalForSource, postJournalSafe } from "@/lib/gl/journal";

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
  inserted: number;
  totalKasir: number;
  totalLoket: number;
  glEntryId: number | null;
}

/**
 * Hitung & catat komisi untuk satu item pembayaran SUKSES.
 * Idempoten via UNIQUE (payment_item_id, target) di commission_ledger,
 * dan via source_type=PAYMENT_COMMISSION + sourceId untuk jurnal GL.
 *
 * Jurnal GL (jika ada komisi > 0):
 *   Dr Beban Komisi Kasir / Loket
 *      Cr Hutang Komisi Kasir / Loket
 */
export async function recordCommissions(
  ctx: CommissionContext
): Promise<RecordCommissionsResult> {
  const result: RecordCommissionsResult = {
    inserted: 0,
    totalKasir: 0,
    totalLoket: 0,
    glEntryId: null,
  };

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
      // Sudah pernah dicatat → skip diam-diam
      if (err.code === "ER_DUP_ENTRY") continue;
      console.error("[Commission] insert ledger gagal:", err.message);
    }
  }

  // Posting GL gabungan (1 entry per item, source_id = item_code-commission)
  if (result.totalKasir > 0 || result.totalLoket > 0) {
    const sourceId = `COMMISSION-${ctx.itemCode}`;
    const already = await hasJournalForSource("PAYMENT", sourceId);
    if (!already) {
      const lines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        memo?: string | null;
        dimLoket?: string | null;
        dimProvider?: string | null;
        dimService?: string | null;
        dimProduct?: string | null;
      }> = [];
      const dim = {
        dimLoket: ctx.loketCode,
        dimProvider: ctx.provider,
        dimService: ctx.serviceType,
        dimProduct: ctx.productCode,
      };
      if (result.totalKasir > 0) {
        lines.push({
          accountCode: ACCOUNT.BEBAN_KOMISI_KASIR,
          debit: result.totalKasir,
          memo: `Komisi kasir ${ctx.username}`,
          ...dim,
        });
        lines.push({
          accountCode: ACCOUNT.HUTANG_KOMISI_KASIR,
          credit: result.totalKasir,
          memo: `Hutang komisi kasir ${ctx.username}`,
          ...dim,
        });
      }
      if (result.totalLoket > 0) {
        lines.push({
          accountCode: ACCOUNT.BEBAN_KOMISI_LOKET,
          debit: result.totalLoket,
          memo: `Komisi loket ${ctx.loketCode}`,
          ...dim,
        });
        lines.push({
          accountCode: ACCOUNT.HUTANG_KOMISI_LOKET,
          credit: result.totalLoket,
          memo: `Hutang komisi loket ${ctx.loketCode}`,
          ...dim,
        });
      }
      if (lines.length >= 2) {
        const posted = await postJournalSafe({
          entryDate: ctx.paidAt,
          description: `Komisi ${ctx.provider} — ${ctx.itemCode}`,
          sourceType: "PAYMENT",
          sourceId,
          referenceNo: ctx.itemCode,
          loketCode: ctx.loketCode,
          provider: ctx.provider,
          serviceType: ctx.serviceType,
          createdBy: ctx.username,
          lines,
        });
        if (posted) {
          result.glEntryId = posted.entryId;
          await pool.execute(
            `UPDATE commission_ledger SET gl_entry_id = ?
             WHERE payment_item_id = ? AND gl_entry_id IS NULL`,
            [posted.entryId, ctx.paymentItemId]
          );
        }
      }
    }
  }

  return result;
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
