import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { randomBytes } from "crypto";
import { invalidateCachePrefix } from "@/lib/cache";

// GET: List all providers
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  try {
    let query = `
      SELECT p.*,
        u.username AS linked_username, u.name AS linked_user_name,
        l.loket_code AS linked_loket_code, l.nama AS linked_loket_name, l.pulsa AS linked_loket_pulsa, l.biaya_admin AS linked_loket_admin_fee,
        (SELECT COUNT(*) FROM provider_transactions pt WHERE pt.provider_id = p.id) AS total_transactions,
        (SELECT COUNT(*) FROM provider_transactions pt WHERE pt.provider_id = p.id AND pt.status = 'SUCCESS' AND pt.transaction_type = 'payment') AS success_payments,
        (SELECT COALESCE(SUM(pt.total), 0) FROM provider_transactions pt WHERE pt.provider_id = p.id AND pt.status = 'SUCCESS' AND pt.transaction_type = 'payment') AS total_revenue
      FROM api_providers p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN lokets l ON l.id = p.loket_id
    `;
    const params: string[] = [];

    if (search) {
      query += ` WHERE p.name LIKE ? OR p.code LIKE ? OR p.contact_name LIKE ?`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ` ORDER BY p.created_at DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    const providers = rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      apiKey: r.api_key,
      status: r.status,
      rateLimitPerMinute: r.rate_limit_per_minute,
      rateLimitPerDay: r.rate_limit_per_day,
      allowedIps: r.allowed_ips,
      webhookUrl: r.webhook_url,
      balance: parseFloat(r.linked_loket_pulsa ?? r.balance ?? 0),
      adminFee: parseFloat(r.linked_loket_admin_fee ?? r.admin_fee ?? 0),
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      notes: r.notes,
      userId: r.user_id,
      loketId: r.loket_id,
      username: r.linked_username || null,
      userName: r.linked_user_name || null,
      loketCode: r.linked_loket_code || null,
      loketName: r.linked_loket_name || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      totalTransactions: r.total_transactions,
      successPayments: r.success_payments,
      totalRevenue: parseFloat(r.total_revenue),
    }));

    const summary = {
      total: providers.length,
      active: providers.filter((p) => p.status === "active").length,
      suspended: providers.filter((p) => p.status === "suspended").length,
      totalBalance: providers.reduce((sum, p) => sum + p.balance, 0),
    };

    return NextResponse.json({ providers, summary });
  } catch (error) {
    console.error("Provider GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data provider" }, { status: 500 });
  }
}

// POST: Create new provider
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { name, code, rateLimitPerMinute, rateLimitPerDay, allowedIps, webhookUrl, webhookSecret, balance, adminFee, userId, loketId, contactName, contactEmail, contactPhone, notes } = body;

    if (!name || !code) {
      return NextResponse.json({ error: "Nama dan kode provider wajib diisi" }, { status: 400 });
    }

    if (!/^[A-Z0-9_]{2,20}$/.test(code)) {
      return NextResponse.json({ error: "Kode provider: 2-20 karakter uppercase alfanumerik/underscore" }, { status: 400 });
    }

    // Check duplicate code
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM api_providers WHERE code = ? LIMIT 1",
      [code]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Kode provider sudah digunakan" }, { status: 409 });
    }

    // Generate API key and secret
    const apiKey = randomBytes(32).toString("hex");
    const apiSecret = randomBytes(64).toString("hex");

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO api_providers 
        (name, code, api_key, api_secret, rate_limit_per_minute, rate_limit_per_day,
         allowed_ips, webhook_url, webhook_secret, balance, admin_fee,
         user_id, loket_id, contact_name, contact_email, contact_phone, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, code, apiKey, apiSecret,
        rateLimitPerMinute || 60,
        rateLimitPerDay || 10000,
        allowedIps || null,
        webhookUrl || null,
        webhookSecret || null,
        balance || 0,
        adminFee || 0,
        userId || null,
        loketId || null,
        contactName || null,
        contactEmail || null,
        contactPhone || null,
        notes || null,
      ]
    );

    return NextResponse.json({
      message: "Provider berhasil dibuat",
      id: result.insertId,
      credentials: {
        apiKey,
        apiSecret,
        note: "Simpan api_secret ini! Tidak akan ditampilkan lagi.",
      },
    });
  } catch (error) {
    console.error("Provider POST Error:", error);
    return NextResponse.json({ error: "Gagal membuat provider" }, { status: 500 });
  }
}

// PUT: Update provider
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "PUT");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { id, name, status, rateLimitPerMinute, rateLimitPerDay, allowedIps, webhookUrl, webhookSecret, balance, adminFee, userId, loketId, contactName, contactEmail, contactPhone, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Provider ID diperlukan" }, { status: 400 });
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (status !== undefined) { fields.push("status = ?"); values.push(status); }
    if (rateLimitPerMinute !== undefined) { fields.push("rate_limit_per_minute = ?"); values.push(rateLimitPerMinute); }
    if (rateLimitPerDay !== undefined) { fields.push("rate_limit_per_day = ?"); values.push(rateLimitPerDay); }
    if (allowedIps !== undefined) { fields.push("allowed_ips = ?"); values.push(allowedIps || null); }
    if (webhookUrl !== undefined) { fields.push("webhook_url = ?"); values.push(webhookUrl || null); }
    if (webhookSecret !== undefined) { fields.push("webhook_secret = ?"); values.push(webhookSecret || null); }
    if (balance !== undefined) { fields.push("balance = ?"); values.push(balance); }
    if (adminFee !== undefined) { fields.push("admin_fee = ?"); values.push(adminFee); }
    if (userId !== undefined) { fields.push("user_id = ?"); values.push(userId || null); }
    if (loketId !== undefined) { fields.push("loket_id = ?"); values.push(loketId || null); }
    if (contactName !== undefined) { fields.push("contact_name = ?"); values.push(contactName || null); }
    if (contactEmail !== undefined) { fields.push("contact_email = ?"); values.push(contactEmail || null); }
    if (contactPhone !== undefined) { fields.push("contact_phone = ?"); values.push(contactPhone || null); }
    if (notes !== undefined) { fields.push("notes = ?"); values.push(notes || null); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    values.push(Number(id));
    await pool.query<ResultSetHeader>(
      `UPDATE api_providers SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    // Invalidate cached provider lookup
    invalidateCachePrefix("provider:");

    return NextResponse.json({ message: "Provider berhasil diperbarui" });
  } catch (error) {
    console.error("Provider PUT Error:", error);
    return NextResponse.json({ error: "Gagal memperbarui provider" }, { status: 500 });
  }
}

// DELETE: Delete provider (soft-delete by setting status to inactive)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "DELETE");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Provider ID diperlukan" }, { status: 400 });
  }

  try {
    // Check if provider has transactions
    const [txCount] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM provider_transactions WHERE provider_id = ?",
      [Number(id)]
    );
    const count = txCount[0]?.cnt || 0;

    if (count > 0) {
      // Soft delete
      await pool.query<ResultSetHeader>(
        "UPDATE api_providers SET status = 'inactive' WHERE id = ?",
        [Number(id)]
      );
      invalidateCachePrefix("provider:");
      return NextResponse.json({ message: `Provider dinonaktifkan (memiliki ${count} transaksi)` });
    }

    // Hard delete if no transactions
    await pool.query<ResultSetHeader>(
      "DELETE FROM api_providers WHERE id = ?",
      [Number(id)]
    );
    invalidateCachePrefix("provider:");

    return NextResponse.json({ message: "Provider berhasil dihapus" });
  } catch (error) {
    console.error("Provider DELETE Error:", error);
    return NextResponse.json({ error: "Gagal menghapus provider" }, { status: 500 });
  }
}
