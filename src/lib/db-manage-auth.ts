import { createHmac } from "crypto";
import { NextRequest } from "next/server";

export function generateDbManageToken(): string {
  const pass = process.env.MANAGE_DB_PASS?.trim() || "";
  return createHmac("sha256", "db-manage-pedami-v1").update(pass).digest("hex");
}

export function verifyDbManageToken(req: NextRequest): boolean {
  const expected = process.env.MANAGE_DB_PASS?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token === generateDbManageToken();
}
