import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { canProcessPayment } from "@/lib/rbac";
import { addInvoiceEvent, findInvoiceByCode, getInvoiceEvents, getInvoiceItems, updateInvoiceStatus } from "@/lib/payment-links/repository";
import { syncInvoiceGatewayStatus } from "@/lib/payment-links/service";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";
import { auditLog } from "@/lib/audit-log";

function disabledResponse() {
  return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceCode: string }> }
) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canProcessPayment(auth.role)) return forbidden("Anda tidak memiliki akses payment link");
  const { invoiceCode } = await params;
  const invoice = await findInvoiceByCode(invoiceCode);
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
  const items = await getInvoiceItems(invoice.id);
  const events = await getInvoiceEvents(invoice.id);
  return NextResponse.json({ invoice, items, events });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceCode: string }> }
) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canProcessPayment(auth.role)) return forbidden("Anda tidak memiliki akses payment link");

  const { invoiceCode } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; reason?: string };
  if (!["cancel", "sync-gateway"].includes(String(body.action || ""))) return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });

  const invoice = await findInvoiceByCode(invoiceCode);
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });

  if (body.action === "sync-gateway") {
    if (!invoice.gatewayOrderId) return NextResponse.json({ error: "Invoice belum memiliki gateway order ID" }, { status: 409 });
    const result = await syncInvoiceGatewayStatus(invoice);
    await auditLog({
      actorType: "user",
      actorUsername: auth.username || auth.name || null,
      actorRole: auth.role,
      actorIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      action: "PAYMENT_LINK_GATEWAY_SYNC",
      entityType: "payment_invoice",
      entityId: invoice.id,
      before: { status: invoice.status, gatewayStatus: invoice.gatewayStatus },
      after: result,
      context: { invoiceCode, gatewayOrderId: invoice.gatewayOrderId },
    });
    return NextResponse.json({ success: true, result });
  }

  if (!["UNPAID", "PAYMENT_PENDING"].includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice tidak dapat dibatalkan pada status ini" }, { status: 409 });
  }

  await updateInvoiceStatus(invoice.id, "CANCELLED");
  await addInvoiceEvent({
    invoiceId: invoice.id,
    eventType: "PAYMENT_LINK_CANCELLED",
    actorType: "user",
    actorUsername: auth.username,
    beforeStatus: invoice.status,
    afterStatus: "CANCELLED",
    payload: { reason: body.reason || null },
  });
  await auditLog({
    actorType: "user",
    actorUsername: auth.username || auth.name || null,
    actorRole: auth.role,
    actorIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    action: "PAYMENT_LINK_CANCEL",
    entityType: "payment_invoice",
    entityId: invoice.id,
    before: { status: invoice.status },
    after: { status: "CANCELLED", invoiceCode },
    context: { reason: body.reason || null },
  });
  return NextResponse.json({ success: true });
}
