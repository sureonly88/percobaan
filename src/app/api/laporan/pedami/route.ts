import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";

const PEDAMI_URL = (process.env.PEDAMI_REPORT_URL || "").replace(/\/$/, "");
const PEDAMI_TOKEN = process.env.PEDAMI_REPORT_TOKEN || "";

async function fetchAllPages(endpoint: string, params: URLSearchParams): Promise<Record<string, unknown>[]> {
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

    const json = await res.json() as { status?: boolean; data?: Record<string, unknown>[]; pagination?: { last_page?: number } };
    if (!json.status) break;

    allData.push(...(json.data || []));
    lastPage = json.pagination?.last_page || 1;
    page++;
  } while (page <= lastPage && page <= 10); // max 2000 rows per endpoint

  return allData;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/laporan", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const jenis = searchParams.get("jenis") || "semua";

  if (!startDate || !endDate) {
    return NextResponse.json({ rekap: [], rekapLoketUser: [], summary: null });
  }

  if (!PEDAMI_URL || !PEDAMI_TOKEN) {
    return NextResponse.json({ rekap: [], rekapLoketUser: [], summary: null, error: "PEDAMI_REPORT_URL atau PEDAMI_REPORT_TOKEN belum dikonfigurasi" });
  }

  const baseParams = new URLSearchParams({ tgl_awal: startDate, tgl_akhir: endDate });

  // Determine which endpoints to call based on jenis filter
  const fetchPdam = jenis === "semua" || jenis === "pdam";
  const fetchPln = jenis === "semua" || jenis === "lunasin" || jenis === "kat:PLN";

  try {
    const [pdamRows, plnPostRows, plnPreRows] = await Promise.all([
      fetchPdam ? fetchAllPages("pdam/rekap", new URLSearchParams(baseParams)) : Promise.resolve([]),
      fetchPln ? fetchAllPages("pln/postpaid/rekap", new URLSearchParams(baseParams)) : Promise.resolve([]),
      fetchPln ? fetchAllPages("pln/prepaid/rekap", new URLSearchParams(baseParams)) : Promise.resolve([]),
    ]);

    type LoketAgg = {
      loketCode: string;
      loketName: string;
      jumlahTrx: number;
      totalNominal: number;
      totalTagihan: number;
      totalAdmin: number;
      trxPdam: number;
      trxPln: number;
      jenisLoket: string;
    };

    const loketMap = new Map<string, LoketAgg>();
    const userKey2Agg = new Map<string, { loketCode: string; username: string; jumlahTrx: number; totalNominal: number }>();

    const processRows = (rows: Record<string, unknown>[], isPdam: boolean) => {
      for (const r of rows) {
        const code = String(r["loket_code"] || "");
        let agg = loketMap.get(code);
        if (!agg) {
          agg = {
            loketCode: code,
            loketName: String(r["loket_name"] || ""),
            jumlahTrx: 0,
            totalNominal: 0,
            totalTagihan: 0,
            totalAdmin: 0,
            trxPdam: 0,
            trxPln: 0,
            jenisLoket: String(r["jenis_loket"] || "-"),
          };
          loketMap.set(code, agg);
        }
        const trx = Number(r["jumlah_transaksi"] || 0);
        agg.jumlahTrx += trx;
        agg.totalNominal += Number(r["total_total"] || 0);
        agg.totalTagihan += Number(r["total_tagihan"] || 0);
        agg.totalAdmin += Number(r["total_admin"] || 0);
        if (isPdam) agg.trxPdam += trx;
        else agg.trxPln += trx;

        // Per-user aggregation
        const uKey = `${code}::${String(r["user_"] || "")}`;
        const uAgg = userKey2Agg.get(uKey);
        if (uAgg) {
          uAgg.jumlahTrx += trx;
          uAgg.totalNominal += Number(r["total_total"] || 0);
        } else {
          userKey2Agg.set(uKey, {
            loketCode: code,
            username: String(r["user_"] || "(kosong)"),
            jumlahTrx: trx,
            totalNominal: Number(r["total_total"] || 0),
          });
        }
      }
    };

    processRows(pdamRows, true);
    processRows(plnPostRows, false);
    processRows(plnPreRows, false);

    const rekap = Array.from(loketMap.values())
      .map((a) => ({
        loketCode: a.loketCode,
        loketName: a.loketName,
        jumlahTrx: a.jumlahTrx,
        totalNominal: a.totalNominal,
        totalTagihan: a.totalTagihan,
        totalAdmin: a.totalAdmin,
        trxPdam: a.trxPdam,
        trxLunasin: a.trxPln,
        jenisLoket: a.jenisLoket,
        source: "pedami" as const,
      }))
      .sort((a, b) => b.totalNominal - a.totalNominal);

    const rekapLoketUser = Array.from(userKey2Agg.values())
      .sort((a, b) => a.loketCode.localeCompare(b.loketCode) || b.totalNominal - a.totalNominal);

    const totalPdamNominal = pdamRows.reduce((s, r) => s + Number(r["total_total"] || 0), 0);
    const totalPdamTrx = pdamRows.reduce((s, r) => s + Number(r["jumlah_transaksi"] || 0), 0);
    const totalPlnNominal = [...plnPostRows, ...plnPreRows].reduce((s, r) => s + Number(r["total_total"] || 0), 0);
    const totalPlnTrx = [...plnPostRows, ...plnPreRows].reduce((s, r) => s + Number(r["jumlah_transaksi"] || 0), 0);

    return NextResponse.json({
      rekap,
      rekapLoketUser,
      summary: {
        pdam: { totalTrx: totalPdamTrx, totalNominal: totalPdamNominal },
        lunasin: { totalTrx: totalPlnTrx, totalNominal: totalPlnNominal },
        gabungan: {
          totalTrx: totalPdamTrx + totalPlnTrx,
          totalNominal: totalPdamNominal + totalPlnNominal,
        },
      },
    });
  } catch (err) {
    console.error("Pedami rekap fetch error:", err);
    return NextResponse.json({ rekap: [], rekapLoketUser: [], summary: null });
  }
}
