import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";

type ServiceType = "PDAM" | "PLN";

interface FavoriteRow extends RowDataPacket {
  id: number;
  user_id: number;
  service_type: ServiceType;
  customer_id: string;
  customer_name: string | null;
  alias_name: string | null;
  address: string | null;
  usage_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

function getCurrentUserId(session: unknown) {
  const rawId = (session as { user?: { id?: string } } | null)?.user?.id;
  const userId = Number(rawId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function normalizeServiceType(value: string | null | undefined): ServiceType {
  return value === "PLN" ? "PLN" : "PDAM";
}

function mapFavorite(row: FavoriteRow) {
  return {
    id: row.id,
    userId: row.user_id,
    serviceType: row.service_type,
    customerId: row.customer_id,
    customerName: row.customer_name,
    aliasName: row.alias_name,
    address: row.address,
    usageCount: Number(row.usage_count || 0),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serviceType = normalizeServiceType(searchParams.get("serviceType"));

  try {
    const [rows] = await pool.query<FavoriteRow[]>(
      `SELECT id, user_id, service_type, customer_id, customer_name, alias_name, address,
              usage_count, last_used_at, created_at, updated_at
         FROM customer_favorites
        WHERE user_id = ? AND service_type = ?
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 100`,
      [userId, serviceType]
    );

    return NextResponse.json({ favorites: rows.map(mapFavorite) });
  } catch (error) {
    console.error("Favorites GET error:", error);
    return NextResponse.json({ error: "Gagal mengambil data favorit" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const serviceType = normalizeServiceType(body.serviceType);
    const customerId = String(body.customerId || "").trim();
    const customerName = String(body.customerName || "").trim() || null;
    const aliasName = String(body.aliasName || "").trim() || null;
    const address = String(body.address || "").trim() || null;

    if (!customerId) {
      return NextResponse.json({ error: "ID pelanggan wajib diisi" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9]+$/.test(customerId)) {
      return NextResponse.json({ error: "ID pelanggan tidak valid" }, { status: 400 });
    }

    await pool.execute<ResultSetHeader>(
      `INSERT INTO customer_favorites
        (user_id, service_type, customer_id, customer_name, alias_name, address, usage_count, last_used_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         customer_name = COALESCE(VALUES(customer_name), customer_name),
         alias_name = COALESCE(VALUES(alias_name), alias_name),
         address = COALESCE(VALUES(address), address),
         usage_count = usage_count + 1,
         last_used_at = NOW(),
         updated_at = NOW()`,
      [userId, serviceType, customerId, customerName, aliasName, address]
    );

    const [rows] = await pool.query<FavoriteRow[]>(
      `SELECT id, user_id, service_type, customer_id, customer_name, alias_name, address,
              usage_count, last_used_at, created_at, updated_at
         FROM customer_favorites
        WHERE user_id = ? AND service_type = ? AND customer_id = ?
        LIMIT 1`,
      [userId, serviceType, customerId]
    );

    return NextResponse.json({
      success: true,
      favorite: rows[0] ? mapFavorite(rows[0]) : null,
    });
  } catch (error) {
    console.error("Favorites POST error:", error);
    return NextResponse.json({ error: "Gagal menyimpan favorit" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID favorit tidak valid" }, { status: 400 });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM customer_favorites WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Favorit tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorites DELETE error:", error);
    return NextResponse.json({ error: "Gagal menghapus favorit" }, { status: 500 });
  }
}