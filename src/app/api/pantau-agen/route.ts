import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAgentDetail, getAgentOverview } from "@/lib/agent-monitor";

export const dynamic = "force-dynamic";

/**
 * Pantau Agen (admin & supervisor, hanya baca).
 * GET              → ringkasan semua agen aktif + total
 * GET ?username=x  → detail satu agen (tertahan, transaksi terakhir, laporan terbuka)
 */
export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  const check = denyIfUnauthorized(token.role, "/api/pantau-agen", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const username = req.nextUrl.searchParams.get("username")?.trim();
    if (username) {
      const detail = await getAgentDetail(username);
      if (!detail) return NextResponse.json({ error: "Agen tidak ditemukan" }, { status: 404 });
      return NextResponse.json(detail);
    }
    return NextResponse.json(await getAgentOverview());
  } catch (e) {
    console.error("[pantau-agen]", e);
    return NextResponse.json({ error: "Gagal memuat data agen" }, { status: 500 });
  }
}
