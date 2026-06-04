/**
 * Helper bersama untuk endpoint cron.
 * Auth: header `X-Cron-Secret: <env CRON_SECRET>` ATAU bearer dari role admin.
 * Fallback loopback tanpa secret hanya diperbolehkan untuk development lokal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthToken } from "@/lib/api-auth";

export async function authorizeCron(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");
  if (secret && header && timingSafeEqual(secret, header)) return null;

  const bearer = req.headers.get("authorization") || "";
  if (secret && bearer === `Bearer ${secret}`) return null;

  // Loopback fallback hanya untuk development lokal yang eksplisit tidak punya secret.
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  if (process.env.NODE_ENV === "development" && !secret && (ip === "127.0.0.1" || ip === "::1" || ip === "")) {
    return null;
  }

  // Admin web/mobile token juga boleh memicu cron (untuk debug)
  const token = await getAuthToken(req);
  if (token && token.role === "admin") return null;

  return NextResponse.json({ error: "Unauthorized cron call" }, { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return res === 0;
}
