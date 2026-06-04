import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { inquirySelfService } from "@/lib/payment-links/self-service";
import { isPublicSelfServiceEnabled } from "@/lib/feature-flags";

function clientKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!(await isPublicSelfServiceEnabled())) {
    return NextResponse.json({ error: "Fitur self-service publik sedang nonaktif" }, { status: 503 });
  }
  const limit = checkRateLimit(`public-self-service-inquiry:${clientKey(req)}`, { max: 12, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit." }, { status: 429 });
  }

  try {
    const body = await req.json() as { service?: string; customerId?: string; operator?: string; nominal?: number; packageCode?: string };
    const result = await inquirySelfService(String(body.service || ""), String(body.customerId || ""), {
      operator: body.operator,
      nominal: body.nominal == null ? undefined : Number(body.nominal),
      packageCode: body.packageCode,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal cek tagihan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
