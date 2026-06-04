import { NextRequest, NextResponse } from "next/server";
import { buildDigitalReceipt } from "@/lib/receipt-data";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRateLimitKey } from "@/lib/request-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ receiptToken: string }> }
) {
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
  }
  const limit = checkRateLimit(getRateLimitKey(_req, "public-receipt-view"), { max: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak akses struk. Coba lagi nanti." }, { status: 429 });
  }
  const { receiptToken } = await params;
  const receipt = await buildDigitalReceipt(receiptToken);
  if (!receipt) return NextResponse.json({ error: "Struk tidak ditemukan" }, { status: 404 });
  return NextResponse.json(receipt);
}
