import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized, normalizeRole } from "@/lib/rbac";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export const dynamic = "force-dynamic";

interface SummaryRow extends RowDataPacket {
  total_trx: number;
  total_kasir: string;
  total_loket: string;
  total_all: string;
}

interface BeneficiaryRow extends RowDataPacket {
  target: "KASIR" | "LOKET";
  beneficiary: string;
  trx_count: number;
  total_amount: string;
}

interface PerLoketRow extends RowDataPacket {
  loket_code: string;
  trx_count: number;
  total_kasir: string;
  total_loket: string;
}

interface PerProviderRow extends RowDataPacket {
  provider: string;
  trx_count: number;
  total_kasir: string;
  total_loket: string;
}

interface DetailRow extends RowDataPacket {
  id: number;
  paid_at: string;
  loket_code: string;
  username: string;
  provider: string;
  product_code: string | null;
  item_code: string;
  transaction_code: string | null;
  target: "KASIR" | "LOKET";
  beneficiary: string;
  rule_name: string | null;
  rule_type: "PERCENT" | "FLAT";
  rule_value: string;
  basis: string;
  base_amount: string;
  commission_amount: string;
  status: "ACCRUED" | "PAID" | "VOID";
}

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/laporan", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const role = normalizeRole(auth.role || "");
  const canSeeAll = role === "admin" || role === "supervisor";
  const sessionLoketCode = (auth as { loketCode?: string }).loketCode || null;

  const sp = new URL(req.url).searchParams;
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startDate = sp.get("startDate") || fmt(new Date(today.getFullYear(), today.getMonth(), 1));
  const endDate = sp.get("endDate") || fmt(today);

  const requestedLoket = sp.get("loketCode") || "";
  const provider = sp.get("provider") || "";
  const target = sp.get("target") || ""; // KASIR|LOKET
  const beneficiary = sp.get("beneficiary") || "";
  const status = sp.get("status") || ""; // ACCRUED|PAID|VOID
  const includeDetail = sp.get("detail") === "1";

  // Enforce loket restriction for non-admin/supervisor (defensive — kasir tidak punya akses ke laporan ini anyway)
  const loketFilter = canSeeAll
    ? requestedLoket
    : sessionLoketCode || "__NO_LOKET__";

  const where: string[] = [
    "DATE(paid_at) BETWEEN ? AND ?",
  ];
  const params: (string | number)[] = [startDate, endDate];
  if (loketFilter) {
    where.push("loket_code = ?");
    params.push(loketFilter);
  }
  if (provider) {
    where.push("provider = ?");
    params.push(provider.toUpperCase());
  }
  if (target === "KASIR" || target === "LOKET") {
    where.push("target = ?");
    params.push(target);
  }
  if (beneficiary) {
    where.push("beneficiary = ?");
    params.push(beneficiary);
  }
  if (status === "ACCRUED" || status === "PAID" || status === "VOID") {
    where.push("status = ?");
    params.push(status);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  // 1) Summary
  const [summaryRows] = await pool.query<SummaryRow[]>(
    `SELECT
       COUNT(*) AS total_trx,
       COALESCE(SUM(CASE WHEN target='KASIR' THEN commission_amount END),0) AS total_kasir,
       COALESCE(SUM(CASE WHEN target='LOKET' THEN commission_amount END),0) AS total_loket,
       COALESCE(SUM(commission_amount),0) AS total_all
     FROM commission_ledger
     ${whereSql}`,
    params
  );
  const sum = summaryRows[0] || {
    total_trx: 0,
    total_kasir: "0",
    total_loket: "0",
    total_all: "0",
  };

  // 2) Per beneficiary (top kasir/loket)
  const [perBeneficiary] = await pool.query<BeneficiaryRow[]>(
    `SELECT target, beneficiary,
            COUNT(*) AS trx_count,
            COALESCE(SUM(commission_amount),0) AS total_amount
       FROM commission_ledger
       ${whereSql}
      GROUP BY target, beneficiary
      ORDER BY total_amount DESC
      LIMIT 200`,
    params
  );

  // 3) Per loket
  const [perLoket] = await pool.query<PerLoketRow[]>(
    `SELECT loket_code,
            COUNT(*) AS trx_count,
            COALESCE(SUM(CASE WHEN target='KASIR' THEN commission_amount END),0) AS total_kasir,
            COALESCE(SUM(CASE WHEN target='LOKET' THEN commission_amount END),0) AS total_loket
       FROM commission_ledger
       ${whereSql}
      GROUP BY loket_code
      ORDER BY (COALESCE(SUM(commission_amount),0)) DESC`,
    params
  );

  // 4) Per provider
  const [perProvider] = await pool.query<PerProviderRow[]>(
    `SELECT provider,
            COUNT(*) AS trx_count,
            COALESCE(SUM(CASE WHEN target='KASIR' THEN commission_amount END),0) AS total_kasir,
            COALESCE(SUM(CASE WHEN target='LOKET' THEN commission_amount END),0) AS total_loket
       FROM commission_ledger
       ${whereSql}
      GROUP BY provider
      ORDER BY (COALESCE(SUM(commission_amount),0)) DESC`,
    params
  );

  // 5) Detail (optional)
  let detail: DetailRow[] = [];
  if (includeDetail) {
    const [rows] = await pool.query<DetailRow[]>(
      `SELECT id, paid_at, loket_code, username, provider, product_code,
              item_code, transaction_code, target, beneficiary,
              rule_name, rule_type, rule_value, basis, base_amount,
              commission_amount, status
         FROM commission_ledger
         ${whereSql}
        ORDER BY paid_at DESC, id DESC
        LIMIT 1000`,
      params
    );
    detail = rows;
  }

  return NextResponse.json({
    filter: { startDate, endDate, loketCode: loketFilter || null, provider, target, beneficiary, status },
    summary: {
      totalTrx: Number(sum.total_trx) || 0,
      totalKasir: Number(sum.total_kasir) || 0,
      totalLoket: Number(sum.total_loket) || 0,
      totalAll: Number(sum.total_all) || 0,
    },
    perBeneficiary: perBeneficiary.map((r) => ({
      target: r.target,
      beneficiary: r.beneficiary,
      trxCount: r.trx_count,
      totalAmount: Number(r.total_amount) || 0,
    })),
    perLoket: perLoket.map((r) => ({
      loketCode: r.loket_code,
      trxCount: r.trx_count,
      totalKasir: Number(r.total_kasir) || 0,
      totalLoket: Number(r.total_loket) || 0,
    })),
    perProvider: perProvider.map((r) => ({
      provider: r.provider,
      trxCount: r.trx_count,
      totalKasir: Number(r.total_kasir) || 0,
      totalLoket: Number(r.total_loket) || 0,
    })),
    detail: detail.map((d) => ({
      id: d.id,
      paidAt: d.paid_at,
      loketCode: d.loket_code,
      username: d.username,
      provider: d.provider,
      productCode: d.product_code,
      itemCode: d.item_code,
      transactionCode: d.transaction_code,
      target: d.target,
      beneficiary: d.beneficiary,
      ruleName: d.rule_name,
      ruleType: d.rule_type,
      ruleValue: Number(d.rule_value) || 0,
      basis: d.basis,
      baseAmount: Number(d.base_amount) || 0,
      commissionAmount: Number(d.commission_amount) || 0,
      status: d.status,
    })),
  });
}
