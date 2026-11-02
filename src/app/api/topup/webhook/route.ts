import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { verifySignature, mapMidtransStatus } from "@/lib/midtrans";
import { createNotificationSafe } from "@/lib/notifications";
import { creditLoketBalance } from "@/lib/saldo-mutations";

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

    const newStatus = mapMidtransStatus(transaction_status, fraud_status);

    let creditedTopup: { username: string; loket_code: string; nominal: number } | null = null;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT id, loket_code, username, nominal, status FROM topup_requests WHERE gateway_order_id = ? LIMIT 1 FOR UPDATE",
        [order_id]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return NextResponse.json({ message: "Order not found, ignored" });
      }

      const topup = rows[0];
      const nominal = Number(topup.nominal || 0);
      const webhookAmount = Math.round(Number(gross_amount || 0));
      if (newStatus === "SUCCESS" && webhookAmount !== nominal) {
        await connection.rollback();
        return NextResponse.json({ error: "Nominal webhook tidak sesuai topup" }, { status: 400 });
      }

      if (topup.status === "SUCCESS" || topup.status === "FAILED") {
        await connection.rollback();
        return NextResponse.json({ message: "Already processed" });
      }

      const updateFields: string[] = [
        "status = ?",
        "payment_method = ?",
        "gateway_tx_id = ?",
        "webhook_payload = ?",
        "updated_at = NOW()",
      ];
      const updateParams: unknown[] = [newStatus, payment_type || null, transaction_id || null, JSON.stringify(body)];

      if (newStatus === "SUCCESS") updateFields.push("paid_at = NOW()");

      await connection.execute<ResultSetHeader>(
        `UPDATE topup_requests SET ${updateFields.join(", ")} WHERE id = ? AND status NOT IN ('SUCCESS','FAILED')`,
        [...updateParams, topup.id]
      );

      if (newStatus === "SUCCESS") {
        const credit = await creditLoketBalance({
          connection,
          loketCode: String(topup.loket_code),
          amount: nominal,
          ledger: { type: "TOPUP", referenceType: "TOPUP_ORDER", referenceId: String(order_id), note: "Top-up otomatis Midtrans" },
        });
        if (!credit.ok) throw new Error("Gagal kredit saldo loket topup");

        const now = new Date();
        const saldoRequestCode = `TOPUP-AUTO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        await connection.execute<ResultSetHeader>(
          `INSERT INTO request_saldo 
           (request_code, username, kode_loket, request_saldo, tgl_request, ket_request,
            is_verifikasi, verifikasi_saldo, username_verifikasi, tgl_verifikasi,
            status_verifikasi, ket_verifikasi, id_bank_tujuan, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), ?, 1, ?, 'SYSTEM', NOW(), 'APPROVED', ?, 0, NOW(), NOW())`,
          [
            saldoRequestCode,
            topup.username,
            topup.loket_code,
            nominal,
            `Top-up otomatis via Midtrans (${payment_type || "online"}) - Order: ${order_id}`,
            nominal,
            `Diverifikasi otomatis oleh payment gateway`,
          ]
        );

        creditedTopup = { username: String(topup.username), loket_code: String(topup.loket_code), nominal };
      }

      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw error;
    } finally {
      connection.release();
    }

    // 5. If SUCCESS, notify after DB commit
    if (creditedTopup) {
      try {
        await createNotificationSafe({
          recipientRole: "kasir",
          recipientUsername: creditedTopup.username,
          category: "saldo",
          severity: "info",
          title: "Top-up Saldo Berhasil",
          message: `Top-up saldo Rp ${creditedTopup.nominal.toLocaleString("id-ID")} berhasil via ${payment_type || "pembayaran online"}.`,
          link: "/saldo",
        });
      } catch {
        // Non-critical
      }

      console.log(`[topup/webhook] SUCCESS: ${order_id} → +${creditedTopup.nominal} for ${creditedTopup.loket_code}`);
    }

    return NextResponse.json({ message: "OK", status: newStatus });
  } catch (error) {
    console.error("[topup/webhook] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
