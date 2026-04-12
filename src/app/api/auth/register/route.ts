import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotificationSafe } from "@/lib/notifications";

/**
 * POST /api/auth/register
 *
 * Public endpoint — no auth required.
 * Creates a user with status='pending'.
 * Admin must approve before the user can log in.
 *
 * Body: { username, password, name, email, phone, namaUsaha, alamatUsaha }
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rateLimitKey = `register:${ip}`;
  const limit = checkRateLimit(rateLimitKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan registrasi. Coba lagi dalam 1 jam." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  let body: {
    username?: string;
    password?: string;
    name?: string;
    email?: string;
    phone?: string;
    namaUsaha?: string;
    alamatUsaha?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const username    = typeof body.username    === "string" ? body.username.trim().toLowerCase()    : "";
  const password    = typeof body.password    === "string" ? body.password                         : "";
  const name        = typeof body.name        === "string" ? body.name.trim()                      : "";
  const email       = typeof body.email       === "string" ? body.email.trim().toLowerCase()       : "";
  const phone       = typeof body.phone       === "string" ? body.phone.trim()                     : "";
  const namaUsaha   = typeof body.namaUsaha   === "string" ? body.namaUsaha.trim()                 : "";
  const alamatUsaha = typeof body.alamatUsaha === "string" ? body.alamatUsaha.trim()               : "";

  // ── Validation ────────────────────────────────────────────────────────────
  if (!username || !password || !name || !phone) {
    return NextResponse.json(
      { error: "Username, password, nama lengkap, dan nomor HP wajib diisi" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json(
      { error: "Username hanya boleh huruf kecil, angka, dan underscore (3–30 karakter)" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
  }

  if (!/^[0-9+\-\s]{8,20}$/.test(phone)) {
    return NextResponse.json({ error: "Format nomor HP tidak valid" }, { status: 400 });
  }

  try {
    // ── Check duplicate ────────────────────────────────────────────────────
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Username sudah digunakan, pilih username lain" }, { status: 409 });
    }

    if (email) {
      const [emailCheck] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [email]
      );
      if (emailCheck.length > 0) {
        return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO users
         (username, password, name, email, phone, nama_usaha, alamat_usaha, role, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'kasir', 'pending')`,
      [
        username,
        hashedPassword,
        name,
        email || null,
        phone,
        namaUsaha || null,
        alamatUsaha || null,
      ]
    );

    // Notify all admins about new registration (fire-and-forget)
    await createNotificationSafe({
      recipientRole: "admin",
      category: "sistem",
      severity: "info",
      title: "Pendaftar Baru",
      message: `${name} (${username}) mendaftar sebagai agen baru dan menunggu persetujuan.`,
      link: "/users/registrations",
    });

    return NextResponse.json(
      { message: "Registrasi berhasil! Akun Anda sedang menunggu persetujuan admin.", id: result.insertId },
      { status: 201 }
    );
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Gagal mendaftarkan akun, coba lagi" }, { status: 500 });
  }
}
