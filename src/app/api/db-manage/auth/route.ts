import { NextRequest, NextResponse } from "next/server";
import { generateDbManageToken, getDbManageActor, requireDbManageAdmin, safeEqual } from "@/lib/db-manage-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  const adminCheck = await requireDbManageAdmin(req);
  if (adminCheck) return adminCheck;

  // Rate-limit by IP — guards against brute-forcing MANAGE_DB_PASS.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limit = checkRateLimit(`db-manage-auth:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";

  const expected = process.env.MANAGE_DB_PASS?.trim();
  if (!expected) {
    return NextResponse.json({ error: "MANAGE_DB_PASS tidak dikonfigurasi di .env" }, { status: 500 });
  }

  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ error: "Password salah" }, { status: 401 });
  }

  const actor = await getDbManageActor(req);
  await auditLog({
    actorType: "user",
    actorUsername: actor.username,
    actorRole: actor.role,
    actorIp: actor.ip,
    action: "DB_MANAGE_AUTH_SUCCESS",
    entityType: "db_manage",
  });

  return NextResponse.json({ token: generateDbManageToken() });
}
