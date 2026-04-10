import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { cached } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/laporan", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const jenis = searchParams.get("jenis") || "semua";

  const canSeeAll = role === "admin" || role === "supervisor";
  const userLoketName = (session?.user as { loketName?: string })?.loketName;
  const loket = !canSeeAll && userLoketName ? userLoketName : searchParams.get("loket");

  // Category filter: "semua" | "pdam" | "lunasin" | "kat:PLN" | "kat:BPJS" | ...
  const isKategoriFilter = jenis.startsWith("kat:");
  const kategoriValue = isKategoriFilter ? jenis.substring(4) : null;

  const kategoriCase = `
    CASE
      WHEN i.provider = 'PDAM' THEN 'PDAM'
      WHEN i.product_code LIKE 'pln-%' THEN 'PLN'
      WHEN i.product_code LIKE 'bpjs-%' THEN 'BPJS'
      WHEN i.product_code LIKE 'telkom-%' THEN 'Telkom'
      WHEN i.product_code LIKE 'pulsa-%' THEN 'Pulsa'
      WHEN i.product_code LIKE 'paketdata-%' THEN 'Paket Data'
      WHEN i.product_code LIKE 'pdam-%' THEN 'PDAM Lunasin'
      ELSE 'Lainnya'
    END
  `;

  function buildProviderFilter(): string {
    if (jenis === "pdam") return " AND i.provider = 'PDAM'";
    if (jenis === "lunasin") return " AND i.provider = 'LUNASIN'";
    if (isKategoriFilter && kategoriValue) {
      if (kategoriValue === "PDAM") return " AND i.provider = 'PDAM'";
      const prefixMap: Record<string, string> = {
        PLN: "pln-%", BPJS: "bpjs-%", Telkom: "telkom-%",
        Pulsa: "pulsa-%", "Paket Data": "paketdata-%", "PDAM Lunasin": "pdam-%",
      };
      if (prefixMap[kategoriValue]) return ` AND i.product_code LIKE '${prefixMap[kategoriValue]}'`;
    }
    return "";
  }

  const providerFilter = buildProviderFilter();

  try {
    const successCond = "i.status = 'SUCCESS'";
    const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;

    let dateFilter = "";
    const dateParams: (string | number)[] = [];
    if (startDate && endDate) {
      dateFilter = " AND DATE(COALESCE(i.paid_at, i.created_at)) BETWEEN ? AND ?";
      dateParams.push(startDate, endDate);
    }

    let loketFilter = "";
    const loketParams: (string | number)[] = [];
    if (loket && loket !== "Semua Loket") {
      loketFilter = " AND r.loket_name = ?";
      loketParams.push(loket);
    }

    const allParams = [...dateParams, ...loketParams];

    // --- PDAM summary ---
    const pdamSummaryQuery = `
      SELECT COUNT(*) as total_trx, COALESCE(SUM(i.total), 0) as total_nominal
      ${baseFrom}
      WHERE ${successCond} AND i.provider = 'PDAM'${dateFilter}${loketFilter}
    `;

    // --- Lunasin summary ---
    const lunasinSummaryQuery = `
      SELECT COUNT(*) as total_trx, COALESCE(SUM(i.total), 0) as total_nominal
      ${baseFrom}
      WHERE ${successCond} AND i.provider = 'LUNASIN'${dateFilter}${loketFilter}
    `;

    // --- Rekap per loket ---
    const rekapQuery = `
      SELECT
        r.loket_code, r.loket_name,
        SUM(CASE WHEN i.provider = 'PDAM' THEN 1 ELSE 0 END) as trx_pdam,
        SUM(CASE WHEN i.provider = 'LUNASIN' THEN 1 ELSE 0 END) as trx_lunasin,
        COUNT(*) as jumlah_trx,
        COALESCE(SUM(i.total), 0) as total_nominal,
        COALESCE(SUM(i.amount), 0) as total_tagihan,
        COALESCE(SUM(i.admin_fee), 0) as total_admin,
        l.jenis as jenis_loket
      ${baseFrom}
      LEFT JOIN lokets l ON l.loket_code = r.loket_code COLLATE utf8mb4_general_ci
      WHERE ${successCond}${providerFilter}${dateFilter}${loketFilter}
      GROUP BY r.loket_code, r.loket_name, l.jenis
      ORDER BY total_nominal DESC
    `;

    // --- Rekap per loket per user ---
    const rekapLoketUserQuery = `
      SELECT r.loket_code, r.username,
        COUNT(*) as jumlah_trx,
        COALESCE(SUM(i.total), 0) as total_nominal
      ${baseFrom}
      WHERE ${successCond}${providerFilter}${dateFilter}${loketFilter}
      GROUP BY r.loket_code, r.username
      ORDER BY r.loket_code, total_nominal DESC
    `;

    // --- Produk breakdown ---
    const produkQuery = `
      SELECT ${kategoriCase} as kategori,
        COUNT(*) as total_trx,
        COALESCE(SUM(i.total), 0) as total_nominal
      ${baseFrom}
      WHERE ${successCond}${providerFilter}${dateFilter}${loketFilter}
      GROUP BY kategori
      ORDER BY total_nominal DESC
    `;

    // --- Rekap produk per loket ---
    const rpQuery = `
      SELECT r.loket_code, ${kategoriCase} as kategori, COUNT(*) as cnt
      ${baseFrom}
      WHERE ${successCond}${providerFilter}${dateFilter}${loketFilter}
      GROUP BY r.loket_code, kategori
    `;

    // --- Loket list ---
    const loketListQuery = `SELECT nama, loket_code FROM lokets WHERE nama IS NOT NULL AND nama != '' ORDER BY nama`;

    const skipPdam = jenis === "lunasin" || isKategoriFilter;
    const skipLunasin = jenis === "pdam";

    const [pdamSummaryRow, lunasinSummaryRow, rekap, rekapLoketUser, loketList, produkBreakdownRows, rekapProdukPerLoketRows] = await Promise.all([
      skipPdam
        ? { total_trx: 0, total_nominal: 0 }
        : pool.query<RowDataPacket[]>(pdamSummaryQuery, allParams).then(([r]) => r[0] ?? { total_trx: 0, total_nominal: 0 }),
      skipLunasin
        ? { total_trx: 0, total_nominal: 0 }
        : pool.query<RowDataPacket[]>(lunasinSummaryQuery, allParams).then(([r]) => r[0] ?? { total_trx: 0, total_nominal: 0 }),
      pool.query<RowDataPacket[]>(rekapQuery, allParams).then(([r]) => r),
      pool.query<RowDataPacket[]>(rekapLoketUserQuery, allParams).then(([r]) => r),
      cached("laporan:loketList", async () => {
        const [rows] = await pool.query<RowDataPacket[]>(loketListQuery);
        return rows;
      }, 5 * 60 * 1000),
      pool.query<RowDataPacket[]>(produkQuery, allParams).then(([r]) => r),
      pool.query<RowDataPacket[]>(rpQuery, allParams).then(([r]) => r),
    ]);

    const pdamTrx = Number(pdamSummaryRow?.total_trx ?? 0);
    const pdamNominal = Number(pdamSummaryRow?.total_nominal ?? 0);
    const lunasinTrx = Number(lunasinSummaryRow?.total_trx ?? 0);
    const lunasinNominal = Number(lunasinSummaryRow?.total_nominal ?? 0);
    const totalNominal = pdamNominal + lunasinNominal;
    const totalTrx = pdamTrx + lunasinTrx;
    const pdamPercent = totalTrx > 0 ? Math.round((pdamTrx / totalTrx) * 100) : 0;
    const lunasinPercent = totalTrx > 0 ? 100 - pdamPercent : 0;

    return NextResponse.json({
      summary: {
        pdam: { totalTrx: pdamTrx, totalNominal: pdamNominal },
        lunasin: { totalTrx: lunasinTrx, totalNominal: lunasinNominal },
        gabungan: { totalTrx, totalNominal },
        persentase: { pdam: pdamPercent, lunasin: lunasinPercent },
      },
      produkBreakdown: (produkBreakdownRows as RowDataPacket[]).map((r) => ({
        kategori: (r.kategori as string) || "Lainnya",
        totalTrx: Number(r.total_trx),
        totalNominal: Number(r.total_nominal),
      })),
      rekapProdukPerLoket: (rekapProdukPerLoketRows as RowDataPacket[]).map((r) => ({
        loketCode: (r.loket_code as string) || "",
        kategori: (r.kategori as string) || "Lainnya",
        count: Number(r.cnt),
      })),
      rekap: (rekap as RowDataPacket[]).map((r) => ({
        loketCode: r.loket_code,
        loketName: r.loket_name,
        jumlahTrx: Number(r.jumlah_trx),
        totalNominal: Number(r.total_nominal),
        totalTagihan: Number(r.total_tagihan),
        totalAdmin: Number(r.total_admin),
        trxPdam: Number(r.trx_pdam),
        trxLunasin: Number(r.trx_lunasin),
        jenisLoket: (r.jenis_loket as string) || "-",
      })),
      loketList: (loketList as RowDataPacket[]).map((l) => ({ nama: l.nama as string, loketCode: l.loket_code as string })),
      rekapLoketUser: (rekapLoketUser as RowDataPacket[]).map((r) => ({
        loketCode: (r.loket_code as string) || "",
        username: (r.username as string) || "(kosong)",
        jumlahTrx: Number(r.jumlah_trx),
        totalNominal: Number(r.total_nominal),
      })),
    });
  } catch (error) {
    console.error("DB Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data dari database" }, { status: 500 });
  }
}
