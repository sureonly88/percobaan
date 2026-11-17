import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import {
  type Actor,
  ReportError,
  countAwaiting,
  createReport,
  getReport,
  listReports,
  replyReport,
  resolveReport,
  takeReport,
} from "@/lib/transaction-reports";

export const dynamic = "force-dynamic";

async function actorFor(req: NextRequest, method: string): Promise<{ actor: Actor } | { res: NextResponse }> {
  const token = await getAuthToken(req);
  if (!token) return { res: unauthorized() };
  const check = denyIfUnauthorized(token.role, "/api/laporan-transaksi", method);
  if (!check.allowed) return { res: NextResponse.json(check.response, { status: 403 }) };
  return { actor: { username: token.username, role: token.role, loketCode: token.loketCode } };
}

function fail(e: unknown) {
  if (e instanceof ReportError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[laporan-transaksi]", e);
  return NextResponse.json({ error: "Gagal memproses laporan" }, { status: 500 });
}

/**
 * GET ?id=…         → detail + pesan
 * GET ?summary=1    → { awaiting } jumlah yang menunggu tanggapan Anda
 * GET ?status=OPEN|BARU|DIPROSES|SELESAI&scope=mine → daftar
 * Kasir hanya melihat laporannya sendiri; admin/supervisor semua.
 */
export async function GET(req: NextRequest) {
  const a = await actorFor(req, "GET");
  if ("res" in a) return a.res;
  try {
    const q = req.nextUrl.searchParams;
    if (q.get("summary")) return NextResponse.json({ awaiting: await countAwaiting(a.actor) });
    const id = Number(q.get("id"));
    if (id) return NextResponse.json(await getReport(a.actor, id));
    return NextResponse.json({ reports: await listReports(a.actor, { status: q.get("status"), scope: q.get("scope") }) });
  } catch (e) {
    return fail(e);
  }
}

/** POST { multiPaymentCode, category, message } → buat laporan (atau tambah ke laporan terbuka). */
export async function POST(req: NextRequest) {
  const a = await actorFor(req, "POST");
  if ("res" in a) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createReport(a.actor, body);
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (e) {
    return fail(e);
  }
}

/** PATCH { id, action: "reply"|"take"|"resolve", message?, resolution? } */
export async function PATCH(req: NextRequest) {
  const a = await actorFor(req, "PATCH");
  if ("res" in a) return a.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown; message?: unknown; resolution?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID laporan tidak valid" }, { status: 400 });
    if (body.action === "reply") await replyReport(a.actor, id, body.message);
    else if (body.action === "take") await takeReport(a.actor, id);
    else if (body.action === "resolve") await resolveReport(a.actor, id, body.resolution);
    else return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    return NextResponse.json(await getReport(a.actor, id));
  } catch (e) {
    return fail(e);
  }
}
