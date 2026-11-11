import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/laporan/saya?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Laporan milik pengguna yang login (versi mobile / agen): selalu dibatasi ke username DAN
 * loket sesi — parameter lain tidak bisa memperluas cakupan.
 * Mengembalikan jumlah per status (lunas / diproses / gagal) dan rincian per jenis layanan.
 */
export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  const check = denyIfUnauthorized(token.role, "/api/laporan/saya", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  if (!token.loketCode || !token.username) {
    return NextResponse.json({ error: "Akun belum terhubung ke loket" }, { status: 403 });
  }

  const startDate = req.nextUrl.searchParams.get("startDate") || "";
  const endDate = req.nextUrl.searchParams.get("endDate") || "";
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) {
    return NextResponse.json({ error: "Periode tidak valid" }, { status: 400 });
  }

  const base = `FROM multi_payment_items i
    JOIN multi_payment_requests r ON r.id = i.multi_payment_id
   WHERE r.loket_code = ? AND r.username = ?
     AND DATE(COALESCE(i.paid_at, i.created_at)) BETWEEN ? AND ?`;
  const params = [token.loketCode, token.username, startDate, endDate];

  try {
    const [[statusRows], [layananRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT CASE
                  WHEN i.status = 'SUCCESS' THEN 'SUCCESS'
                  WHEN i.status = 'FAILED' THEN 'FAILED'
                  ELSE 'PENDING'
                END AS grp,
                COUNT(*) AS cnt,
                COALESCE(SUM(i.amount), 0) AS tagihan,
                COALESCE(SUM(i.admin_fee), 0) AS admin,
                COALESCE(SUM(i.total), 0) AS total
           ${base}
          GROUP BY grp`,
        params
      ),
      pool.query<RowDataPacket[]>(
        `SELECT i.service_type AS serviceType,
                COUNT(*) AS cnt,
                COALESCE(SUM(i.admin_fee), 0) AS admin,
                COALESCE(SUM(i.total), 0) AS total
           ${base} AND i.status = 'SUCCESS'
          GROUP BY i.service_type
          ORDER BY total DESC`,
        params
      ),
    ]);

    const empty = { count: 0, tagihan: 0, admin: 0, total: 0 };
    const byStatus: Record<"SUCCESS" | "PENDING" | "FAILED", typeof empty> = {
      SUCCESS: { ...empty },
      PENDING: { ...empty },
      FAILED: { ...empty },
    };
    for (const r of statusRows) {
      const k = r.grp as keyof typeof byStatus;
      byStatus[k] = { count: Number(r.cnt), tagihan: Number(r.tagihan), admin: Number(r.admin), total: Number(r.total) };
    }

    return NextResponse.json({
      startDate,
      endDate,
      loketCode: token.loketCode,
      username: token.username,
      lunas: byStatus.SUCCESS,
      diproses: byStatus.PENDING,
      gagal: byStatus.FAILED,
      perLayanan: layananRows.map((r) => ({
        serviceType: String(r.serviceType || ""),
        count: Number(r.cnt),
        admin: Number(r.admin),
        total: Number(r.total),
      })),
    });
  } catch (error) {
    console.error("[laporan/saya] error:", error);
    return NextResponse.json({ error: "Gagal menyusun laporan" }, { status: 500 });
  }
}
