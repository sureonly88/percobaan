import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthToken } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import type { RowDataPacket } from "mysql2/promise";
import {
  recordCommissionsSafe,
  type CommissionContext,
} from "@/lib/commission/calculate";

interface ItemRow extends RowDataPacket {
  id: number;
  item_code: string;
  transaction_code: string | null;
  multi_payment_code: string | null;
  loket_code: string;
  username: string;
  provider: string;
  service_type: string | null;
  product_code: string | null;
  amount: string;
  admin_fee: string;
  total: string;
  paid_at: string | null;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/backfill", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate dan endDate wajib diisi" }, { status: 400 });
  }

  // Batas wajar: max 90 hari per run agar tidak timeout
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Format tanggal tidak valid" }, { status: 400 });
  }
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) {
    return NextResponse.json({ error: "endDate harus setelah startDate" }, { status: 400 });
  }
  if (diffDays > 90) {
    return NextResponse.json({ error: "Maksimal rentang 90 hari per backfill" }, { status: 400 });
  }

  const [rows] = await pool.query<ItemRow[]>(
    `SELECT i.id, i.item_code, i.transaction_code, r.multi_payment_code,
            r.loket_code, r.username,
            i.provider, i.service_type, i.product_code,
            i.amount, i.admin_fee, i.total, i.paid_at
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.status = 'SUCCESS'
        AND i.paid_at >= ?
        AND i.paid_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY i.paid_at ASC`,
    [startDate, endDate]
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const ctx: CommissionContext = {
      paymentItemId: row.id,
      itemCode: row.item_code,
      transactionCode: row.transaction_code,
      multiPaymentCode: row.multi_payment_code,
      loketCode: row.loket_code,
      username: row.username,
      provider: row.provider,
      serviceType: row.service_type,
      productCode: row.product_code,
      amount: parseFloat(row.amount),
      adminFee: parseFloat(row.admin_fee),
      total: parseFloat(row.total),
      paidAt: row.paid_at ? new Date(row.paid_at) : new Date(),
    };

    const result = await recordCommissionsSafe(ctx);

    if (result === null) {
      failed++;
      errors.push(`${row.item_code}: recordCommissions threw an error`);
    } else if (result.inserted === 0) {
      skipped++; // tidak ada rule cocok, atau semua sudah ada (duplicate)
    } else {
      processed++;
    }
  }

  return NextResponse.json({
    ok: true,
    totalItems: rows.length,
    processed,
    skipped,
    failed,
    errors: errors.slice(0, 20),
    period: { startDate, endDate },
  });
}
