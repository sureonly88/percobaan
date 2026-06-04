import { NextRequest, NextResponse } from "next/server";
import { buildDigitalReceipt } from "@/lib/receipt-data";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ receiptToken: string }> }
) {
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
  }
  const { receiptToken } = await params;
  const receipt = await buildDigitalReceipt(receiptToken);
  if (!receipt) return NextResponse.json({ error: "Struk tidak ditemukan" }, { status: 404 });
  return NextResponse.json(receipt);
}
