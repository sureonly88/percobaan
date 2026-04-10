import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";

function getCurrentUserId(session: unknown) {
  const rawId = (session as { user?: { id?: string } } | null)?.user?.id;
  const userId = Number(rawId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

interface GroupRow extends RowDataPacket {
  id: number;
  user_id: number;
  group_name: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupItemRow extends RowDataPacket {
  id: number;
  group_id: number;
  service_type: string;
  customer_id: string;
  customer_name: string | null;
  product_code: string;
  input2: string;
  sort_order: number;
}

function mapGroup(row: GroupRow, items: GroupItemRow[]) {
  return {
    id: row.id,
    userId: row.user_id,
    groupName: row.group_name,
    usageCount: Number(row.usage_count || 0),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items
      .filter((i) => i.group_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.id,
        groupId: i.group_id,
        serviceType: i.service_type,
        customerId: i.customer_id,
        customerName: i.customer_name,
        productCode: i.product_code,
        input2: i.input2,
        sortOrder: i.sort_order,
      })),
  };
}

/* ── GET: list user's favorite groups with items ── */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [groups] = await pool.query<GroupRow[]>(
      `SELECT id, user_id, group_name, usage_count, last_used_at, created_at, updated_at
         FROM favorite_groups
        WHERE user_id = ?
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 50`,
      [userId]
    );

    if (groups.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const groupIds = groups.map((g) => g.id);
    const [items] = await pool.query<GroupItemRow[]>(
      `SELECT id, group_id, service_type, customer_id, customer_name, product_code, input2, sort_order
         FROM favorite_group_items
        WHERE group_id IN (${groupIds.map(() => "?").join(",")})
        ORDER BY sort_order`,
      groupIds
    );

    return NextResponse.json({
      groups: groups.map((g) => mapGroup(g, items)),
    });
  } catch (error) {
    console.error("Favorite groups GET error:", error);
    return NextResponse.json({ error: "Gagal mengambil data grup favorit" }, { status: 500 });
  }
}

/* ── POST: create a favorite group with items ── */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const groupName = String(body.groupName || "").trim();
    const items: Array<{
      serviceType: string;
      customerId: string;
      customerName?: string;
      productCode?: string;
      input2?: string;
    }> = Array.isArray(body.items) ? body.items : [];

    if (!groupName) {
      return NextResponse.json({ error: "Nama grup wajib diisi" }, { status: 400 });
    }

    if (groupName.length > 150) {
      return NextResponse.json({ error: "Nama grup maksimal 150 karakter" }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Grup harus memiliki minimal 1 item" }, { status: 400 });
    }

    if (items.length > 20) {
      return NextResponse.json({ error: "Grup maksimal 20 item" }, { status: 400 });
    }

    // Validate each item
    for (const item of items) {
      const cid = String(item.customerId || "").trim();
      if (!cid || !/^[a-zA-Z0-9]+$/.test(cid)) {
        return NextResponse.json({ error: `ID pelanggan tidak valid: ${cid}` }, { status: 400 });
      }
    }

    // Check group name uniqueness per user
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM favorite_groups WHERE user_id = ? AND group_name = ? LIMIT 1`,
      [userId, groupName]
    );

    if (existing.length > 0) {
      return NextResponse.json({ error: "Nama grup sudah digunakan" }, { status: 409 });
    }

    // Insert group
    const [groupResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO favorite_groups (user_id, group_name, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [userId, groupName]
    );

    const groupId = groupResult.insertId;

    // Insert items
    if (items.length > 0) {
      const placeholders = items.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<string | number | null> = [];
      items.forEach((item, idx) => {
        values.push(
          groupId,
          String(item.serviceType || "PDAM"),
          String(item.customerId || "").trim(),
          item.customerName ? String(item.customerName).trim() : null,
          String(item.productCode || ""),
          String(item.input2 || ""),
          idx
        );
      });

      await pool.execute(
        `INSERT INTO favorite_group_items (group_id, service_type, customer_id, customer_name, product_code, input2, sort_order)
         VALUES ${placeholders}`,
        values
      );
    }

    // Return the created group
    const [rows] = await pool.query<GroupRow[]>(
      `SELECT id, user_id, group_name, usage_count, last_used_at, created_at, updated_at
         FROM favorite_groups WHERE id = ?`,
      [groupId]
    );

    const [groupItems] = await pool.query<GroupItemRow[]>(
      `SELECT id, group_id, service_type, customer_id, customer_name, product_code, input2, sort_order
         FROM favorite_group_items WHERE group_id = ? ORDER BY sort_order`,
      [groupId]
    );

    return NextResponse.json({
      success: true,
      group: rows[0] ? mapGroup(rows[0], groupItems) : null,
    });
  } catch (error) {
    console.error("Favorite groups POST error:", error);
    return NextResponse.json({ error: "Gagal menyimpan grup favorit" }, { status: 500 });
  }
}

/* ── PATCH: bump usage count ── */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID grup tidak valid" }, { status: 400 });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE favorite_groups
          SET usage_count = usage_count + 1,
              last_used_at = NOW(),
              updated_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorite groups PATCH error:", error);
    return NextResponse.json({ error: "Gagal mengupdate grup" }, { status: 500 });
  }
}

/* ── DELETE: remove a group ── */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getCurrentUserId(session);

  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID grup tidak valid" }, { status: 400 });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM favorite_groups WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorite groups DELETE error:", error);
    return NextResponse.json({ error: "Gagal menghapus grup" }, { status: 500 });
  }
}
