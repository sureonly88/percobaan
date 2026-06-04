import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export function isDbManageEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return process.env.ENABLE_DB_MANAGE === "true";
  return process.env.ENABLE_DB_MANAGE !== "false";
}

export async function requireDbManageAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (!isDbManageEnabled()) {
    return NextResponse.json({ error: "DB Manage dinonaktifkan" }, { status: 403 });
  }

  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "admin") {
    return NextResponse.json({ error: "Hanya admin yang dapat mengakses DB Manage" }, { status: 403 });
  }
  return null;
}

export async function getDbManageActor(req: NextRequest) {
  const token = await getToken({ req });
  return {
    username: String(token?.username || token?.name || token?.email || "admin"),
    role: token?.role ? String(token.role) : "admin",
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
  };
}

export function generateDbManageToken(): string {
  const pass = process.env.MANAGE_DB_PASS?.trim() || "";
  return createHmac("sha256", "db-manage-pedami-v1").update(pass).digest("hex");
}

/** Constant-time string compare (returns false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyDbManageToken(req: NextRequest): boolean {
  const expected = process.env.MANAGE_DB_PASS?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return safeEqual(token, generateDbManageToken());
}

export async function authorizeDbManage(req: NextRequest): Promise<NextResponse | null> {
  const adminCheck = await requireDbManageAdmin(req);
  if (adminCheck) return adminCheck;
  if (!verifyDbManageToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
