import { NextRequest, NextResponse } from "next/server";
import { handleMidtransNotification } from "@/lib/midtrans-notification";

/**
 * POST /api/midtrans/notification — URL yang disarankan untuk Payment Notification URL di
 * dashboard Midtrans. Melayani top-up (order TOPUP-…) dan payment link (order INV-…).
 */
export async function POST(request: NextRequest) {
  try {
    const result = await handleMidtransNotification(await request.json().catch(() => null));
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch (error) {
    console.error("[midtrans/notification] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
