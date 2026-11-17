import { NextRequest, NextResponse } from "next/server";
import { handleMidtransNotification } from "@/lib/midtrans-notification";

/**
 * POST /api/topup/webhook — URL lama, tetap dilayani. Memakai handler bersama sehingga
 * notifikasi payment link yang terkirim ke sini juga diproses (dan sebaliknya).
 * URL yang disarankan di dashboard: /api/midtrans/notification.
 */
export async function POST(request: NextRequest) {
  try {
    const result = await handleMidtransNotification(await request.json().catch(() => null));
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch (error) {
    console.error("[topup/webhook] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
