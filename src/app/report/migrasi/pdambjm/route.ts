// ─────────────────────────────────────────────────────────────────────────────
// GET /report/migrasi/pdambjm
//
// Padanan endpoint pedami-payment (ReportAPIController@migrasiPdambjm): data
// pembayaran PDAM Native dikembalikan dalam bentuk baris tabel `pdambjm_trans`
// agar bisa langsung di-upsert oleh MigrasiPdambjmController / `php artisan
// migrasi:pdambjm` di pedami-payment (kunci cust_id + blth, kolom `id` dibuang).
//
// Sumber data: multi_payment_items (provider PDAM, service_type PDAM_NATIVE)
//   - status SUCCESS            → flag_transaksi NULL
//   - status VOID (dibatalkan)  → flag_transaksi 'D' (hanya bila include_deleted=1)
// Item hasil impor LEGACY (service_type 'PDAM') tidak ikut, supaya data yang
// berasal dari pedami-payment tidak dikirim balik.
//
// Auth: header `report-token`, dicocokkan dengan REPORT_API_TOKENS (.env,
// dipisah koma). Token berlaku untuk semua loket.
//
// Query: tgl_awal, tgl_akhir (wajib, Y-m-d, filter tanggal bayar), loket_code
// (koma), username, include_deleted (0/1), page (1), per_page (500, maks 1000).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { parsePdamNumber } from "@/lib/pdam-number";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_LIMIT_PER_MINUTE = 60;
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function configuredTokens(): string[] {
  return (process.env.REPORT_API_TOKENS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokenMatches(given: string, tokens: string[]): boolean {
  const g = Buffer.from(given);
  let ok = false;
  for (const t of tokens) {
    const b = Buffer.from(t);
    if (b.length === g.length && timingSafeEqual(b, g)) ok = true;
  }
  return ok;
}

function rateLimited(token: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(token);
  if (!bucket || now - bucket.windowStart >= 60_000) {
    rateBuckets.set(token, { windowStart: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  // Angka provider PDAM memakai titik ribuan ("58.500" = 58500)
  const n = typeof v === "number" ? v : parsePdamNumber(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * metadata_json PDAM ditulis dalam dua gaya kunci: snake_case (alur pay: harga_air,
 * stand_lalu, …) dan camelCase (snapshot inquiry: harga, standLalu, …).
 * provider_response (respons asli PDAM per tagihan) jadi cadangan terakhir.
 */
function pick(sources: Record<string, unknown>[], keys: string[]): unknown {
  for (const src of sources) {
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return undefined;
}

function parseMeta(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(v));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ status: false, response_code: code, message }, { status });
}

export async function GET(request: NextRequest) {
  const tokens = configuredTokens();
  const token = request.headers.get("report-token") || "";
  if (!token) return fail(401, "4010", "REPORT TOKEN REQUIRED");
  if (tokens.length === 0 || !tokenMatches(token, tokens)) {
    return fail(401, "4011", "INVALID OR INACTIVE REPORT TOKEN");
  }
  if (rateLimited(token)) return fail(429, "4290", "TOO MANY REQUESTS");

  const sp = request.nextUrl.searchParams;
  const tglAwal = sp.get("tgl_awal") || "";
  const tglAkhir = sp.get("tgl_akhir") || "";
  if (!tglAwal || !tglAkhir) {
    return fail(400, "4001", "PARAMETER tgl_awal DAN tgl_akhir WAJIB DIISI");
  }
  if (!isValidDate(tglAwal) || !isValidDate(tglAkhir)) {
    return fail(400, "4002", "FORMAT TANGGAL HARUS Y-m-d");
  }

  const perPage = Math.min(Math.max(1, Math.trunc(Number(sp.get("per_page")) || 500)), 1000);
  const page = Math.max(1, Math.trunc(Number(sp.get("page")) || 1));
  const includeDeleted = ["1", "true"].includes((sp.get("include_deleted") || "0").toLowerCase());
  const loketCodes = (sp.get("loket_code") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const username = (sp.get("username") || "").trim();

  const where: string[] = [
    "mi.provider = 'PDAM'",
    "mi.service_type = 'PDAM_NATIVE'",
    includeDeleted ? "mi.status IN ('SUCCESS','VOID')" : "mi.status = 'SUCCESS'",
    "mi.paid_at BETWEEN ? AND ?",
  ];
  const params: unknown[] = [`${tglAwal} 00:00:00`, `${tglAkhir} 23:59:59`];
  if (loketCodes.length > 0) {
    where.push(`mpr.loket_code IN (${loketCodes.map(() => "?").join(",")})`);
    params.push(...loketCodes);
  }
  if (username) {
    where.push("mpr.username = ?");
    params.push(username);
  }
  const fromWhere = `
    FROM multi_payment_items mi
    JOIN multi_payment_requests mpr ON mpr.id = mi.multi_payment_id
    LEFT JOIN lokets l ON l.loket_code = mpr.loket_code
    WHERE ${where.join(" AND ")}`;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total ${fromWhere}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT mi.id, mi.transaction_code, mi.customer_id, mi.customer_name, mi.period_label,
              mi.amount, mi.admin_fee, mi.total, mi.status, mi.metadata_json, mi.provider_response,
              mpr.username, mpr.loket_name, mpr.loket_code, l.jenis AS loket_jenis,
              DATE_FORMAT(mi.paid_at,    '%Y-%m-%d %H:%i:%s') AS transaction_date,
              DATE_FORMAT(mi.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(mi.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         ${fromWhere}
        ORDER BY mi.paid_at ASC, mi.id ASC
        LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    const data = rows.map((r) => {
      const m = parseMeta(r.metadata_json);
      const p = parseMeta(r.provider_response);
      const src = [m, p];
      const get = (...keys: string[]) => num(pick(src, keys));
      return {
        id: Number(r.id),
        transaction_code: String(r.transaction_code || ""),
        transaction_date: r.transaction_date,
        cust_id: String(r.customer_id || ""),
        nama: String(r.customer_name || ""),
        alamat: String(pick(src, ["alamat"]) ?? ""),
        blth: String(r.period_label || pick(src, ["blth", "thbln"]) || ""),
        harga_air: get("harga_air", "harga", "hargaAir"),
        abodemen: get("abodemen", "byadmin"),
        materai: get("materai"),
        limbah: get("limbah"),
        retribusi: get("retribusi"),
        denda: get("denda"),
        stand_lalu: get("stand_lalu", "standLalu", "stand_l"),
        stand_kini: get("stand_kini", "standKini", "stand_i"),
        beban_tetap: get("beban_tetap", "bebanTetap", "biaya_tetap"),
        biaya_meter: get("biaya_meter", "biayaMeter"),
        sub_total: num(r.amount),
        admin: num(r.admin_fee),
        total: num(r.total),
        diskon: get("diskon"),
        username: String(r.username || ""),
        loket_name: String(r.loket_name || ""),
        loket_code: String(r.loket_code || ""),
        idgol: String(pick(src, ["idgol", "gol"]) ?? ""),
        jenis_loket: String(m.jenis_loket || r.loket_jenis || ""),
        flag_transaksi: r.status === "VOID" ? "D" : null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return NextResponse.json({
      status: true,
      response_code: "0000",
      message: "DATA MIGRASI PDAMBJM_TRANS",
      filter: { tgl_awal: tglAwal, tgl_akhir: tglAkhir, include_deleted: includeDeleted },
      data,
      pagination: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: Math.max(1, Math.ceil(total / perPage)),
      },
    });
  } catch (err) {
    console.error("report/migrasi/pdambjm error:", err);
    return fail(500, "5000", "INTERNAL SERVER ERROR");
  }
}
