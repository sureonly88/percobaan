import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getTrialBalance } from "@/lib/gl/reports";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/neraca-saldo", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const rows = await getTrialBalance({
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    loketCode: sp.get("loketCode") ?? undefined,
  });
  const totalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  return NextResponse.json({ rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
}
