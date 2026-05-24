import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";

const PEDAMI_URL = (process.env.PEDAMI_REPORT_URL || "").replace(/\/$/, "");
const PEDAMI_TOKEN = process.env.PEDAMI_REPORT_TOKEN || "";

function mapJenis(endpoint: string, jenisTranaksi: string): string {
  if (endpoint === "pdam") return "PDAM";
  const j = (jenisTranaksi || "").toUpperCase();
  if (j.includes("PRABAYAR") || j.includes("PREPAID")) return "PLN Prabayar";
  return "PLN Pascabayar";
}

async function fetchAllDetailPages(
  endpoint: string,
  params: URLSearchParams
): Promise<Record<string, unknown>[]> {
  if (!PEDAMI_URL || !PEDAMI_TOKEN) return [];

  const allData: Record<string, unknown>[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    p.set("per_page", "200");

    const url = `${PEDAMI_URL}/report/${endpoint}?${p.toString()}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "report-token": PEDAMI_TOKEN },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      break;
    }

    if (!res.ok) break;

    const json = await res.json() as {
      status?: boolean;
      data?: Record<string, unknown>[];
      pagination?: { last_page?: number };
    };
    if (!json.status) break;

    allData.push(...(json.data || []));
    lastPage = json.pagination?.last_page || 1;
    page++;
  } while (page <= lastPage && page <= 20); // max 4000 rows per endpoint

  return allData;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/laporan/detail", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const loketCode = searchParams.get("loketCode");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const jenis = searchParams.get("jenis") || "semua";

  if (!loketCode) {
    return NextResponse.json({ error: "loketCode wajib diisi" }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate dan endDate wajib diisi" }, { status: 400 });
  }
  if (!PEDAMI_URL || !PEDAMI_TOKEN) {
    return NextResponse.json({ error: "PEDAMI_REPORT_URL atau PEDAMI_REPORT_TOKEN belum dikonfigurasi" }, { status: 500 });
  }

  const baseParams = new URLSearchParams({
    tgl_awal: startDate,
    tgl_akhir: endDate,
    loket_code: loketCode,
  });

  const fetchPdam = jenis === "semua" || jenis === "pdam";
  const fetchPln = jenis === "semua" || jenis === "lunasin" || jenis === "kat:PLN";

  try {
    const [pdamRows, plnPostRows, plnPreRows] = await Promise.all([
      fetchPdam ? fetchAllDetailPages("pdam/detail", new URLSearchParams(baseParams)) : Promise.resolve([]),
      fetchPln ? fetchAllDetailPages("pln/postpaid/detail", new URLSearchParams(baseParams)) : Promise.resolve([]),
      fetchPln ? fetchAllDetailPages("pln/prepaid/detail", new URLSearchParams(baseParams)) : Promise.resolve([]),
    ]);

    const allRows: Array<Record<string, unknown> & { _endpoint: string }> = [
      ...pdamRows.map((r) => ({ ...r, _endpoint: "pdam" })),
      ...plnPostRows.map((r) => ({ ...r, _endpoint: "pln-postpaid" })),
      ...plnPreRows.map((r) => ({ ...r, _endpoint: "pln-prepaid" })),
    ];

    // Sort by tanggal desc, then jam desc
    allRows.sort((a, b) => {
      const da = `${String(a["tanggal"] || "")} ${String(a["jam"] || "")}`;
      const db = `${String(b["tanggal"] || "")} ${String(b["jam"] || "")}`;
      return db.localeCompare(da);
    });

    const detail = allRows.map((r) => {
      const ep = r._endpoint as string;
      const jenisTrx = ep === "pdam" ? "PDAM" : mapJenis(ep, String(r["jenis_transaksi"] || ""));
      const kodeProduk = ep === "pdam" ? "pdam-bjm" : ep === "pln-postpaid" ? "pln-postpaid" : "pln-prepaid";
      const tgl = String(r["tanggal"] || "");
      const jamRaw = String(r["jam"] || "");
      // Pad jam to HH:MM:SS (Laravel returns "9:9:7" instead of "09:09:07")
      const jamPadded = jamRaw
        ? jamRaw.split(":").map((p) => p.padStart(2, "0")).join(":")
        : "";
      const tanggalFull = jamPadded ? `${tgl}T${jamPadded}` : tgl;

      return {
        id: Number(r["id"] || 0),
        jenis: jenisTrx,
        transactionCode: String(r["id"] || ""),
        idPelanggan: String(r["idpel"] || ""),
        nama: String(r["nama"] || ""),
        periode: String(r["periode"] || ""),
        tagihan: Number(r["tagihan"] || 0),
        admin: Number(r["admin"] || 0),
        total: Number(r["total"] || 0),
        username: String(r["user_"] || "(kosong)"),
        tanggal: tanggalFull,
        status: "SUCCESS",
        processingStatus: null,
        flagTransaksi: null,
        providerErrorCode: null,
        providerErrorMessage: null,
        paidAt: null,
        failedAt: null,
        kodeProduk,
        providerDetail: {
          loket_name: String(r["loket_name"] || ""),
          loket_code: String(r["loket_code"] || ""),
          jenis_loket: String(r["jenis_loket"] || ""),
          jenis_transaksi: String(r["jenis_transaksi"] || ""),
        },
        metadata: null,
        _source: "pedami",
      };
    });

    return NextResponse.json({ detail });
  } catch (err) {
    console.error("Pedami detail fetch error:", err);
    return NextResponse.json({ error: "Gagal mengambil detail dari sistem Pedami" }, { status: 500 });
  }
}
