import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

function safeJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { idempotencyKey: string } }
) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/transactions", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: authToken ? 403 : 401 });

  const isKasir = role === "kasir";
  const kasirLoketCode = isKasir ? (authToken?.loketCode ?? null) : null;

  const idempotencyKey = decodeURIComponent(params.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "idempotencyKey wajib diisi" }, { status: 400 });
  }

  try {
    // Fetch the payment request
    const [reqRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, idempotency_key, multi_payment_code, status, loket_code, loket_name,
              username, total_items, total_amount, total_admin, grand_total, paid_amount,
              change_amount, error_code, error_message, paid_at, created_at, updated_at
         FROM multi_payment_requests
        WHERE idempotency_key = ?
        LIMIT 1`,
      [idempotencyKey]
    );

    if (!reqRows[0]) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const req = reqRows[0];

    // Kasir: only allow access to their own loket
    if (kasirLoketCode && req.loket_code !== kasirLoketCode) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    // Fetch all items
    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, item_code, provider, service_type, customer_id, customer_name,
              product_code, provider_ref, period_label, amount, admin_fee, total,
              status, transaction_code, provider_error_code, provider_error_message,
              advice_attempts,
              CAST(metadata_json AS CHAR) AS metadata_json,
              CAST(provider_response AS CHAR) AS provider_response,
              paid_at, failed_at, created_at, updated_at
         FROM multi_payment_items
        WHERE multi_payment_id = ?
        ORDER BY id ASC`,
      [req.id]
    );

    const items = itemRows.map((row) => {
      const meta = safeJson<Record<string, unknown>>(row.metadata_json) ?? {};
      const provResp = safeJson<Record<string, unknown>>(row.provider_response) ?? {};
      // provider_response stores the full LunasinResponse wrapper; actual data fields live inside .data
      const provData = (provResp.data as Record<string, unknown>) ?? provResp;
      const provider = String(row.provider || "").toUpperCase();
      const serviceType = String(row.service_type || "").toUpperCase();

      const item: Record<string, unknown> = {
        id:                   row.id,
        itemCode:             row.item_code,
        provider,
        serviceType,
        customerId:           row.customer_id,
        customerName:         row.customer_name,
        productCode:          row.product_code,
        providerRef:          row.provider_ref          ?? null,
        periodLabel:          row.period_label          ?? null,
        amount:               Number(row.amount),
        adminFee:             Number(row.admin_fee),
        total:                Number(row.total),
        status:               row.status,
        flagTransaksi:        row.status === "SUCCESS" ? "LUNAS" : row.status === "FAILED" ? "GAGAL" : "PENDING",
        transactionCode:      row.transaction_code      ?? null,
        providerErrorCode:    row.provider_error_code   ?? null,
        providerErrorMessage: row.provider_error_message ?? null,
        adviceAttempts:       Number(row.advice_attempts),
        paidAt:               row.paid_at   ?? null,
        failedAt:             row.failed_at ?? null,
        createdAt:            row.created_at,
        updatedAt:            row.updated_at,
      };

      // PLN-specific fields — sourced from provider_response
      if (provider === "LUNASIN" && serviceType.startsWith("PLN")) {
        item.tarif    = provData.tarif   ?? null;
        item.daya     = provData.daya    ?? null;
        item.token    = provData.token   ?? null;
        item.stroom   = provData.stroom  ?? null;
        item.rpToken  = provData.rp_token ?? null;
        item.nometer  = provData.nometer  ?? null;
        item.refnum   = provData.refnum   ?? provData.refnum_lunasin ?? null;
        item.periode  = provData.periode ?? row.period_label ?? null;
      }

      // PDAM-specific fields — sourced from provider_response (raw PDAM API response per bill)
      if (provider === "PDAM" || serviceType === "PDAM") {
        item.alamat      = String(provData.alamat ?? "");
        item.golongan    = String(provData.gol ?? "");
        item.hargaAir    = Number(provData.harga ?? 0);
        item.abodemen    = Number(provData.byadmin ?? 0);
        item.materai     = Number(provData.materai ?? 0);
        item.limbah      = Number(provData.limbah ?? 0);
        item.retribusi   = Number(provData.retribusi ?? 0);
        item.denda       = Number(provData.denda ?? 0);
        item.standLalu   = provData.stand_l ?? "0";
        item.standKini   = provData.stand_i ?? "0";
        item.bebanTetap  = Number(provData.biaya_tetap ?? 0);
        item.biayaMeter  = Number(provData.biaya_meter ?? 0);
        item.diskon      = Number(provData.diskon ?? 0);
        item.periode     = provData.thbln ?? row.period_label ?? null;
      }

      return item;
    });

    const successItems = items.filter((i) => i.status === "SUCCESS").length;
    const failedItems  = items.filter((i) => i.status === "FAILED").length;
    const totalNominal = items.reduce((sum, i) => sum + Number(i.total), 0);

    return NextResponse.json({
      transaction: {
        id:              req.id,
        idempotencyKey:  req.idempotency_key,
        transactionCode: req.multi_payment_code,
        status:          req.status,
        loketCode:       req.loket_code,
        loketName:       req.loket_name,
        username:        req.username,
        totalItems:      Number(req.total_items),
        successItems,
        failedItems,
        totalAmount:     Number(req.total_amount),
        totalAdmin:      Number(req.total_admin),
        grandTotal:      Number(req.grand_total),
        paidAmount:      Number(req.paid_amount),
        changeAmount:    Number(req.change_amount),
        totalNominal,
        errorCode:       req.error_code    ?? null,
        errorMessage:    req.error_message ?? null,
        paidAt:          req.paid_at       ?? null,
        createdAt:       req.created_at,
        updatedAt:       req.updated_at,
      },
      items,
    });
  } catch (error) {
    console.error("v1/transactions detail error:", error);
    return NextResponse.json({ error: "Gagal mengambil detail transaksi" }, { status: 500 });
  }
}
