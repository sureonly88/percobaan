/**
 * Provider API: PDAM Inquiry
 * POST /api/v1/pdam/inquiry
 * 
 * Headers: X-API-Key, X-Timestamp, X-Signature
 * Body: { "cust_id": "..." }
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateProvider, ProviderAuthError } from "@/lib/provider-auth";
import { checkProviderRateLimit } from "@/lib/provider-rate-limit";
import { pdamInquiry, PdamApiError, parsePdamNumber } from "@/lib/pdam-api";
import { logTransactionEventFireAndForget } from "@/lib/transaction-events";

export async function POST(request: Request) {
  const startTime = Date.now();
  let body = "";

  try {
    body = await request.text();

    // 1. Authenticate
    const { provider, clientIp } = await authenticateProvider(request, body);

    // 2. Rate limit
    const rateResult = checkProviderRateLimit(
      provider.id,
      provider.rate_limit_per_minute,
      provider.rate_limit_per_day
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error_code: "RATE_LIMITED",
          message: `Rate limit exceeded (${rateResult.limitType}). Retry after ${Math.ceil(rateResult.retryAfterMs / 1000)}s`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        }
      );
    }

    // 3. Parse body
    let parsed: { cust_id?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { success: false, error_code: "INVALID_BODY", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const custId = parsed.cust_id?.trim();
    if (!custId || !/^\d{6,15}$/.test(custId)) {
      return NextResponse.json(
        { success: false, error_code: "INVALID_CUST_ID", message: "cust_id harus 6-15 digit angka" },
        { status: 400 }
      );
    }

    // 4. Call PDAM Inquiry
    const result = await pdamInquiry(custId);

    // 5. Normalize response
    const bills = result.items.map((item) => ({
      periode: item.thbln,
      nama: item.nama,
      alamat: item.alamat,
      golongan: item.gol,
      stand_lalu: item.stand_l,
      stand_ini: item.stand_i,
      pakai: item.pakai,
      harga: parsePdamNumber(item.harga),
      denda: parsePdamNumber(item.denda),
      biaya_admin: parsePdamNumber(item.byadmin),
      biaya_meter: parsePdamNumber(item.biaya_meter),
      biaya_tetap: parsePdamNumber(item.biaya_tetap),
      limbah: parsePdamNumber(item.limbah),
      retribusi: parsePdamNumber(item.retribusi),
      materai: parsePdamNumber(item.materai),
      diskon: parsePdamNumber(item.diskon),
      subtotal: parsePdamNumber(item.sub_tot),
      total: parsePdamNumber(item.total),
      status: item.status,
    }));

    const totalAmount = bills.reduce((sum, b) => sum + b.total, 0);
    const durationMs = Date.now() - startTime;

    // 6. Log transaction
    pool.execute(
      `INSERT INTO provider_transactions 
        (provider_id, provider_code, idempotency_key, transaction_type, cust_id, status,
         request_payload, response_payload, amount, duration_ms, ip_address)
       VALUES (?, ?, ?, 'inquiry', ?, 'SUCCESS', ?, ?, ?, ?, ?)`,
      [
        provider.id,
        provider.code,
        `INQ-${custId}-${Date.now()}`,
        custId,
        body,
        JSON.stringify({ bill_count: bills.length, total: totalAmount }),
        totalAmount,
        durationMs,
        clientIp,
      ]
    ).catch(() => {});

    logTransactionEventFireAndForget({
      provider: `PROVIDER:${provider.code}`,
      eventType: "PROVIDER_INQUIRY_SUCCESS",
      custId,
      message: `Provider ${provider.code} inquiry: ${bills.length} bills, total ${totalAmount}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        cust_id: custId,
        nama: bills[0]?.nama || "",
        alamat: bills[0]?.alamat || "",
        golongan: bills[0]?.golongan || "",
        jumlah_tagihan: bills.length,
        total_bayar: totalAmount,
        admin_fee: provider.admin_fee,
        grand_total: totalAmount + provider.admin_fee,
        tagihan: bills,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    if (error instanceof ProviderAuthError) {
      return NextResponse.json(
        { success: false, error_code: error.errorCode, message: error.message },
        { status: error.statusCode }
      );
    }

    if (error instanceof PdamApiError) {
      logTransactionEventFireAndForget({
        provider: "PROVIDER_API",
        eventType: "PROVIDER_INQUIRY_FAILED",
        providerErrorCode: error.code,
        message: error.message,
        severity: "WARN",
      });

      const status = error.code === "NETWORK_TIMEOUT" ? 504 : error.code.startsWith("PDAM_") ? 422 : 502;
      return NextResponse.json(
        {
          success: false,
          error_code: error.code,
          message: error.message,
          duration_ms: durationMs,
        },
        { status }
      );
    }

    logTransactionEventFireAndForget({
      provider: "PROVIDER_API",
      eventType: "PROVIDER_INQUIRY_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      severity: "ERROR",
    });

    return NextResponse.json(
      { success: false, error_code: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}
