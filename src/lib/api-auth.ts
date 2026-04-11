import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, MobileUserPayload } from "@/lib/mobile-auth";
import { getToken } from "next-auth/jwt";

/**
 * getAuthToken — resolve caller identity dari dua sumber:
 *   1. Header "Authorization: Bearer <token>"  → mobile JWT
 *   2. Cookie next-auth session                → web (NextAuth)
 *
 * Mengembalikan objek dengan shape yang seragam sehingga
 * API route tidak perlu tahu dari mana auth-nya berasal.
 */
export interface AuthToken {
  sub:       string;
  username:  string;
  name:      string;
  role:      string;
  loketCode: string | null;
  loketName: string | null;
  /** "mobile" | "web" */
  source: "mobile" | "web";
}

export async function getAuthToken(req: NextRequest): Promise<AuthToken | null> {
  // 1. Coba Bearer token (mobile)
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    try {
      const payload: MobileUserPayload = verifyAccessToken(raw);
      return {
        sub:       payload.sub,
        username:  payload.username,
        name:      payload.name,
        role:      payload.role,
        loketCode: payload.loketCode,
        loketName: payload.loketName,
        source:    "mobile",
      };
    } catch {
      return null; // token ada tapi tidak valid → tolak
    }
  }

  // 2. Coba NextAuth session cookie (web)
  const token = await getToken({ req });
  if (!token) return null;

  return {
    sub:       String(token.sub || ""),
    username:  String(token.username || token.email || ""),
    name:      String(token.name || ""),
    role:      String(token.role || "kasir"),
    loketCode: (token.loketCode as string | null) ?? null,
    loketName: (token.loketName as string | null) ?? null,
    source:    "web",
  };
}

/** Helper — kembalikan 401 jika tidak terautentikasi */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Helper — kembalikan 403 jika role tidak diizinkan */
export function forbidden(message = "Akses ditolak") {
  return NextResponse.json({ error: message }, { status: 403 });
}
