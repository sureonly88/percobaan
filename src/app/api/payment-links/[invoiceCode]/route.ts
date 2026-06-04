import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { canProcessPayment } from "@/lib/rbac";
import { addInvoiceEvent, findInvoiceByCode, getInvoiceEvents, getInvoiceItems, updateInvoiceStatus } from "@/lib/payment-links/repository";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";

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
  if (body.action !== "cancel") return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });

  const invoice = await findInvoiceByCode(invoiceCode);
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
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
  return NextResponse.json({ success: true });
}
