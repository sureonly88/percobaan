import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { NOTIF_IS_READ_SQL, NOTIF_READ_AT_SQL, NOTIF_READ_JOIN_SQL, NOTIF_VISIBLE_SQL, markNotificationsRead } from "@/lib/notification-access";
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
    // Status baca per user: JOIN notification_reads (parameter username di depan)
    const where = `
      WHERE ${NOTIF_VISIBLE_SQL}
      ${unreadOnly ? `AND NOT ${NOTIF_IS_READ_SQL}` : ""}
    `;
    const baseParams: (string | number)[] = [username, username, role];

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM notifications n ${NOTIF_READ_JOIN_SQL} ${where}`,
      baseParams
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT n.id, n.category, n.severity, n.title, n.message, n.link,
              ${NOTIF_IS_READ_SQL} AS is_read_me, ${NOTIF_READ_AT_SQL} AS read_at_me, n.created_at
         FROM notifications n ${NOTIF_READ_JOIN_SQL} ${where}
         ORDER BY n.created_at DESC
         LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    const [unreadRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM notifications n ${NOTIF_READ_JOIN_SQL}
       WHERE ${NOTIF_VISIBLE_SQL}
         AND NOT ${NOTIF_IS_READ_SQL}`,
      [username, username, role]
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
        isRead:    Number(r.is_read_me) === 1,
        createdAt: r.created_at,
        readAt:    r.read_at_me ?? null,
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
      await markNotificationsRead(username, role, null);
    } else if (Array.isArray(ids) && ids.length > 0) {
      const safeIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0);
      if (safeIds.length === 0) {
        return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
      }
      // Ownership & per user: hanya notifikasi untuk user/peran ini, dicatat untuk user ini saja
      await markNotificationsRead(username, role, safeIds);
    } else {
      return NextResponse.json({ error: "Sertakan ids atau markAll: true" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mobile notifications PATCH error:", error);
    return NextResponse.json({ error: "Gagal memperbarui notifikasi" }, { status: 500 });
  }
}
