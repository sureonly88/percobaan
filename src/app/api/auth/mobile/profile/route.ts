import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcryptjs";
import { getAuthToken } from "@/lib/api-auth";

/**
 * PATCH /api/auth/mobile/profile
 *
 * Update display name for the currently authenticated mobile user.
 * Body: { name: string }
 */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Nama minimal 2 karakter" }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "Nama terlalu panjang (maks 100 karakter)" }, { status: 400 });
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE users SET name = ? WHERE id = ?",
      [name, auth.sub]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.name, u.role,
              l.loket_code, l.nama AS loket_name
         FROM users u
         LEFT JOIN lokets l ON u.loket_id = l.id
        WHERE u.id = ? LIMIT 1`,
      [auth.sub]
    );

    const user = rows[0];
    return NextResponse.json({
      message: "Profil berhasil diperbarui",
      user: {
        id:        String(user.id),
        username:  user.username,
        name:      user.name,
        role:      user.role,
        loketCode: user.loket_code ?? null,
        loketName: user.loket_name ?? null,
      },
    });
  } catch (error) {
    console.error("Mobile profile update error:", error);
    return NextResponse.json({ error: "Gagal memperbarui profil" }, { status: 500 });
  }
}
