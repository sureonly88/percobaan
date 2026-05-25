import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { listJournalEntries, getJournalEntryDetail } from "@/lib/gl/reports";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/jurnal", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const entryId = sp.get("id");
  if (entryId) {
    const idNum = Number(entryId);
    if (!Number.isFinite(idNum)) return NextResponse.json({ error: "id invalid" }, { status: 400 });
    const detail = await getJournalEntryDetail(idNum);
    if (!detail.entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 });
    return NextResponse.json(detail);
  }

  const result = await listJournalEntries({
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    sourceType: sp.get("sourceType") ?? undefined,
    provider: sp.get("provider") ?? undefined,
    loketCode: sp.get("loketCode") ?? undefined,
    search: sp.get("q") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });
  return NextResponse.json(result);
}
