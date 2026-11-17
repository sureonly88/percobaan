import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment, normalizeRole } from "@/lib/rbac";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import { findActiveAdviceForCandidates } from "@/lib/multipay/repository";

/**
 * POST /api/pembayaran/cek-pending
 * Body: { items: [{ key, provider, serviceType, customerId, periodLabel }] }
 * Dipanggil setelah cek tagihan agar agen diperingatkan SEBELUM menerima uang bila tagihan
 * masih punya pembayaran lain yang menunggu konfirmasi provider (pembayaran ulang pasti ditolak).
 * No. Trx / kode transaksi hanya dibuka bila pembayaran tersebut milik loket yang sama.
 */
export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) return forbidden("Anda tidak memiliki akses");

  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const raw = Array.isArray(body?.items) ? body!.items : [];
  const items = raw
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.key === "string" && typeof x.customerId === "string" && typeof x.provider === "string" && typeof x.serviceType === "string")
    .map((x) => ({
      key: String(x.key),
      provider: String(x.provider),
      serviceType: String(x.serviceType),
      customerId: String(x.customerId).trim(),
      periodLabel: x.periodLabel == null ? null : String(x.periodLabel),
    }));
  if (items.length === 0) return NextResponse.json({ pending: [] });

  const found = await findActiveAdviceForCandidates(items);
  const privileged = ["admin", "supervisor"].includes(normalizeRole(String(token.role || "")));
  const pending = Array.from(found.entries()).map(([key, info]) => {
    const visible = privileged || (!!token.loketCode && info.loketCode === token.loketCode);
    return {
      key,
      status: info.status,
      sameLoket: !!token.loketCode && info.loketCode === token.loketCode,
      transactionCode: visible ? info.transactionCode : null,
      multiPaymentCode: visible ? info.multiPaymentCode : null,
    };
  });
  return NextResponse.json({ pending });
}
