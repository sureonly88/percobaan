import { NextRequest, NextResponse } from "next/server";
import { findInvoiceByPublicToken, getInvoiceItems } from "@/lib/payment-links/repository";
import { toPublicInvoice } from "@/lib/payment-links/public-sanitizer";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRateLimitKey } from "@/lib/request-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
  }
  const limit = checkRateLimit(getRateLimitKey(_req, "public-invoice-view"), { max: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak akses invoice. Coba lagi nanti." }, { status: 429 });
  }
  const { token } = await params;
  const invoice = await findInvoiceByPublicToken(token);
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
  const items = await getInvoiceItems(invoice.id);
  return NextResponse.json(toPublicInvoice(invoice, items));
}
