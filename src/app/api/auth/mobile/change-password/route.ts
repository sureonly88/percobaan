import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import bcrypt from "bcryptjs";
import { getAuthToken } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const MIN_PASSWORD_LENGTH = 8;

/**
 * PATCH /api/auth/mobile/change-password
 *
 * Change password for the currently authenticated mobile user.
 * Body: { currentPassword: string; newPassword: string }
 */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: maks 5 percobaan per 15 menit per user
  const limit = checkRateLimit(`mobile-change-password:${auth.sub}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Password lama dan password baru wajib diisi" },
      { status: 400 }
    );
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter` },
      { status: 400 }
    );
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [auth.sub]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Password lama tidak sesuai" }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "Password baru tidak boleh sama dengan password lama" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      auth.sub,
    ]);

    return NextResponse.json({ message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Mobile change-password error:", error);
    return NextResponse.json({ error: "Gagal mengubah password" }, { status: 500 });
  }
}
