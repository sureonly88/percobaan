import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { createSnapTransaction } from "@/lib/midtrans";
import { RowDataPacket } from "mysql2";

const NOMINAL_OPTIONS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

/**
 * POST /api/topup/create
 * Body: { nominal: number }
 * Creates a Midtrans Snap transaction and returns the token + URL.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthToken(request);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/topup/create", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const nominal = Number(body.nominal);

    if (!nominal || !NOMINAL_OPTIONS.includes(nominal)) {
      return NextResponse.json(
        { error: `Nominal tidak valid. Pilihan: ${NOMINAL_OPTIONS.map(n => n.toLocaleString("id-ID")).join(", ")}` },
        { status: 400 }
      );
    }

    // Resolve loket
    const loketCode = auth.loketCode;
    if (!loketCode) {
      return NextResponse.json({ error: "Akun tidak terhubung ke loket" }, { status: 400 });
    }

    const [loketRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, nama FROM lokets WHERE loket_code = ? LIMIT 1",
      [loketCode]
    );
    if (loketRows.length === 0) {
      return NextResponse.json({ error: "Loket tidak ditemukan" }, { status: 404 });
    }

    const loketName = loketRows[0].nama;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const requestCode = `TOPUP-${ts}-${rand}`;
    const orderId = `TOPUP-${loketCode}-${ts}-${rand}`;

    // Create Midtrans Snap transaction
    const snap = await createSnapTransaction({
      orderId,
      grossAmount: nominal,
      customerName: auth.name || auth.username,
      itemName: `Top-up Saldo ${loketName} - Rp ${nominal.toLocaleString("id-ID")}`,
    });

    // Expiry: 24 hours from now
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Insert record
    await pool.execute<ResultSetHeader>(
      `INSERT INTO topup_requests 
       (request_code, loket_code, username, nominal, fee, total_bayar,
        status, gateway, gateway_order_id, snap_token, snap_url, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, 'PENDING', 'midtrans', ?, ?, ?, ?, NOW(), NOW())`,
      [
        requestCode,
        loketCode,
        auth.username,
        nominal,
        nominal,
        orderId,
        snap.token,
        snap.redirect_url,
        expiresAt,
      ]
    );

    return NextResponse.json({
      success: true,
      requestCode,
      orderId,
      nominal,
      snapToken: snap.token,
      snapUrl: snap.redirect_url,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[topup/create]", error);
    return NextResponse.json({ error: "Gagal membuat transaksi top-up" }, { status: 500 });
  }
}
