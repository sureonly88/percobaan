import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/laporan/detail", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  const { searchParams } = new URL(request.url);
  const loketCode = searchParams.get("loketCode");
  const username = searchParams.get("username");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const jenis = searchParams.get("jenis") || "semua";

  const isKategoriFilter = jenis.startsWith("kat:");
  const kategoriValue = isKategoriFilter ? jenis.substring(4) : null;

  if (!loketCode && !username) {
    return NextResponse.json({ error: "loketCode atau username wajib diisi" }, { status: 400 });
  }

  try {
    let where = `WHERE i.status = 'SUCCESS'`;
    const params: (string | number)[] = [];

    // Provider/product filter
    if (jenis === "pdam") {
      where += " AND i.provider = 'PDAM'";
    } else if (jenis === "lunasin") {
      where += " AND i.provider = 'LUNASIN'";
    } else if (isKategoriFilter && kategoriValue) {
      if (kategoriValue === "PDAM") {
        where += " AND i.provider = 'PDAM'";
      } else {
        const prefixMap: Record<string, string> = {
          PLN: "pln-%", BPJS: "bpjs-%", Telkom: "telkom-%",
          Pulsa: "pulsa-%", "Paket Data": "paketdata-%", "PDAM Lunasin": "pdam-%",
        };
        if (prefixMap[kategoriValue]) {
          where += ` AND i.product_code LIKE '${prefixMap[kategoriValue]}'`;
        }
      }
    }

    if (loketCode) {
      where += " AND r.loket_code = ?";
      params.push(loketCode);
    }
    if (username) {
      where += " AND r.username = ?";
      params.push(username === "(kosong)" ? "" : username);
    }
    if (startDate && endDate) {
      where += " AND DATE(COALESCE(i.paid_at, i.created_at)) BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

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
      `SELECT i.id, ${kategoriCase} as jenis,
              i.transaction_code as transactionCode,
              i.customer_id as idPelanggan,
              i.customer_name as nama,
              i.period_label as periode,
              i.product_code as kodeProduk,
              i.amount as tagihan,
              i.admin_fee as admin,
              i.total,
              r.username,
              COALESCE(i.paid_at, i.created_at) as tanggal,
              i.status,
              i.status as processingStatus,
              i.provider_error_code as providerErrorCode,
              i.provider_error_message as providerErrorMessage,
              i.paid_at as paidAt,
              i.failed_at as failedAt,
              i.metadata_json as metadataJson,
              i.provider_response as providerResponse
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       ${where}
       ORDER BY COALESCE(i.paid_at, i.created_at) DESC
       LIMIT 1000`,
      params
    );

    const combined = rows.map((r) => {
      let meta: Record<string, unknown> = {};
      if (r.metadataJson) {
        try { meta = typeof r.metadataJson === "string" ? JSON.parse(r.metadataJson) : r.metadataJson; } catch { /* ignore */ }
      }
      let provData: Record<string, unknown> = {};
      if (r.providerResponse) {
        try { provData = typeof r.providerResponse === "string" ? JSON.parse(r.providerResponse) : r.providerResponse; } catch { /* ignore */ }
      }
      // provider_response stores the full LunasinResponse wrapper ({ rc, data: { tarif, refnum, ... } })
      // Actual data fields live inside .data — unwrap it so pv() lookups work correctly
      const provDetail = (provData.data as Record<string, unknown> | undefined) ?? provData;

      return {
        id: r.id,
        jenis: r.jenis,
        transactionCode: r.transactionCode ?? "",
        idPelanggan: r.idPelanggan ?? "-",
        nama: r.nama ?? "-",
        periode: r.periode ?? "-",
        tagihan: Number(r.tagihan ?? 0),
        admin: Number(r.admin ?? 0),
        total: Number(r.total ?? 0),
        username: r.username ?? "-",
        tanggal: r.tanggal,
        status: r.status ?? "-",
        processingStatus: r.processingStatus ?? null,
        flagTransaksi: r.status ?? null,
        providerErrorCode: r.providerErrorCode ?? null,
        providerErrorMessage: r.providerErrorMessage ?? null,
        paidAt: r.paidAt ?? null,
        failedAt: r.failedAt ?? null,
        kodeProduk: r.kodeProduk ?? null,
        // Provider response detail (prioritized, richer data from API provider)
        providerDetail: Object.keys(provDetail).length > 0 ? provDetail : null,
        // Metadata (inquiry-time data, fallback)
        metadata: Object.keys(meta).length > 0 ? meta : null,
      };
    });

    return NextResponse.json({ detail: combined });
  } catch (error) {
    console.error("Detail DB Error:", error);
    return NextResponse.json({ error: "Gagal mengambil detail transaksi" }, { status: 500 });
  }
}
