import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getReconciliationBatch, ReconciliationItemStatus, updateReconciliationItem } from "@/lib/reconciliation";

const VALID_STATUSES: ReconciliationItemStatus[] = ["RESOLVED", "IGNORED"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/rekonsiliasi", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { id } = await params;
  const status = request.nextUrl.searchParams.get("status") || "EXCEPTION";
  const result = await getReconciliationBatch(Number(id), status);
  if (!result) return NextResponse.json({ error: "Batch tidak ditemukan" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; username?: string; name?: string } | undefined;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user?.role !== "admin") return NextResponse.json({ error: "Hanya admin yang dapat update exception rekonsiliasi" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { itemId?: number; status?: string; note?: string };
  if (!body.itemId) return NextResponse.json({ error: "itemId wajib diisi" }, { status: 400 });
  if (!body.status || !VALID_STATUSES.includes(body.status as ReconciliationItemStatus)) {
    return NextResponse.json({ error: "Status item tidak valid" }, { status: 400 });
  }

  try {
    await updateReconciliationItem({
      batchId: Number(id),
      itemId: Number(body.itemId),
      status: body.status as ReconciliationItemStatus,
      note: body.note || null,
      actorUsername: user.username || user.name || "admin",
      actorRole: user.role,
      actorIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });
    const result = await getReconciliationBatch(Number(id), "EXCEPTION");
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal update item rekonsiliasi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
