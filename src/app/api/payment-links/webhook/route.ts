import { NextRequest, NextResponse } from "next/server";
import { handleMidtransNotification } from "@/lib/midtrans-notification";

/**
 * POST /api/payment-links/webhook — URL lama, tetap dilayani lewat handler bersama
 * (signature + Get Status, top-up & payment link). URL yang disarankan di dashboard:
 * /api/midtrans/notification.
 */
export async function POST(req: NextRequest) {
  try {
    const result = await handleMidtransNotification(await req.json().catch(() => null));
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
