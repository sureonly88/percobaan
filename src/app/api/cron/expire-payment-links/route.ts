import { NextRequest, NextResponse } from "next/server";
import { expirePaymentInvoices } from "@/lib/payment-links/repository";
import { authorizeCron } from "@/lib/jobs/cron-auth";

export async function POST(req: NextRequest) {
  const auth = await authorizeCron(req);
  if (auth) return auth;
  const expired = await expirePaymentInvoices();
  return NextResponse.json({ ok: true, expired });
}
