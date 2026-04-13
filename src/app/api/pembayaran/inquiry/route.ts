import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment } from "@/lib/rbac";
import { PdamApiError, pdamInquiry, parsePdamNumber } from "@/lib/pdam-api";
import { CircuitOpenError } from "@/lib/circuit-breaker";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import { getAuthToken, unauthorized } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk inquiry" }, { status: 403 });
  }

  const body = await req.json();
  const { idpel } = body;

  if (!idpel || typeof idpel !== "string" || idpel.trim().length === 0) {
    return NextResponse.json({ error: "Nomor pelanggan wajib diisi" }, { status: 400 });
  }

  // Only allow alphanumeric customer IDs
  if (!/^[a-zA-Z0-9]+$/.test(idpel.trim())) {
    return NextResponse.json({ error: "Nomor pelanggan tidak valid" }, { status: 400 });
  }

  try {
    const username = String(token.username || token.name || "");
    const loketCode = String(token.loketCode || "");

    // Fetch loket admin fee
    let adminFeePerBill = 0;
    if (loketCode) {
      try {
        const [loketRows] = await pool.query<RowDataPacket[]>(
          "SELECT biaya_admin FROM lokets WHERE loket_code = ? LIMIT 1",
          [loketCode]
        );
        if (loketRows.length > 0) {
          adminFeePerBill = Number(loketRows[0].biaya_admin || 0);
        }
      } catch {
        // Non-critical
      }
    }

    await logTransactionEventSafe({
      eventType: "INQUIRY_REQUEST",
      severity: "INFO",
      username,
      custId: idpel.trim(),
      message: "Memulai inquiry tagihan PDAM",
      payload: {
        idpel: idpel.trim(),
        protocol: process.env.PDAM_PROTOCOL || "https",
        endpoint: "reqcustomer_rev2",
      },
    });

    const inquiryResult = await pdamInquiry(idpel.trim());
    const items = inquiryResult.items;

    // Normalize string numbers from PDAM (dot = thousands separator)
    const normalized = items.map((item) => ({
      ...item,
      harga: String(parsePdamNumber(item.harga)),
      denda: String(parsePdamNumber(item.denda)),
      materai: String(parsePdamNumber(item.materai)),
      limbah: String(parsePdamNumber(item.limbah)),
      retribusi: String(parsePdamNumber(item.retribusi)),
      stand_l: String(parsePdamNumber(item.stand_l)),
      stand_i: String(parsePdamNumber(item.stand_i)),
      sub_tot: String(parsePdamNumber(item.sub_tot)),
      biaya_meter: String(parsePdamNumber(item.biaya_meter)),
      biaya_tetap: String(parsePdamNumber(item.biaya_tetap)),
      byadmin: String(parsePdamNumber(item.byadmin)),
      total: String(parsePdamNumber(item.total)),
      pakai: String(parsePdamNumber(item.pakai)),
      angsuran: String(parsePdamNumber(item.angsuran)),
      diskon: String(parsePdamNumber(item.diskon)),
    }));

    // Log the inquiry with full PDAM response
    try {
      await pool.execute(
        "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
        [
          "PDAM_INQUIRY",
          JSON.stringify({ idpel: idpel.trim(), response: inquiryResult.rawResponse }),
          username,
        ]
      );
    } catch {
      // Non-critical — don't fail the inquiry if logging fails
    }

    await logTransactionEventSafe({
      eventType: "INQUIRY_SUCCESS",
      severity: "INFO",
      username,
      custId: idpel.trim(),
      message: `${normalized.length} tagihan berhasil diambil dari provider PDAM`,
      payload: {
        idpel: idpel.trim(),
        billCount: normalized.length,
        periods: normalized.map((item) => item.thbln),
        httpStatus: inquiryResult.httpStatus,
        rawResponse: inquiryResult.rawResponse,
      },
    });

    return NextResponse.json({ success: true, data: normalized, adminFee: adminFeePerBill });
  } catch (err: unknown) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Gagal melakukan inquiry pelanggan";

    await logTransactionEventSafe({
      eventType: "INQUIRY_FAILED",
      severity: "ERROR",
      username: String(token.username || token.name || ""),
      custId: idpel.trim(),
      providerErrorCode: err instanceof PdamApiError ? err.code : "UNKNOWN_ERROR",
      message,
      payload: {
        idpel: idpel.trim(),
        httpStatus: err instanceof PdamApiError ? err.httpStatus ?? null : null,
        rawResponse: err instanceof PdamApiError ? err.rawResponse ?? null : null,
      },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
