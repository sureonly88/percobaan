import { NextRequest, NextResponse } from "next/server";
import { startInvoicePayment } from "@/lib/payment-links/service";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRateLimitKey } from "@/lib/request-client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
  }
  const limit = checkRateLimit(getRateLimitKey(_req, "public-invoice-pay"), { max: 12, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan pembayaran. Coba lagi nanti." }, { status: 429 });
  }
  try {
    const { token } = await params;
    const result = await startInvoicePayment(token);
    return NextResponse.json({ success: true, snapToken: result.snapToken, snapUrl: result.snapUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memulai pembayaran";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
