import { NextRequest, NextResponse } from "next/server";
import { startInvoicePayment } from "@/lib/payment-links/service";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
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
