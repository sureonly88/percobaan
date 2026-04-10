import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcryptjs";

// GET: Get user profile with loket info
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User ID diperlukan" }, { status: 400 });
  }

  // Ownership check: user can only access their own profile unless admin
  const sessionUserId = (session.user as { id?: string }).id;
  const sessionRole = (session.user as { role?: string }).role;
  if (sessionRole !== "admin" && sessionUserId !== userId) {
    return NextResponse.json({ error: "Anda tidak memiliki akses" }, { status: 403 });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.loket_id, u.created_at,
              l.loket_code, l.nama AS loket_nama, l.alamat AS loket_alamat, l.status AS loket_status
       FROM users u
       LEFT JOIN lokets l ON u.loket_id = l.id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    const user = rows[0];
    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      loket: user.loket_id
        ? {
            id: user.loket_id,
            loketCode: user.loket_code,
            nama: user.loket_nama,
            alamat: user.loket_alamat,
            status: user.loket_status,
          }
        : null,
    });
  } catch (error) {
    console.error("Profile GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data profil" }, { status: 500 });
  }
}

// PUT: Update user profile (name, password)
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userId, name, currentPassword, newPassword } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID diperlukan" }, { status: 400 });
    }

    // Ownership check: user can only edit their own profile unless admin
    const sessionUserId = (session.user as { id?: string }).id;
    const sessionRole = (session.user as { role?: string }).role;
    if (sessionRole !== "admin" && sessionUserId !== String(userId)) {
      return NextResponse.json({ error: "Anda tidak memiliki akses" }, { status: 403 });
    }

    const [users] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (users.length === 0) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    const user = users[0];
    const fields: string[] = [];
    const values: (string | number)[] = [];

    // Update name
    if (name && name.trim()) {
      fields.push("name = ?");
      values.push(name.trim());
    }

    // Update password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Password lama wajib diisi" }, { status: 400 });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "Password lama tidak sesuai" }, { status: 403 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: "Password baru minimal 6 karakter" }, { status: 400 });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      fields.push("password = ?");
      values.push(hashed);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    values.push(Number(userId));
    await pool.query<ResultSetHeader>(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ message: "Profil berhasil diperbarui" });
  } catch (error) {
    console.error("Profile PUT Error:", error);
    return NextResponse.json({ error: "Gagal memperbarui profil" }, { status: 500 });
  }
}
