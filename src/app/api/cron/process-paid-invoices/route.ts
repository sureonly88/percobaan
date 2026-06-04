import { NextRequest, NextResponse } from "next/server";
import { listProviderProcessableInvoices } from "@/lib/payment-links/repository";
import { processPaidInvoice } from "@/lib/payment-links/service";
import { authorizeCron } from "@/lib/jobs/cron-auth";

export async function POST(req: NextRequest) {
  const auth = await authorizeCron(req);
  if (auth) return auth;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 20)));
  const retryStaleMinutes = Math.min(120, Math.max(5, Number(req.nextUrl.searchParams.get("retryStaleMinutes") || process.env.PAYMENT_LINK_PROVIDER_RETRY_MINUTES || 15)));
  const invoices = await listProviderProcessableInvoices(limit, retryStaleMinutes);
  const results = [];
  for (const invoice of invoices) {
    try {
      const internalSecret = process.env.CRON_SECRET || (process.env.NODE_ENV === "development" ? "dev-local" : "");
      if (!internalSecret) throw new Error("CRON_SECRET wajib diset untuk memproses invoice online");
      const result = await processPaidInvoice(invoice, {
        internalSecret,
        baseUrl: `http://localhost:${process.env.PORT || "3000"}`,
        retryStaleMinutes,
      });
      results.push({ invoiceCode: invoice.invoiceCode, ok: true, status: result ? "processed" : "skipped", multiPaymentCode: result?.multiPaymentCode || null });
    } catch (error) {
      results.push({ invoiceCode: invoice.invoiceCode, ok: false, error: error instanceof Error ? error.message : "error" });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
