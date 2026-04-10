import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcryptjs";
import { denyIfUnauthorized } from "@/lib/rbac";

// GET: List all users (with optional search)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/users", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  try {
    let query = `SELECT id, username, name, email, role, loket_id, created_at, updated_at FROM users`;
    const params: string[] = [];

    if (search) {
      query += ` WHERE username LIKE ? OR name LIKE ? OR email LIKE ?`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Get loket names for mapping
    const [lokets] = await pool.query<RowDataPacket[]>(
      `SELECT id, nama, loket_code, pulsa, biaya_admin FROM lokets`
    );
    const loketMap = new Map<number, { nama: string; loketCode: string; pulsa: number; biayaAdmin: number }>();
    for (const l of lokets) {
      loketMap.set(l.id, { nama: l.nama, loketCode: l.loket_code, pulsa: parseFloat(l.pulsa ?? 0), biayaAdmin: parseFloat(l.biaya_admin ?? 0) });
    }

    const users = rows.map((r) => ({
      id: r.id,
      username: r.username,
      name: r.name || null,
      email: r.email || null,
      role: r.role || "user",
      loketId: r.loket_id,
      loketName: r.loket_id ? loketMap.get(r.loket_id)?.nama || null : null,
      loketCode: r.loket_id ? loketMap.get(r.loket_id)?.loketCode || null : null,
      loketPulsa: r.loket_id ? loketMap.get(r.loket_id)?.pulsa ?? 0 : 0,
      loketBiayaAdmin: r.loket_id ? loketMap.get(r.loket_id)?.biayaAdmin ?? 0 : 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // Summary
    const total = users.length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const userCount = users.filter((u) => u.role === "user").length;

    return NextResponse.json({ users, summary: { total, adminCount, userCount } });
  } catch (error) {
    console.error("Users GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data user" }, { status: 500 });
  }
}

// POST: Create new user
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/users", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { username, password, name, email, role, loketId } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
    }

    // Check duplicate username
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Username sudah digunakan" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO users (username, password, name, email, role, loket_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, name || null, email || null, role || "user", loketId || null]
    );

    return NextResponse.json({ message: "User berhasil dibuat", id: result.insertId });
  } catch (error) {
    console.error("Users POST Error:", error);
    return NextResponse.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}

// PUT: Update user
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(userRole, "/api/users", "PUT");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { id, username, name, email, role, loketId, newPassword } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID diperlukan" }, { status: 400 });
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (username !== undefined) {
      // Check duplicate
      const [dup] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1",
        [username, id]
      );
      if (dup.length > 0) {
        return NextResponse.json({ error: "Username sudah digunakan" }, { status: 409 });
      }
      fields.push("username = ?");
      values.push(username);
    }

    if (name !== undefined) {
      fields.push("name = ?");
      values.push(name || null);
    }

    if (email !== undefined) {
      fields.push("email = ?");
      values.push(email || null);
    }

    if (role !== undefined) {
      fields.push("role = ?");
      values.push(role);
    }

    if (loketId !== undefined) {
      fields.push("loket_id = ?");
      values.push(loketId || null);
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      fields.push("password = ?");
      values.push(hashed);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    values.push(Number(id));
    await pool.query<ResultSetHeader>(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ message: "User berhasil diperbarui" });
  } catch (error) {
    console.error("Users PUT Error:", error);
    return NextResponse.json({ error: "Gagal memperbarui user" }, { status: 500 });
  }
}

// DELETE: Delete user
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/users", "DELETE");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "User ID diperlukan" }, { status: 400 });
  }

  try {
    await pool.query<ResultSetHeader>("DELETE FROM users WHERE id = ?", [Number(id)]);
    return NextResponse.json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("Users DELETE Error:", error);
    return NextResponse.json({ error: "Gagal menghapus user" }, { status: 500 });
  }
}
