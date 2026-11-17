import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { NOTIF_IS_READ_SQL, NOTIF_READ_AT_SQL, NOTIF_READ_JOIN_SQL, NOTIF_VISIBLE_SQL, markNotificationsRead } from "@/lib/notification-access";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { createNotification } from "@/lib/notifications";

// GET: fetch notifications for current user
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { username?: string; role?: string };
  const username = user.username || "";
  const role = user.role || "";
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const readStatus = unreadOnly ? "unread" : (searchParams.get("readStatus") || "all");
  const category = (searchParams.get("category") || "all").trim();
  const severity = (searchParams.get("severity") || "all").trim();
  const search = (searchParams.get("search") || "").trim();
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    // Status baca per user: JOIN notification_reads (parameter username di depan)
    const whereClauses = [NOTIF_VISIBLE_SQL];
    const baseParams: (string | number)[] = [username, username, role];

    if (readStatus === "unread") whereClauses.push(`NOT ${NOTIF_IS_READ_SQL}`);
    else if (readStatus === "read") whereClauses.push(NOTIF_IS_READ_SQL);

    if (category !== "all") {
      whereClauses.push("n.category = ?");
      baseParams.push(category);
    }

    if (severity !== "all") {
      whereClauses.push("n.severity = ?");
      baseParams.push(severity);
    }

    if (search) {
      whereClauses.push("(n.title LIKE ? OR n.message LIKE ?)");
      const searchValue = `%${search}%`;
      baseParams.push(searchValue, searchValue);
    }

    const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
         FROM notifications n ${NOTIF_READ_JOIN_SQL}
         ${whereSql}`,
      baseParams
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT n.id, n.category, n.severity, n.title, n.message, n.link,
              ${NOTIF_IS_READ_SQL} AS is_read_me, ${NOTIF_READ_AT_SQL} AS read_at_me, n.created_at
         FROM notifications n ${NOTIF_READ_JOIN_SQL}
         ${whereSql}
         ORDER BY n.created_at DESC
         LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    // Also get unread count
    const [unreadCountRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM notifications n ${NOTIF_READ_JOIN_SQL}
       WHERE ${NOTIF_VISIBLE_SQL}
         AND NOT ${NOTIF_IS_READ_SQL}`,
      [username, username, role]
    );

    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN NOT ${NOTIF_IS_READ_SQL} THEN 1 ELSE 0 END) AS unread,
              SUM(CASE WHEN NOT ${NOTIF_IS_READ_SQL} AND n.severity = 'error' THEN 1 ELSE 0 END) AS unread_error,
              SUM(CASE WHEN NOT ${NOTIF_IS_READ_SQL} AND n.severity = 'warning' THEN 1 ELSE 0 END) AS unread_warning
         FROM notifications n ${NOTIF_READ_JOIN_SQL}
        WHERE ${NOTIF_VISIBLE_SQL}`,
      [username, username, role]
    );

    const notifications = rows.map((r) => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
      title: r.title,
      message: r.message,
      link: r.link || null,
      isRead: Number(r.is_read_me) === 1,
      createdAt: r.created_at,
      readAt: r.read_at_me || null,
    }));

    return NextResponse.json({
      notifications,
      unreadCount: Number(unreadCountRows[0]?.cnt || 0),
      summary: {
        total: Number(summaryRows[0]?.total || 0),
        unread: Number(summaryRows[0]?.unread || 0),
        error: Number(summaryRows[0]?.unread_error || 0),
        warning: Number(summaryRows[0]?.unread_warning || 0),
      },
      pagination: {
        page,
        limit,
        totalItems: Number(countRows[0]?.total || 0),
        totalPages: Math.max(1, Math.ceil(Number(countRows[0]?.total || 0) / limit)),
        hasPrev: page > 1,
        hasNext: page * limit < Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("Notification GET error:", error);
    return NextResponse.json({ error: "Gagal mengambil notifikasi" }, { status: 500 });
  }
}

// POST: create announcement notification (admin only)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { username?: string; role?: string };
  const check = denyIfUnauthorized(user.role, "/api/notifications", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { title, message, severity, target, link } = body as {
      title?: string;
      message?: string;
      severity?: string;
      target?: string; // "all" | "admin" | "supervisor" | "kasir"
      link?: string;
    };

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Isi pesan wajib diisi" }, { status: 400 });
    }
    if (title.trim().length > 255) {
      return NextResponse.json({ error: "Judul maksimal 255 karakter" }, { status: 400 });
    }
    if (message.trim().length > 2000) {
      return NextResponse.json({ error: "Pesan maksimal 2000 karakter" }, { status: 400 });
    }

    const validSeverities = ["info", "warning", "error", "success"];
    const sev = validSeverities.includes(severity || "") ? severity : "info";

    const validTargets = ["all", "admin", "supervisor", "kasir"];
    const tgt = validTargets.includes(target || "") ? target : "all";

    // Sanitize link: only allow relative paths
    let safeLink: string | null = null;
    if (link && link.trim().startsWith("/")) {
      safeLink = link.trim().slice(0, 500);
    }

    const recipientRole = tgt === "all" ? null : tgt;

    await createNotification({
      // Pengumuman ke satu peran tidak boleh tersimpan sebagai siaran "*"
      recipientUsername: recipientRole ? "" : "*",
      recipientRole,
      category: "pengumuman",
      severity: sev as "info" | "warning" | "error" | "success",
      title: title.trim(),
      message: message.trim(),
      link: safeLink,
    });

    return NextResponse.json({ success: true, message: "Pengumuman berhasil dikirim" });
  } catch (error) {
    console.error("Notification POST error:", error);
    return NextResponse.json({ error: "Gagal membuat pengumuman" }, { status: 500 });
  }
}

// PATCH: mark notifications as read
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { username?: string; role?: string };
  const username = user.username || "";
  const role = user.role || "";

  try {
    const body = await request.json();
    const { ids, markAll } = body as { ids?: number[]; markAll?: boolean };

    // Tandai dibaca hanya untuk user ini (notification_reads), bukan untuk semua penerima
    if (markAll) {
      await markNotificationsRead(username, role, null);
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      const safeIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id));
      if (safeIds.length === 0) {
        return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
      }
      await markNotificationsRead(username, role, safeIds);
    } else {
      return NextResponse.json({ error: "Sertakan ids atau markAll" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notification PATCH error:", error);
    return NextResponse.json({ error: "Gagal memperbarui notifikasi" }, { status: 500 });
  }
}
