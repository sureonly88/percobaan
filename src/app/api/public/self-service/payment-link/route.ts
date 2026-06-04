import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPaymentLink } from "@/lib/payment-links/service";
import { inquirySelfService } from "@/lib/payment-links/self-service";
import { isPaymentLinksEnabled, isPublicSelfServiceEnabled } from "@/lib/feature-flags";

function clientKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!(await isPublicSelfServiceEnabled())) {
    return NextResponse.json({ error: "Fitur self-service publik sedang nonaktif" }, { status: 503 });
  }
  if (!(await isPaymentLinksEnabled())) {
    return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
  }
  const limit = checkRateLimit(`public-self-service-link:${clientKey(req)}`, { max: 6, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak pembuatan invoice. Coba lagi beberapa menit." }, { status: 429 });
  }

  try {
    const body = await req.json() as {
      service?: string;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      operator?: string;
      nominal?: number;
      packageCode?: string;
    };
    const inquiry = await inquirySelfService(String(body.service || ""), String(body.customerId || ""), {
      operator: body.operator,
      nominal: body.nominal == null ? undefined : Number(body.nominal),
      packageCode: body.packageCode,
    });
    const created = await createPaymentLink({
      idempotencyKey: `public-${randomUUID()}`,
      loketCode: inquiry.loket.loketCode,
      loketName: inquiry.loket.loketName,
      createdBy: "PUBLIC_SELF_SERVICE",
      customerName: body.customerName || inquiry.customerName,
      customerPhone: body.customerPhone || undefined,
      customerEmail: body.customerEmail || undefined,
      expiresInMinutes: 24 * 60,
      notes: `Dibuat dari self-service publik untuk ${inquiry.serviceLabel}`,
      items: inquiry.items,
    });

    return NextResponse.json({
      success: true,
      invoiceCode: created.invoiceCode,
      publicUrl: created.publicUrl,
      publicToken: created.publicToken,
      receiptToken: created.receiptToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat payment link";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
