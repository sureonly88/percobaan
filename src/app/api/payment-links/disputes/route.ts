import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { isPaymentDisputeStatus, listDisputes, syncFailedProviderDisputes, updateDispute } from "@/lib/payment-links/disputes";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";

function disabledResponse() {
  return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
}

function canManage(role: string) {
  return role === "admin" || role === "supervisor";
}

export async function GET(req: NextRequest) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canManage(auth.role)) return forbidden("Hanya admin dan supervisor yang dapat melihat refund/dispute");

  await syncFailedProviderDisputes(auth.username || "SYSTEM");

  const status = req.nextUrl.searchParams.get("status") || "ALL";
  const search = req.nextUrl.searchParams.get("search") || "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") || 20)));
  const result = await listDisputes({ status, search, page, pageSize });

  return NextResponse.json({
    items: result.items,
    pagination: {
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canManage(auth.role)) return forbidden("Hanya admin dan supervisor yang dapat mengubah refund/dispute");

  const body = await req.json().catch(() => ({})) as {
    invoiceCode?: string;
    status?: string;
    reason?: string;
    resolutionNote?: string;
    refundAmount?: number;
    refundReference?: string;
  };

  if (!body.invoiceCode) return NextResponse.json({ error: "invoiceCode wajib diisi" }, { status: 400 });
  if (!body.status || !isPaymentDisputeStatus(body.status)) {
    return NextResponse.json({ error: "Status dispute tidak valid" }, { status: 400 });
  }

  try {
    const updated = await updateDispute({
      invoiceCode: body.invoiceCode,
      status: body.status,
      reason: body.reason || null,
      resolutionNote: body.resolutionNote || null,
      refundAmount: body.refundAmount == null ? null : Number(body.refundAmount),
      refundReference: body.refundReference || null,
      actorUsername: auth.username || auth.name || "unknown",
      actorRole: auth.role,
      actorIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });
    return NextResponse.json({ success: true, dispute: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui dispute";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
