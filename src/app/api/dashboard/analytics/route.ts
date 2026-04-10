import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/dashboard", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const kategoriCase = `CASE
      WHEN i.provider = 'PDAM' THEN 'PDAM'
      WHEN i.product_code LIKE 'pln-%' THEN 'PLN'
      WHEN i.product_code LIKE 'bpjs-%' THEN 'BPJS'
      WHEN i.product_code LIKE 'telkom-%' THEN 'Telkom'
      WHEN i.product_code LIKE 'pulsa-%' THEN 'Pulsa'
      WHEN i.product_code LIKE 'paketdata-%' THEN 'Paket Data'
      WHEN i.product_code LIKE 'pdam-%' THEN 'PDAM Lunasin'
      ELSE 'Lainnya'
    END`;

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;
    const successCond = "i.status = 'SUCCESS'";
    const txDate = "COALESCE(i.paid_at, i.created_at)";

    // ── All 8 independent queries in parallel ──
    const [
      [trendAll],
      [heatAll],
      [perfCombined],
      [yoyLast],
    ] = await Promise.all([
      // 1. Monthly Trend per kategori (12 months)
      pool.query<RowDataPacket[]>(`
        SELECT DATE_FORMAT(${txDate}, '%Y-%m') as bulan,
               ${kategoriCase} as kategori,
               COUNT(*) as trx, COALESCE(SUM(i.total), 0) as nominal
        ${baseFrom}
        WHERE ${successCond}
          AND ${txDate} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY bulan, kategori ORDER BY bulan
      `),
      // 2. Heatmap
      pool.query<RowDataPacket[]>(`
        SELECT DAYOFWEEK(${txDate}) as dow, HOUR(${txDate}) as jam, COUNT(*) as cnt
        ${baseFrom}
        WHERE ${successCond}
          AND ${txDate} >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
        GROUP BY dow, jam
      `),
      // 3. Loket Perf (current + last month in 1 query via conditional aggregation)
      pool.query<RowDataPacket[]>(`
        SELECT r.loket_code, r.loket_name,
               SUM(CASE WHEN MONTH(${txDate}) = MONTH(CURDATE()) AND YEAR(${txDate}) = YEAR(CURDATE()) THEN 1 ELSE 0 END) as trx,
               COALESCE(SUM(CASE WHEN MONTH(${txDate}) = MONTH(CURDATE()) AND YEAR(${txDate}) = YEAR(CURDATE()) THEN i.total ELSE 0 END), 0) as nominal,
               COALESCE(SUM(CASE WHEN MONTH(${txDate}) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(${txDate}) = YEAR(CURDATE() - INTERVAL 1 MONTH) THEN i.total ELSE 0 END), 0) as last_nominal
        ${baseFrom}
        WHERE ${successCond}
          AND ${txDate} >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
        GROUP BY r.loket_code, r.loket_name
      `),
      // 4. YoY (same month last year)
      pool.query<RowDataPacket[]>(`
        SELECT COUNT(*) as trx, COALESCE(SUM(i.total), 0) as nominal
        ${baseFrom}
        WHERE ${successCond} AND MONTH(${txDate}) = ? AND YEAR(${txDate}) = ?
      `, [curMonth, curYear - 1]),
    ]);

    // ── Build 12-month timeline ──
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const LUNASIN_CATS = ["PLN", "BPJS", "Telkom", "Pulsa", "Paket Data", "PDAM Lunasin"] as const;
    const trendMap = new Map<string, { trx: number; nominal: number }>();
    for (const r of trendAll) {
      trendMap.set(`${r.bulan}|${r.kategori}`, { trx: Number(r.trx), nominal: Number(r.nominal) });
    }

    const monthlyTrend = months.map((m) => {
      const bulanNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const [y, mo] = m.split("-");
      const label = `${bulanNames[parseInt(mo) - 1]} ${y.slice(2)}`;
      const pdam = trendMap.get(`${m}|PDAM`) || { trx: 0, nominal: 0 };

      const catData: Record<string, { trx: number; nominal: number }> = {};
      let lunasinTotalTrx = 0, lunasinTotalNominal = 0;
      for (const cat of LUNASIN_CATS) {
        const d = trendMap.get(`${m}|${cat}`) || { trx: 0, nominal: 0 };
        catData[cat] = d;
        lunasinTotalTrx += d.trx;
        lunasinTotalNominal += d.nominal;
      }

      return {
        bulan: m,
        label,
        pdamTrx: pdam.trx,
        pdamNominal: pdam.nominal,
        plnTrx: catData["PLN"].trx,
        plnNominal: catData["PLN"].nominal,
        bpjsTrx: catData["BPJS"].trx,
        bpjsNominal: catData["BPJS"].nominal,
        telkomTrx: catData["Telkom"].trx,
        telkomNominal: catData["Telkom"].nominal,
        pulsaTrx: catData["Pulsa"].trx,
        pulsaNominal: catData["Pulsa"].nominal,
        paketdataTrx: catData["Paket Data"].trx,
        paketdataNominal: catData["Paket Data"].nominal,
        pdamLunasinTrx: catData["PDAM Lunasin"].trx,
        pdamLunasinNominal: catData["PDAM Lunasin"].nominal,
        totalTrx: pdam.trx + lunasinTotalTrx,
        totalNominal: pdam.nominal + lunasinTotalNominal,
      };
    });

    // ── Build heatmap matrix: 7 days × 24 hours ──
    const heatmap: { day: number; hour: number; count: number }[] = [];
    const heatCount = new Map<string, number>();
    for (const r of heatAll) {
      const key = `${r.dow}-${r.jam}`;
      heatCount.set(key, (heatCount.get(key) || 0) + Number(r.cnt));
    }
    for (let day = 1; day <= 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({
          day,
          hour,
          count: heatCount.get(`${day}-${hour}`) || 0,
        });
      }
    }

    // ── Build loket ranking ──
    const loketRanking = perfCombined.map((r) => ({
      loketCode: r.loket_code,
      loketName: r.loket_name || r.loket_code,
      trx: Number(r.trx),
      nominal: Number(r.nominal),
      growth: Number(r.last_nominal) > 0
        ? +((Number(r.nominal) - Number(r.last_nominal)) / Number(r.last_nominal) * 100).toFixed(1)
        : 0,
    })).sort((a, b) => b.nominal - a.nominal);

    // ── Period Comparison ──
    const curMonthKey = `${curYear}-${String(curMonth).padStart(2, "0")}`;
    const prevDate = new Date(curYear, curMonth - 2, 1);
    const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    let curTrx = 0, curNominal = 0, prevTrx = 0, prevNominal = 0;
    const allCats = ["PDAM", ...LUNASIN_CATS];
    for (const cat of allCats) {
      const c = trendMap.get(`${curMonthKey}|${cat}`) || { trx: 0, nominal: 0 };
      const p = trendMap.get(`${prevMonthKey}|${cat}`) || { trx: 0, nominal: 0 };
      curTrx += c.trx;
      curNominal += c.nominal;
      prevTrx += p.trx;
      prevNominal += p.nominal;
    }

    const yoyTrx = Number(yoyLast[0]?.trx ?? 0);
    const yoyNominal = Number(yoyLast[0]?.nominal ?? 0);

    const calcGrowth = (cur: number, prev: number) =>
      prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0;

    const periodComparison = {
      current: { trx: curTrx, nominal: curNominal },
      mom: {
        trx: prevTrx,
        nominal: prevNominal,
        trxGrowth: calcGrowth(curTrx, prevTrx),
        nominalGrowth: calcGrowth(curNominal, prevNominal),
      },
      yoy: {
        trx: yoyTrx,
        nominal: yoyNominal,
        trxGrowth: calcGrowth(curTrx, yoyTrx),
        nominalGrowth: calcGrowth(curNominal, yoyNominal),
      },
    };

    return NextResponse.json({
      monthlyTrend,
      heatmap,
      loketRanking,
      periodComparison,
    });
  } catch (error) {
    console.error("Analytics API Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data analytics" }, { status: 500 });
  }
}
