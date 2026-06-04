import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import bcrypt from "bcryptjs";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { createTokenPair } from "@/lib/mobile-auth";

/**
 * POST /api/auth/mobile/login
 *
 * Body: { username: string; password: string }
 *
 * Response:
 *   200 { accessToken, refreshToken, expiresIn, tokenType, user }
 *   400 payload tidak valid
 *   401 credential salah
 *   429 rate limited
 */
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid (harus JSON)" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "username dan password wajib diisi" }, { status: 400 });
  }

  // Rate limit: maksimal 5 percobaan per 15 menit per username + per IP.
  // Per-IP guard mencegah username enumeration & credential stuffing.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ipLimit = checkRateLimit(`mobile-login-ip:${ip}`, { max: 20 });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login dari IP ini. Coba lagi nanti." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(ipLimit.retryAfterMs / 1000)) },
      }
    );
  }

  const rateLimitKey = `mobile-login:${username}`;
  const limit = checkRateLimit(rateLimitKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.username, u.password, u.role, u.status,
              l.loket_code, l.nama AS loket_name
         FROM users u
         LEFT JOIN lokets l ON u.loket_id = l.id
        WHERE u.username = ?
        LIMIT 1`,
      [username]
    );

    const user = rows[0];

    // Constant-time guard: bila user tidak ditemukan, tetap lakukan bcrypt.compare
    // memakai hash dummy yang VALID agar waktu respons setara dengan kasus user ada.
    // (String non-bcrypt akan langsung di-reject tanpa kerja → membocorkan timing.)
    const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8WzS6Eo9Y2.0G4nXmYqIE5wYkRZqYG"; // bcrypt("dummy", 10)
    const hash = user?.password || DUMMY_HASH;
    const isValid = await bcrypt.compare(password, hash);

    if (!user || !isValid) {
      return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
    }

    const status = String(user.status || "active").toLowerCase();
    if (!["active", "aktif"].includes(status)) {
      return NextResponse.json({ error: "Akun belum aktif atau dinonaktifkan" }, { status: 403 });
    }

    resetRateLimit(rateLimitKey);

    const tokens = createTokenPair({
      sub:       String(user.id),
      username:  user.username,
      name:      user.name || user.username,
      role:      user.role || "kasir",
      loketCode: user.loket_code || null,
      loketName: user.loket_name || null,
    });

    return NextResponse.json({
      ...tokens,
      user: {
        id:        String(user.id),
        username:  user.username,
        name:      user.name || user.username,
        role:      user.role || "kasir",
        loketCode: user.loket_code || null,
        loketName: user.loket_name || null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
