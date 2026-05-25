import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { approveBatch, getBatch, markBatchPaid } from "@/lib/settlement/batch";
import { auditLog } from "@/lib/audit-log";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/settlement/batches", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 });
  const detail = await getBatch(id);
  if (!detail.batch) return NextResponse.json({ error: "Batch tidak ditemukan" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/settlement/batches", "PATCH");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "").toUpperCase();

  try {
    if (action === "APPROVE") {
      const batch = await approveBatch({ id, username: auth.username });
      await auditLog({
        actorType: "user",
        actorUsername: auth.username,
        actorRole: auth.role,
        action: "SETTLEMENT_APPROVE",
        entityType: "settlement_batch",
        entityId: batch.id,
        context: {
          batchCode: batch.batchCode,
          loketCode: batch.loketCode,
          netPayable: batch.netPayable,
        },
      });
      return NextResponse.json({ success: true, batch });
    }
    if (action === "MARK_PAID") {
      const batch = await markBatchPaid({
        id,
        username: auth.username,
        reference: body.reference ? String(body.reference) : null,
        notes: body.notes ? String(body.notes) : null,
      });
      await auditLog({
        actorType: "user",
        actorUsername: auth.username,
        actorRole: auth.role,
        action: "SETTLEMENT_MARK_PAID",
        entityType: "settlement_batch",
        entityId: batch.id,
        context: {
          batchCode: batch.batchCode,
          loketCode: batch.loketCode,
          netPayable: batch.netPayable,
          reference: batch.paidReference,
        },
      });
      return NextResponse.json({ success: true, batch });
    }
    return NextResponse.json({ error: "action harus APPROVE atau MARK_PAID" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memproses batch";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
