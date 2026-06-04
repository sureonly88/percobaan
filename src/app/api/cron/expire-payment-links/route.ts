import { NextRequest, NextResponse } from "next/server";
import { expirePaymentInvoices } from "@/lib/payment-links/repository";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1";
  return req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expired = await expirePaymentInvoices();
  return NextResponse.json({ ok: true, expired });
}
