import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { logTransactionEventSafe } from "@/lib/transaction-events";

interface StaleItemRow extends RowDataPacket {
  id: number;
  item_code: string;
  provider: string;
  service_type: string;
  customer_id: string;
  customer_name: string | null;
  period_label: string | null;
  amount: number;
  admin_fee: number;
  total: number;
  status: string;
  transaction_code: string | null;
  advice_attempts: number;
  retry_count: number;
  created_at: string;
  updated_at: string;
  // from JOIN multi_payment_requests
  multi_payment_code: string;
  loket_code: string;
  loket_name: string | null;
  username: string | null;
  idempotency_key: string;
}

function requireAdmin(role: string): boolean {
  return role === "admin" || role === "supervisor";
}

// ── GET /api/pembayaran/stale-pending ─────────────────────────────────────────
// Kembalikan multi_payment_items dengan status='PENDING' yang sudah lebih lama
// dari staleMinutes menit (default: 10). Hanya admin & supervisor.
export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!requireAdmin(String(token.role || ""))) {
    return forbidden("Hanya admin dan supervisor yang dapat mengakses halaman ini");
  }

  const staleMinutes = Math.max(1, Math.min(120, Number(req.nextUrl.searchParams.get("staleMinutes") || "10")));
  const provider = (req.nextUrl.searchParams.get("provider") || "ALL").toUpperCase();
  const search = (req.nextUrl.searchParams.get("search") || "").trim();

  try {
    const whereClauses = [
      "mpi.status = 'PENDING'",
      `mpi.created_at < NOW() - INTERVAL ${staleMinutes} MINUTE`,
    ];
    const params: Array<string | number> = [];

    if (provider !== "ALL") {
      whereClauses.push("mpi.provider = ?");
      params.push(provider);
    }

    if (search) {
      whereClauses.push("(mpi.customer_id LIKE ? OR mpi.transaction_code LIKE ? OR mpr.multi_payment_code LIKE ? OR mpr.loket_code LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereSQL = `WHERE ${whereClauses.join(" AND ")}`;

    const [rows] = await pool.query<StaleItemRow[]>(
      `SELECT
         mpi.id, mpi.item_code, mpi.provider, mpi.service_type,
         mpi.customer_id, mpi.customer_name, mpi.period_label,
         mpi.amount, mpi.admin_fee, mpi.total, mpi.status,
         mpi.transaction_code, mpi.advice_attempts, mpi.retry_count,
         mpi.created_at, mpi.updated_at,
         mpr.multi_payment_code, mpr.loket_code, mpr.loket_name,
         mpr.username, mpr.idempotency_key
       FROM multi_payment_items mpi
       JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
       ${whereSQL}
       ORDER BY mpi.created_at ASC
       LIMIT 500`,
      params
    );

    // Hitung berapa menit sudah stale (untuk tampilan UI)
    const items = rows.map((row) => ({
      id: row.id,
      itemCode: row.item_code,
      provider: row.provider,
      serviceType: row.service_type,
      customerId: row.customer_id,
      customerName: row.customer_name,
      periodLabel: row.period_label,
      amount: Number(row.amount),
      adminFee: Number(row.admin_fee),
      total: Number(row.total),
      status: row.status,
      transactionCode: row.transaction_code,
      adviceAttempts: Number(row.advice_attempts),
      retryCount: Number(row.retry_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      multiPaymentCode: row.multi_payment_code,
      loketCode: row.loket_code,
      loketName: row.loket_name,
      username: row.username,
      idempotencyKey: row.idempotency_key,
      staleMinutes: Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60_000),
    }));

    return NextResponse.json({ items, total: items.length, staleMinutes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal mengambil data stale pending";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH /api/pembayaran/stale-pending ───────────────────────────────────────
// Promote item ke PENDING_ADVICE (supaya muncul di menu Advice Manual) atau
// batalkan ke FAILED. Beroperasi per-transactionCode (semua item dalam 1 trx).
//
// Body: { transactionCode: string, action: "promote" | "cancel" }
export async function PATCH(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!requireAdmin(String(token.role || ""))) {
    return forbidden("Hanya admin dan supervisor yang dapat mengubah status transaksi");
  }

  const body = (await req.json()) as { transactionCode?: string; action?: string };
  const { transactionCode, action } = body;

  if (!transactionCode || !action) {
    return NextResponse.json({ error: "transactionCode dan action wajib diisi" }, { status: 400 });
  }
  if (action !== "promote" && action !== "cancel") {
    return NextResponse.json({ error: "action harus 'promote' atau 'cancel'" }, { status: 400 });
  }

  const username = String(token.username || token.name || "");

  try {
    // Ambil data item yang akan diubah (hanya yang masih PENDING)
    const [rows] = await pool.query<StaleItemRow[]>(
      `SELECT mpi.id, mpi.item_code, mpi.customer_id, mpi.provider,
              mpi.multi_payment_id, mpr.idempotency_key, mpr.loket_code
         FROM multi_payment_items mpi
         JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
        WHERE mpi.transaction_code = ? AND mpi.status = 'PENDING'`,
      [transactionCode]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada item PENDING untuk transaction code ini (mungkin sudah diperbarui)" },
        { status: 404 }
      );
    }

    const idempotencyKey = rows[0].idempotency_key;
    const loketCode = rows[0].loket_code;
    const provider = rows[0].provider;

    let result: ResultSetHeader;
    if (action === "promote") {
      const tglTransaksi = new Date().toISOString().slice(0, 10);
      [result] = await pool.execute<ResultSetHeader>(
        `UPDATE multi_payment_items
            SET status = 'PENDING_ADVICE',
                provider_error_code = 'STALE_PENDING_PROMOTED',
                provider_error_message = 'Dipromosikan ke PENDING_ADVICE oleh admin karena transaksi terhenti',
                metadata_json = JSON_SET(IFNULL(metadata_json, '{}'), '$.advice_tanggal', ?)
          WHERE transaction_code = ? AND status = 'PENDING'`,
        [tglTransaksi, transactionCode]
      );
    } else {
      [result] = await pool.execute<ResultSetHeader>(
        `UPDATE multi_payment_items
            SET status = 'FAILED',
                provider_error_code = 'STALE_PENDING_CANCELLED',
                provider_error_message = 'Dibatalkan oleh admin karena transaksi terhenti (zombie row)',
                failed_at = NOW()
          WHERE transaction_code = ? AND status = 'PENDING'`,
        [transactionCode]
      );
    }

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Tidak ada baris yang berhasil diperbarui" }, { status: 409 });
    }

    await logTransactionEventSafe({
      idempotencyKey,
      transactionCode,
      provider: provider as "PDAM" | "LUNASIN",
      eventType: action === "promote" ? "STALE_PENDING_PROMOTED" : "STALE_PENDING_CANCELLED",
      severity: "WARN",
      username,
      loketCode,
      message:
        action === "promote"
          ? `Admin mempromosikan ${result.affectedRows} item PENDING → PENDING_ADVICE (transaksi terhenti)`
          : `Admin membatalkan ${result.affectedRows} item PENDING → FAILED (transaksi terhenti)`,
      payload: { transactionCode, action, affectedRows: result.affectedRows },
    });

    return NextResponse.json({
      success: true,
      affectedRows: result.affectedRows,
      action,
      message:
        action === "promote"
          ? `${result.affectedRows} item dipromosikan ke PENDING_ADVICE — sekarang bisa diproses via menu Advice PDAM`
          : `${result.affectedRows} item dibatalkan (FAILED)`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
