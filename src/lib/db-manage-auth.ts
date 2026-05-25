import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

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
