import { NextRequest, NextResponse } from "next/server";
import { listPaidGatewayInvoices } from "@/lib/payment-links/repository";
import { processPaidInvoice } from "@/lib/payment-links/service";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1";
  return req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 20)));
  const invoices = await listPaidGatewayInvoices(limit);
  const results = [];
  for (const invoice of invoices) {
    try {
      const result = await processPaidInvoice(invoice, {
        internalSecret: process.env.CRON_SECRET || "dev-local",
        baseUrl: `http://localhost:${process.env.PORT || "3000"}`,
      });
      results.push({ invoiceCode: invoice.invoiceCode, ok: true, multiPaymentCode: result?.multiPaymentCode || null });
    } catch (error) {
      results.push({ invoiceCode: invoice.invoiceCode, ok: false, error: error instanceof Error ? error.message : "error" });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
