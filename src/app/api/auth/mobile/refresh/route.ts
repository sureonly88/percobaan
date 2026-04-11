import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { verifyRefreshToken, createTokenPair } from "@/lib/mobile-auth";

/**
 * POST /api/auth/mobile/refresh
 *
 * Body: { refreshToken: string }
 *
 * Response:
 *   200 { accessToken, refreshToken, expiresIn, tokenType }
 *   401 token tidak valid / kedaluwarsa
 */
export async function POST(req: NextRequest) {
  let body: { refreshToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { refreshToken } = body;
  if (!refreshToken || typeof refreshToken !== "string") {
    return NextResponse.json({ error: "refreshToken wajib diisi" }, { status: 400 });
  }

  let sub: string;
  try {
    ({ sub } = verifyRefreshToken(refreshToken));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token tidak valid";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.username, u.role,
              l.loket_code, l.nama AS loket_name
         FROM users u
         LEFT JOIN lokets l ON u.loket_id = l.id
        WHERE u.id = ?
        LIMIT 1`,
      [sub]
    );

    const user = rows[0];
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 401 });
    }

    const tokens = createTokenPair({
      sub:       String(user.id),
      username:  user.username,
      name:      user.name || user.username,
      role:      user.role || "kasir",
      loketCode: user.loket_code || null,
      loketName: user.loket_name || null,
    });

    return NextResponse.json(tokens);
  } catch {
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
