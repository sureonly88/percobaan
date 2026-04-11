/**
 * Mobile JWT Authentication helpers
 *
 * Terpisah dari NextAuth — digunakan khusus untuk aplikasi mobile.
 * Token disimpan di SecureStore di sisi mobile (bukan cookie).
 *
 * Payload JWT:
 *   sub        — user id
 *   username
 *   name
 *   role
 *   loketCode
 *   loketName
 *   type       — "access" | "refresh"
 *   iat / exp
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const ACCESS_TTL_S  = 8 * 60 * 60;       // 8 jam
const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 hari

function getSecret(): string {
  const s = process.env.MOBILE_JWT_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!s) throw new Error("MOBILE_JWT_SECRET atau NEXTAUTH_SECRET wajib diset");
  return s;
}

// ── Minimal JWT (HS256, tidak perlu library eksternal) ──────────────────────

function b64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>): string {
  const secret  = getSecret();
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = b64url(JSON.stringify(payload));
  const data    = `${header}.${body}`;
  const sig     = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyJwt(token: string): Record<string, unknown> {
  const secret = getSecret();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token tidak valid");

  const [header, body, sig] = parts;
  const data     = `${header}.${body}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");

  // Timing-safe compare
  const sigBuf      = Buffer.from(sig,      "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Signature tidak valid");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) {
    throw new Error("Token sudah kedaluwarsa");
  }
  return payload;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface MobileUserPayload {
  sub:       string;
  username:  string;
  name:      string;
  role:      string;
  loketCode: string | null;
  loketName: string | null;
}

export function createTokenPair(user: MobileUserPayload) {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString("hex");

  const accessToken = signJwt({
    ...user,
    type: "access",
    jti,
    iat:  now,
    exp:  now + ACCESS_TTL_S,
  });

  const refreshToken = signJwt({
    sub:  user.sub,
    type: "refresh",
    jti:  randomBytes(16).toString("hex"),
    iat:  now,
    exp:  now + REFRESH_TTL_S,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn:  ACCESS_TTL_S,
    tokenType:  "Bearer",
  };
}

export function verifyAccessToken(token: string): MobileUserPayload {
  const payload = verifyJwt(token);
  if (payload.type !== "access") throw new Error("Bukan access token");
  return payload as unknown as MobileUserPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  const payload = verifyJwt(token);
  if (payload.type !== "refresh") throw new Error("Bukan refresh token");
  return { sub: String(payload.sub) };
}
