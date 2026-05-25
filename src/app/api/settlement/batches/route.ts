import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import {
  listBatches,
  generateDailyBatches,
  type BatchStatus,
} from "@/lib/settlement/batch";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/settlement/batches", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as BatchStatus | null;
  const loketCode = sp.get("loketCode");
  const result = await listBatches({
    status: status ?? undefined,
    loketCode: loketCode ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/settlement/batches", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const date = body.date ? String(body.date) : undefined;
  const loketCode = body.loketCode ? String(body.loketCode) : undefined;

  try {
    const result = await generateDailyBatches({
      date,
      loketCode,
      createdBy: auth.username,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal generate batch";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
