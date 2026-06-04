import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { canProcessPayment } from "@/lib/rbac";
import { createPaymentLink } from "@/lib/payment-links/service";
import { listInvoices } from "@/lib/payment-links/repository";
import type { CreatePaymentLinkInput } from "@/lib/payment-links/types";
import { isPaymentLinksEnabled } from "@/lib/feature-flags";

function disabledResponse() {
  return NextResponse.json({ error: "Fitur Payment Link sedang nonaktif" }, { status: 503 });
}

export async function GET(req: NextRequest) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canProcessPayment(auth.role)) return forbidden("Anda tidak memiliki akses payment link");

  const status = req.nextUrl.searchParams.get("status") || "ALL";
  const search = req.nextUrl.searchParams.get("search") || "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") || 20)));
  const result = await listInvoices({ status, search, page, pageSize });

  return NextResponse.json({
    items: result.items,
    pagination: {
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isPaymentLinksEnabled())) return disabledResponse();
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  if (!canProcessPayment(auth.role)) return forbidden("Anda tidak memiliki akses membuat payment link");

  try {
    const body = await req.json() as Partial<CreatePaymentLinkInput>;
    const input: CreatePaymentLinkInput = {
      idempotencyKey: String(body.idempotencyKey || crypto.randomUUID()),
      loketCode: String(body.loketCode || auth.loketCode || ""),
      loketName: String(body.loketName || auth.loketName || ""),
      createdBy: auth.username || auth.name || "unknown",
      customerName: body.customerName || undefined,
      customerPhone: body.customerPhone || undefined,
      customerEmail: body.customerEmail || undefined,
      expiresInMinutes: Number(body.expiresInMinutes || 1440),
      notes: body.notes || undefined,
      items: Array.isArray(body.items) ? body.items : [],
    };
    if (!input.loketCode) return NextResponse.json({ error: "Loket wajib diisi" }, { status: 400 });
    const created = await createPaymentLink(input);
    return NextResponse.json({ success: true, ...created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat payment link";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
