import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getMarginReport } from "@/lib/gl/reports";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/margin", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const groupBy = (sp.get("groupBy") ?? "PROVIDER").toUpperCase() as
    | "PROVIDER"
    | "SERVICE"
    | "PRODUCT"
    | "LOKET";

  const rows = await getMarginReport({
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    loketCode: sp.get("loketCode") ?? undefined,
    provider: sp.get("provider") ?? undefined,
    groupBy,
  });
  const totals = rows.reduce(
    (acc, r) => {
      acc.transactionCount += r.transactionCount;
      acc.totalAmount += r.totalAmount;
      acc.totalAdminFee += r.totalAdminFee;
      acc.totalGross += r.totalGross;
      return acc;
    },
    { transactionCount: 0, totalAmount: 0, totalAdminFee: 0, totalGross: 0 }
  );
  return NextResponse.json({ rows, totals, groupBy });
}
