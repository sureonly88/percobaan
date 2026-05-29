import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getAuthToken } from "@/lib/api-auth";

/**
 * GET /api/auth/mobile/notifications
 *
 * Query params:
 *   page       — 1-based page number (default: 1)
 *   limit      — items per page (default: 20, max: 50)
 *   unreadOnly — "true" to fetch only unread
 *
 * Response: { notifications, unreadCount, pagination }
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page  = Math.max(Number(searchParams.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
  const offset = (page - 1) * limit;
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const username = auth.username;
  const role     = auth.role;

  try {
    const where = `
      WHERE (recipient_username = ? OR recipient_username = '*' OR recipient_role = ?)
      ${unreadOnly ? "AND is_read = 0" : ""}
    `;
    const baseParams: (string | number)[] = [username, role];

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM notifications ${where}`,
      baseParams
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, category, severity, title, message, link, is_read, created_at, read_at
         FROM notifications ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    const [unreadRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE (recipient_username = ? OR recipient_username = '*' OR recipient_role = ?)
         AND is_read = 0`,
      [username, role]
    );

    const totalItems = Number(countRows[0]?.total || 0);

    return NextResponse.json({
      notifications: rows.map((r) => ({
        id:        r.id,
        category:  r.category,
        severity:  r.severity,
        title:     r.title,
        message:   r.message,
        link:      r.link ?? null,
        isRead:    r.is_read === 1,
        createdAt: r.created_at,
        readAt:    r.read_at ?? null,
      })),
      unreadCount: Number(unreadRows[0]?.cnt || 0),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        hasNext: page * limit < totalItems,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Mobile notifications GET error:", error);
    return NextResponse.json({ error: "Gagal mengambil notifikasi" }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/mobile/notifications
 *
 * Body: { ids?: number[]; markAll?: boolean }
 *
 * Mark one/many notifications as read (ownership enforced).
 */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = auth.username;
  const role     = auth.role;

  let body: { ids?: number[]; markAll?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { ids, markAll } = body;

  try {
    if (markAll) {
      await pool.execute<ResultSetHeader>(
        `UPDATE notifications SET is_read = 1, read_at = NOW()
         WHERE (recipient_username = ? OR recipient_username = '*' OR recipient_role = ?)
           AND is_read = 0`,
        [username, role]
      );
    } else if (Array.isArray(ids) && ids.length > 0) {
      const safeIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0);
      if (safeIds.length === 0) {
        return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
      }
      const placeholders = safeIds.map(() => "?").join(",");
      // Ownership: only mark notifications addressed to this user/role
      await pool.execute<ResultSetHeader>(
        `UPDATE notifications SET is_read = 1, read_at = NOW()
         WHERE id IN (${placeholders})
           AND (recipient_username = ? OR recipient_username = '*' OR recipient_role = ?)`,
        [...safeIds, username, role]
      );
    } else {
      return NextResponse.json({ error: "Sertakan ids atau markAll: true" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mobile notifications PATCH error:", error);
    return NextResponse.json({ error: "Gagal memperbarui notifikasi" }, { status: 500 });
  }
}
