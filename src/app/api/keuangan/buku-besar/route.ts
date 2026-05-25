import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAccountLedger } from "@/lib/gl/reports";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/buku-besar", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const accountCode = sp.get("accountCode");
  if (!accountCode) {
    return NextResponse.json({ error: "accountCode wajib" }, { status: 400 });
  }
  const result = await getAccountLedger({
    accountCode,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    loketCode: sp.get("loketCode") ?? undefined,
  });
  if (!result.account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
  return NextResponse.json(result);
}
