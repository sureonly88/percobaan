import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/midtrans";
import { handlePaymentLinkWebhook } from "@/lib/payment-links/service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const orderId = String(body.order_id || "");
    const statusCode = String(body.status_code || "");
    const grossAmount = String(body.gross_amount || "");
    const signatureKey = String(body.signature_key || "");
    if (!verifySignature(orderId, statusCode, grossAmount, signatureKey)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    const result = await handlePaymentLinkWebhook(body);
    return NextResponse.json({ message: "OK", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
