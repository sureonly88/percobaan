import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { verifySignature, mapMidtransStatus } from "@/lib/midtrans";
import { createNotificationSafe } from "@/lib/notifications";

/**
 * POST /api/topup/webhook
 * Midtrans Payment Notification (no auth — public endpoint).
 * Verifies signature before processing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
      transaction_id,
    } = body as {
      order_id: string;
      status_code: string;
      gross_amount: string;
      signature_key: string;
      transaction_status: string;
      fraud_status?: string;
      payment_type?: string;
      transaction_id?: string;
    };

    // 1. Verify signature
    if (!verifySignature(order_id, status_code, gross_amount, signature_key)) {
      console.warn("[topup/webhook] Signature mismatch for", order_id);
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // 2. Find the topup request
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, loket_code, username, nominal, status FROM topup_requests WHERE gateway_order_id = ? LIMIT 1",
      [order_id]
    );

    if (rows.length === 0) {
      // Not a topup order — ignore (may be other payment)
      return NextResponse.json({ message: "Order not found, ignored" });
    }

    const topup = rows[0];
    const newStatus = mapMidtransStatus(transaction_status, fraud_status);

    // 3. Idempotency: skip if already settled
    if (topup.status === "SUCCESS" || topup.status === "FAILED") {
      return NextResponse.json({ message: "Already processed" });
    }

    // 4. Update topup record
    const updateFields: string[] = [
      "status = ?",
      "payment_method = ?",
      "gateway_tx_id = ?",
      "webhook_payload = ?",
      "updated_at = NOW()",
    ];
    const updateParams: unknown[] = [
      newStatus,
      payment_type || null,
      transaction_id || null,
      JSON.stringify(body),
    ];

    if (newStatus === "SUCCESS") {
      updateFields.push("paid_at = NOW()");
    }

    await pool.execute<ResultSetHeader>(
      `UPDATE topup_requests SET ${updateFields.join(", ")} WHERE id = ?`,
      [...updateParams, topup.id]
    );

    // 5. If SUCCESS, credit the loket saldo
    if (newStatus === "SUCCESS") {
      await pool.execute(
        "UPDATE lokets SET pulsa = pulsa + ? WHERE loket_code = ?",
        [topup.nominal, topup.loket_code]
      );

      // Insert into request_saldo for audit trail
      const now = new Date();
      const saldoRequestCode = `TOPUP-AUTO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      try {
        await pool.execute<ResultSetHeader>(
          `INSERT INTO request_saldo 
           (request_code, username, kode_loket, request_saldo, tgl_request, ket_request,
            is_verifikasi, verifikasi_saldo, username_verifikasi, tgl_verifikasi,
            status_verifikasi, ket_verifikasi, id_bank_tujuan, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), ?, 1, ?, 'SYSTEM', NOW(), 'APPROVED', ?, 0, NOW(), NOW())`,
          [
            saldoRequestCode,
            topup.username,
            topup.loket_code,
            topup.nominal,
            `Top-up otomatis via Midtrans (${payment_type || "online"}) - Order: ${order_id}`,
            topup.nominal,
            `Diverifikasi otomatis oleh payment gateway`,
          ]
        );
      } catch (e) {
        console.error("[topup/webhook] Failed to insert request_saldo audit:", e);
        // Non-critical — saldo already updated
      }

      // Notify the user
      try {
        await createNotificationSafe({
          recipientRole: "kasir",
          recipientUsername: topup.username,
          category: "saldo",
          severity: "info",
          title: "Top-up Saldo Berhasil",
          message: `Top-up saldo Rp ${Number(topup.nominal).toLocaleString("id-ID")} berhasil via ${payment_type || "pembayaran online"}.`,
          link: "/saldo",
        });
      } catch {
        // Non-critical
      }

      console.log(`[topup/webhook] SUCCESS: ${order_id} → +${topup.nominal} for ${topup.loket_code}`);
    }

    return NextResponse.json({ message: "OK", status: newStatus });
  } catch (error) {
    console.error("[topup/webhook] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
