import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthToken } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import type { RowDataPacket } from "mysql2/promise";
import {
  recordCommissionsSafe,
  type CommissionContext,
} from "@/lib/commission/calculate";
import { voidOrphanCommissions, type VoidCommissionsResult } from "@/lib/commission/ledger-maintenance";
import { auditLog } from "@/lib/audit-log";

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
  created_at: string | null;
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
            i.amount, i.admin_fee, i.total, i.paid_at, i.created_at
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.status = 'SUCCESS'
        AND COALESCE(i.paid_at, i.created_at) >= ?
        AND COALESCE(i.paid_at, i.created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY COALESCE(i.paid_at, i.created_at) ASC`,
    [startDate, endDate]
  );

  // 1) VOID komisi yatim (item-nya sudah dihapus, mis. cleanup import LEGACY) di periode ini,
  //    jurnalnya dibalik lewat REVERSAL. Baris PAID tidak disentuh, hanya dilaporkan.
  let orphan: VoidCommissionsResult;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    orphan = await voidOrphanCommissions(
      conn,
      startDate,
      endDate,
      "Item pembayaran sudah tidak ada (backfill komisi)",
      auth.username
    );
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    const msg = `Gagal membersihkan komisi yatim: ${(e as Error).message}`;
    return NextResponse.json({ ok: false, error: msg, errors: [msg] }, { status: 500 });
  } finally {
    conn.release();
  }

  // 2) Catat komisi yang belum ada. Idempoten: item yang sudah punya komisi
  //    (ACCRUED/PAID) tidak diubah; jurnal yang dulu gagal diposting dilengkapi.
  let processed = 0;
  let alreadyRecorded = 0;
  let noRule = 0;
  let failed = 0;
  const errors: string[] = [...orphan.warnings];

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
      paidAt: row.paid_at ? new Date(row.paid_at) : (row.created_at ? new Date(row.created_at) : new Date()),
    };

    const result = await recordCommissionsSafe(ctx);

    if (result === null) {
      failed++;
      errors.push(`${row.item_code}: recordCommissions threw an error`);
    } else if (result.errors > 0) {
      failed++;
      errors.push(`${row.item_code}: ${result.errors} baris komisi gagal/bentrok (lihat log server)`);
    } else if (result.inserted > 0) {
      processed++;
    } else if (result.alreadyRecorded > 0) {
      alreadyRecorded++;
    } else {
      noRule++;
    }
  }

  await auditLog({
    actorType: "user",
    actorUsername: auth.username,
    actorRole: auth.role,
    action: "COMMISSION_BACKFILL",
    entityType: "commission_ledger",
    context: {
      period: { startDate, endDate },
      totalItems: rows.length,
      processed,
      alreadyRecorded,
      noRule,
      failed,
      orphansVoided: orphan.voided,
      orphansVoidedAmount: orphan.voidedAmount,
      orphanReversalIds: orphan.reversalEntryIds,
      orphansPaidNotVoided: orphan.paidNotVoided,
      orphansPaidAmount: orphan.paidAmount,
    },
  });

  return NextResponse.json({
    ok: true,
    totalItems: rows.length,
    processed,
    skipped: alreadyRecorded + noRule,
    alreadyRecorded,
    noRule,
    failed,
    orphansVoided: orphan.voided,
    orphansPaidNotVoided: orphan.paidNotVoided,
    orphansPaidAmount: orphan.paidAmount,
    errors: errors.slice(0, 20),
    period: { startDate, endDate },
  });
}
