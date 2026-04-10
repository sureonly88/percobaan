import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

// GET: Fetch receipt data for reprinting a transaction
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const transactionCode = searchParams.get("transactionCode");
  const idPelanggan = searchParams.get("idPelanggan");

  if (!transactionCode && !idPelanggan) {
    return NextResponse.json({ error: "transactionCode atau idPelanggan wajib diisi" }, { status: 400 });
  }

  try {
    let where = "WHERE i.status = 'SUCCESS'";
    const params: string[] = [];

    if (transactionCode) {
      where += " AND i.transaction_code = ?";
      params.push(transactionCode);
    } else if (idPelanggan) {
      where += " AND i.customer_id = ?";
      params.push(idPelanggan);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        i.id, i.transaction_code as transactionCode,
        i.customer_id as idPelanggan,
        i.customer_name as nama,
        i.provider, i.product_code as productCode,
        i.period_label as periode,
        i.amount, i.admin_fee as adminFee, i.total,
        i.metadata_json as metadataJson,
        i.provider_response as providerResponse,
        r.loket_name as loketName, r.loket_code as loketCode,
        r.username,
        COALESCE(i.paid_at, i.created_at) as tanggal,
        i.paid_at as paidAt
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      ${where}
      ORDER BY COALESCE(i.paid_at, i.created_at) DESC
      LIMIT 50`,
      params
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const first = rows[0];
    const isPdam = first.provider === "PDAM";

    if (isPdam) {
      return reprintPdam(rows);
    } else {
      return reprintLunasin(rows);
    }
  } catch (error) {
    console.error("Reprint Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data struk" }, { status: 500 });
  }
}

function parseJson(val: unknown): Record<string, unknown> {
  if (!val) return {};
  try {
    return typeof val === "string" ? JSON.parse(val) : (val as Record<string, unknown>);
  } catch {
    return {};
  }
}

function reprintPdam(rows: RowDataPacket[]): NextResponse {
  const first = rows[0];

  const bills = rows.map((r) => {
    const meta = parseJson(r.metadataJson);
    return {
      idpel: r.idPelanggan,
      nama: r.nama,
      alamat: String(meta.alamat || ""),
      gol: String(meta.idgol || meta.gol || ""),
      periode: r.periode,
      standLalu: Number(meta.standLalu ?? meta.stand_lalu ?? 0),
      standKini: Number(meta.standKini ?? meta.stand_kini ?? 0),
      hargaAir: Number(meta.hargaAir ?? meta.harga_air ?? 0),
      denda: Number(meta.denda ?? 0),
      materai: Number(meta.materai ?? 0),
      limbah: Number(meta.limbah ?? 0),
      retribusi: Number(meta.retribusi ?? 0),
      bebanTetap: Number(meta.bebanTetap ?? meta.beban_tetap ?? 0),
      biayaMeter: Number(meta.biayaMeter ?? meta.biaya_meter ?? 0),
      diskon: Number(meta.diskon ?? 0),
      tagihan: Number(r.amount ?? 0),
      admin: Number(r.adminFee ?? 0),
      total: Number(r.total ?? 0),
      transactionCode: r.transactionCode || "",
    };
  });

  const totalTagihan = bills.reduce((s, b) => s + b.tagihan, 0);
  const totalAdmin = bills.reduce((s, b) => s + b.admin, 0);
  const totalBayar = bills.reduce((s, b) => s + b.total, 0);

  return NextResponse.json({
    loketName: first.loketName || "-",
    loketCode: first.loketCode || "-",
    kasir: first.username || "-",
    tanggal: first.paidAt || first.tanggal || "-",
    bills,
    totalTagihan,
    totalAdmin,
    totalBayar,
  });
}

function reprintLunasin(rows: RowDataPacket[]): NextResponse {
  const first = rows[0];

  const bills = rows.map((r) => {
    const meta = parseJson(r.metadataJson);
    const provData = parseJson(r.providerResponse);
    const pd = (provData.data || provData) as Record<string, unknown>;

    return {
      type: "pln" as const,
      idpel: r.idPelanggan,
      nama: r.nama,
      kodeProduk: r.productCode || "",
      periode: r.periode || String(pd.periode || ""),
      tarif: String(meta.tarif || pd.tarif || ""),
      daya: String(meta.daya || pd.daya || ""),
      standMeter: String(meta.standMeter || pd.stand_meter || ""),
      noMeter: String(pd.nometer || ""),
      jumBill: String(meta.jumBill || pd.jum_bill || "1"),
      tokenPln: String(meta.tokenPln || pd.token || ""),
      refnumLunasin: String(meta.refnumLunasin || pd.refnum_lunasin || ""),
      rpAmount: Number(r.amount || 0),
      rpAdmin: Number(r.adminFee || 0),
      tagihan: Number(r.total || 0),
      admin: 0,
      total: Number(r.total || 0),
      transactionCode: r.transactionCode || "",
      kwh: String(pd.kwh || ""),
      rpMaterai: Number(pd.rp_materai || 0),
      rpPpn: Number(pd.rp_ppn || 0),
      rpPju: Number(pd.rp_pju || 0),
      rpAngsuran: Number(pd.rp_angsuran || 0),
      rpToken: Number(pd.rp_token || 0),
      rpTotal: Number(pd.rp_total || 0),
      saldoTerpotong: Number(pd.saldo_terpotong || 0),
      refnum: String(pd.refnum || ""),
      tglLunas: String(pd.tgl_lunas || ""),
      pesanBiller: String(pd.pesan_biller || ""),
    };
  });

  const totalTagihan = bills.reduce((s, b) => s + b.tagihan, 0);

  return NextResponse.json({
    loketName: first.loketName || "-",
    loketCode: first.loketCode || "-",
    kasir: first.username || "-",
    tanggal: first.paidAt || first.tanggal || "-",
    bills,
    totalTagihan,
    totalAdmin: 0,
    totalBayar: totalTagihan,
    isLunasin: true,
  });
}
