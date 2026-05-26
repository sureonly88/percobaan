import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

// GET /api/pelanggan/[idpel]/riwayat
// Returns timeline of all SUCCESS transactions for one customer across providers.
export async function GET(
  request: NextRequest,
  { params }: { params: { idpel: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idpel = decodeURIComponent(params.idpel || "").trim();
  if (!idpel) {
    return NextResponse.json({ error: "ID pelanggan wajib" }, { status: 400 });
  }

  const sessionRole = (session.user as { role?: string })?.role || "";
  const sessionLoketCode = (session.user as { loketCode?: string })?.loketCode || "";
  const canSeeAll = sessionRole === "admin" || sessionRole === "supervisor";

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));
  const statusFilter = (searchParams.get("status") || "SUCCESS").toUpperCase();

  try {
    const whereParts: string[] = ["i.customer_id = ?"];
    const queryParams: (string | number)[] = [idpel];

    if (statusFilter !== "ALL") {
      whereParts.push("i.status = ?");
      queryParams.push(statusFilter);
    }
    if (!canSeeAll) {
      whereParts.push("r.loket_code = ?");
      queryParams.push(sessionLoketCode || "__NO_LOKET__");
    }

    const where = `WHERE ${whereParts.join(" AND ")}`;

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

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         i.id,
         i.transaction_code AS transactionCode,
         i.provider,
         i.product_code AS productCode,
         ${kategoriCase} AS kategori,
         i.customer_id AS idPelanggan,
         i.customer_name AS nama,
         i.period_label AS periode,
         i.amount AS tagihan,
         i.admin_fee AS admin,
         i.total,
         i.status,
         COALESCE(i.paid_at, i.created_at) AS tanggal,
         i.paid_at AS paidAt,
         i.failed_at AS failedAt,
         r.loket_code AS loketCode,
         COALESCE(NULLIF(l.nama, ''), r.loket_code) AS loketName,
         r.username
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       LEFT JOIN lokets l ON l.loket_code = r.loket_code
       ${where}
       ORDER BY COALESCE(i.paid_at, i.created_at) DESC
       LIMIT ${limit}`,
      queryParams
    );

    const items = rows.map((r) => ({
      id: r.id,
      transactionCode: r.transactionCode,
      provider: r.provider,
      productCode: r.productCode,
      kategori: r.kategori,
      idPelanggan: r.idPelanggan,
      nama: r.nama,
      periode: r.periode,
      tagihan: Number(r.tagihan || 0),
      admin: Number(r.admin || 0),
      total: Number(r.total || 0),
      status: r.status,
      tanggal: r.tanggal,
      paidAt: r.paidAt,
      failedAt: r.failedAt,
      loketCode: r.loketCode,
      loketName: r.loketName,
      username: r.username,
    }));

    const successItems = items.filter((it) => it.status === "SUCCESS");
    const summary = {
      totalTransaksi: successItems.length,
      totalTagihan: successItems.reduce((s, it) => s + it.tagihan, 0),
      totalAdmin: successItems.reduce((s, it) => s + it.admin, 0),
      totalNominal: successItems.reduce((s, it) => s + it.total, 0),
      firstTransaction: successItems.length ? successItems[successItems.length - 1].tanggal : null,
      lastTransaction: successItems.length ? successItems[0].tanggal : null,
      perKategori: Array.from(
        successItems.reduce((map, it) => {
          const cur = map.get(it.kategori) || { kategori: it.kategori, count: 0, total: 0 };
          cur.count += 1;
          cur.total += it.total;
          map.set(it.kategori, cur);
          return map;
        }, new Map<string, { kategori: string; count: number; total: number }>()).values()
      ).sort((a, b) => b.total - a.total),
    };

    const nama = items[0]?.nama || null;

    return NextResponse.json({
      ok: true,
      idPelanggan: idpel,
      nama,
      summary,
      items,
      count: items.length,
      limit,
    });
  } catch (error) {
    console.error("[pelanggan/riwayat] error:", error);
    return NextResponse.json({ error: "Gagal mengambil riwayat pelanggan" }, { status: 500 });
  }
}
