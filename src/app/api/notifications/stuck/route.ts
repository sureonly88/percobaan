import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { createNotificationSafe } from "@/lib/notifications";

// GET: check for stuck transactions and optionally auto-notify
// POST: run stuck detection and create notifications
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const thresholdMinutes = Math.max(Number(searchParams.get("threshold")) || 5, 1);

  try {
    const [stuckRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        pr.idempotency_key,
        pr.loket_code,
        pr.username,
        pr.created_at,
        TIMESTAMPDIFF(MINUTE, pr.created_at, NOW()) AS stuck_minutes,
        (SELECT COUNT(*) FROM multi_payment_items i WHERE i.transaction_code IN (
          SELECT DISTINCT te.transaction_code FROM transaction_events te WHERE te.idempotency_key = pr.idempotency_key
        )) AS bill_count
      FROM payment_requests pr
      WHERE pr.status = 'PENDING'
        AND pr.created_at < NOW() - INTERVAL ? MINUTE
      ORDER BY pr.created_at ASC
      LIMIT 50`,
      [thresholdMinutes]
    );

    const stuckTransactions = stuckRows.map((r) => ({
      idempotencyKey: r.idempotency_key,
      loketCode: r.loket_code,
      username: r.username,
      createdAt: r.created_at,
      stuckMinutes: Number(r.stuck_minutes),
      billCount: Number(r.bill_count || 0),
    }));

    return NextResponse.json({
      stuckCount: stuckTransactions.length,
      thresholdMinutes,
      stuckTransactions,
    });
  } catch (error) {
    console.error("Stuck detection error:", error);
    return NextResponse.json({ error: "Gagal memeriksa transaksi stuck" }, { status: 500 });
  }
}

// POST: run detection + auto-create notifications if new stuck found
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const thresholdMinutes = Math.max(Number(body.threshold) || 5, 1);

  try {
    // Find stuck transactions
    const [stuckRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        pr.idempotency_key,
        pr.loket_code,
        pr.username,
        pr.created_at,
        TIMESTAMPDIFF(MINUTE, pr.created_at, NOW()) AS stuck_minutes
      FROM payment_requests pr
      WHERE pr.status = 'PENDING'
        AND pr.created_at < NOW() - INTERVAL ? MINUTE
      ORDER BY pr.created_at ASC
      LIMIT 50`,
      [thresholdMinutes]
    );

    if (stuckRows.length === 0) {
      return NextResponse.json({ notified: 0, message: "Tidak ada transaksi stuck" });
    }

    // Check if we already notified for these (avoid duplicates)
    const keys = stuckRows.map((r) => r.idempotency_key);
    const placeholders = keys.map(() => "?").join(",");
    const [recentNotifs] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT link FROM notifications
       WHERE category = 'transaksi'
         AND title = 'Transaksi Stuck'
         AND link IN (${placeholders})`,
      keys.map((k) => `/monitoring/${k}`)
    );
    const alreadyNotifiedLinks = new Set(recentNotifs.map((r) => r.link));

    let notified = 0;
    for (const row of stuckRows) {
      const link = `/monitoring/${row.idempotency_key}`;
      if (alreadyNotifiedLinks.has(link)) continue;

      await createNotificationSafe({
        recipientRole: "admin",
        category: "transaksi",
        severity: row.stuck_minutes > 15 ? "error" : "warning",
        title: "Transaksi Stuck",
        message: `Transaksi oleh ${row.username} (loket ${row.loket_code}) sudah PENDING selama ${row.stuck_minutes} menit. Perlu penanganan manual.`,
        link,
      });

      await createNotificationSafe({
        recipientRole: "supervisor",
        category: "transaksi",
        severity: row.stuck_minutes > 15 ? "error" : "warning",
        title: "Transaksi Stuck",
        message: `Transaksi oleh ${row.username} (loket ${row.loket_code}) sudah PENDING selama ${row.stuck_minutes} menit.`,
        link,
      });

      notified++;
    }

    return NextResponse.json({
      notified,
      total: stuckRows.length,
      skipped: stuckRows.length - notified,
      message: notified > 0
        ? `${notified} notifikasi stuck transaction berhasil dibuat`
        : "Semua transaksi stuck sudah dinotifikasi sebelumnya",
    });
  } catch (error) {
    console.error("Stuck notification error:", error);
    return NextResponse.json({ error: "Gagal membuat notifikasi stuck" }, { status: 500 });
  }
}
