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

    const userId = (session?.user as { id?: number })?.id;
    const loketCode = (session?.user as { loketCode?: string })?.loketCode;
    const canSeeAll = role === "admin" || role === "supervisor";

    const loketFilter = !canSeeAll && loketCode ? " AND r.loket_code = ?" : "";
    const loketParams = !canSeeAll && loketCode ? [loketCode] : [];

    const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;
    const successCond = "i.status = 'SUCCESS'";
    const txDate = "COALESCE(i.paid_at, i.created_at)";

    const [
      [bulanIniPerKategori],
      [bulanLaluPerKategori],
      [tahunTotal],
      [hariIniPerKategori],
      saldoLoketResult,
      [transaksiTerakhir],
    ] = await Promise.all([
      // 1. Summary bulan ini per kategori
      pool.query<RowDataPacket[]>(`
        SELECT ${kategoriCase} as kategori,
               COUNT(*) as total_trx, COALESCE(SUM(i.total), 0) as total_nominal
        ${baseFrom}
        WHERE ${successCond}
          AND MONTH(${txDate}) = MONTH(CURDATE()) AND YEAR(${txDate}) = YEAR(CURDATE())${loketFilter}
        GROUP BY kategori
      `, [...loketParams]),
      // 2. Summary bulan lalu per kategori
      pool.query<RowDataPacket[]>(`
        SELECT ${kategoriCase} as kategori,
               COALESCE(SUM(i.total), 0) as total_nominal
        ${baseFrom}
        WHERE ${successCond}
          AND MONTH(${txDate}) = MONTH(CURDATE() - INTERVAL 1 MONTH)
          AND YEAR(${txDate}) = YEAR(CURDATE() - INTERVAL 1 MONTH)${loketFilter}
        GROUP BY kategori
      `, [...loketParams]),
      // 3. Total tahun ini
      pool.query<RowDataPacket[]>(`
        SELECT COALESCE(SUM(i.total), 0) as total
        ${baseFrom}
        WHERE ${successCond} AND YEAR(${txDate}) = YEAR(CURDATE())${loketFilter}
      `, [...loketParams]),
      // 4. Hari ini per kategori
      pool.query<RowDataPacket[]>(`
        SELECT ${kategoriCase} as kategori,
               COUNT(*) as total_trx,
               COALESCE(SUM(i.total), 0) as total_nominal,
               SUM(CASE WHEN i.status = 'SUCCESS' THEN 1 ELSE 0 END) as sukses,
               SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END) as gagal
        ${baseFrom}
        WHERE ${successCond} AND DATE(${txDate}) = CURDATE()${loketFilter}
        GROUP BY kategori
      `, [...loketParams]),
      // 5. Saldo Loket
      userId
        ? pool.query<RowDataPacket[]>(`
            SELECT l.id, l.nama, l.loket_code as loketCode, l.alamat, l.jenis, l.pulsa, l.biaya_admin, l.status
            FROM lokets l JOIN users u ON u.loket_id = l.id
            WHERE u.id = ? AND l.status = 'aktif'
          `, [userId])
        : Promise.resolve([[] as RowDataPacket[]]),
      // 6. Transaksi terakhir
      pool.query<RowDataPacket[]>(`
        SELECT ${kategoriCase} as jenis,
               i.customer_id as idPelanggan,
               i.customer_name as namaPelanggan,
               i.total as nominal,
               COALESCE(i.admin_fee, 0) as biayaAdmin,
               i.status,
               r.loket_name as loketName,
               ${txDate} as tanggal
        ${baseFrom}
        WHERE ${successCond}
          AND ${txDate} >= CURDATE() - INTERVAL 7 DAY${loketFilter}
        ORDER BY ${txDate} DESC LIMIT 10
      `, [...loketParams]),
    ]);

    const saldoLoket = saldoLoketResult[0] as RowDataPacket[];

    // Build per-category summaries
    const lunasinKategories = ["PLN", "BPJS", "Telkom", "Pulsa", "Paket Data", "PDAM Lunasin"];

    const bulanIniMap = new Map<string, { trx: number; nominal: number }>();
    for (const row of bulanIniPerKategori) {
      bulanIniMap.set(row.kategori, { trx: Number(row.total_trx ?? 0), nominal: Number(row.total_nominal ?? 0) });
    }

    const bulanLaluMap = new Map<string, number>();
    for (const row of bulanLaluPerKategori) {
      bulanLaluMap.set(row.kategori, Number(row.total_nominal ?? 0));
    }

    const pdamNominalBulanIni = bulanIniMap.get("PDAM")?.nominal ?? 0;
    const pdamNominalBulanLalu = bulanLaluMap.get("PDAM") ?? 0;
    const pdamGrowth = pdamNominalBulanLalu > 0
      ? ((pdamNominalBulanIni - pdamNominalBulanLalu) / pdamNominalBulanLalu * 100)
      : 0;

    const lunasinSummary: Record<string, { nominal: number; growth: number }> = {};
    for (const kat of lunasinKategories) {
      const ini = bulanIniMap.get(kat)?.nominal ?? 0;
      const lalu = bulanLaluMap.get(kat) ?? 0;
      const growth = lalu > 0 ? ((ini - lalu) / lalu * 100) : 0;
      lunasinSummary[kat] = { nominal: ini, growth: +growth.toFixed(1) };
    }

    const totalTahun = Number(tahunTotal[0]?.total ?? 0);

    // Build hari ini per category
    const hariIniMap = new Map<string, { trx: number; nominal: number; sukses: number; gagal: number }>();
    let totalHariIniTrx = 0, totalHariIniNominal = 0, totalSukses = 0, totalGagal = 0;
    for (const row of hariIniPerKategori) {
      const trx = Number(row.total_trx ?? 0);
      const nominal = Number(row.total_nominal ?? 0);
      const sukses = Number(row.sukses ?? 0);
      const gagal = Number(row.gagal ?? 0);
      hariIniMap.set(row.kategori, { trx, nominal, sukses, gagal });
      totalHariIniTrx += trx;
      totalHariIniNominal += nominal;
      totalSukses += sukses;
      totalGagal += gagal;
    }

    const hariIniPerKategoriOut: Record<string, { trx: number; nominal: number }> = {};
    for (const kat of lunasinKategories) {
      const data = hariIniMap.get(kat);
      hariIniPerKategoriOut[kat] = { trx: data?.trx ?? 0, nominal: data?.nominal ?? 0 };
    }

    const pdamHariIni = hariIniMap.get("PDAM") || { trx: 0, nominal: 0 };

    return NextResponse.json({
      summary: {
        pdam: { nominal: pdamNominalBulanIni, growth: +pdamGrowth.toFixed(1) },
        lunasin: lunasinSummary,
        totalTahun,
      },
      hariIni: {
        totalTrx: totalHariIniTrx,
        totalNominal: totalHariIniNominal,
        sukses: totalSukses,
        gagal: totalGagal,
        pdam: {
          trx: pdamHariIni.trx,
          nominal: pdamHariIni.nominal,
        },
        perKategori: hariIniPerKategoriOut,
      },
      saldoLoket: saldoLoket.map((l) => ({
        id: l.id,
        nama: l.nama,
        loketCode: l.loketCode,
        alamat: l.alamat || "-",
        jenis: l.jenis || "-",
        pulsa: Number(l.pulsa ?? 0),
        biayaAdmin: Number(l.biaya_admin ?? 0),
        status: l.status,
      })),
      transaksiTerakhir: transaksiTerakhir.map((t) => ({
        jenis: t.jenis,
        idPelanggan: t.idPelanggan ?? "-",
        namaPelanggan: t.namaPelanggan ?? "-",
        nominal: Number(t.nominal ?? 0),
        biayaAdmin: Number(t.biayaAdmin ?? 0),
        status: t.status ?? "-",
        loketName: t.loketName ?? "-",
        tanggal: t.tanggal,
      })),
    });
  } catch (error) {
    console.error("Dashboard DB Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data dashboard" }, { status: 500 });
  }
}
