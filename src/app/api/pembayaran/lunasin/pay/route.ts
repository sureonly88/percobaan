import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { canProcessPayment } from "@/lib/rbac";
import { LunasinApiError, lunasinPayment } from "@/lib/lunasin-api";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";
import pool from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import { notifyTransactionFailed, notifyLowBalance } from "@/lib/notifications";
import { assertCashierCanProcessPayment, CashierClosingError } from "@/lib/cashier-closing";

interface LunasinBill {
  idpel: string;
  nama: string;
  kodeProduk: string;
  idTrx: string;
  total: number;
  admin: number;
  rpAmount: number;
  periode?: string;
  tarif?: string;
  daya?: string;
  jumBill?: string;
  input2?: string;
  input3?: string;
}

interface PaymentRequestRow extends RowDataPacket {
  id: number;
  idempotency_key: string;
  request_hash: string;
  status: "PENDING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  response_payload: string | null;
  error_code: string | null;
  error_message: string | null;
}

function buildRequestHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) return forbidden("Anda tidak memiliki akses untuk pembayaran");

  const body = await req.json();
  const { bills, loketCode, loketName, biayaAdmin, idempotencyKey, skipMultiPayment } = body as {
    bills: LunasinBill[];
    loketCode: string;
    loketName: string;
    biayaAdmin: number;
    idempotencyKey: string;
    skipMultiPayment?: boolean;
  };

  if (!bills || !Array.isArray(bills) || bills.length === 0) {
    return NextResponse.json({ error: "Daftar tagihan kosong" }, { status: 400 });
  }
  if (!loketCode) {
    return NextResponse.json({ error: "Loket belum dipilih" }, { status: 400 });
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8) {
    return NextResponse.json({ error: "idempotencyKey tidak valid" }, { status: 400 });
  }

  const username = token.username || token.name || "";
  const idempotencyKeyTrimmed = idempotencyKey.trim();

  try {
    await assertCashierCanProcessPayment({ username, loketCode });
  } catch (error) {
    if (error instanceof CashierClosingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Fetch loket info
  let jenisLoket = "SWITCHING";
  let saldoLoket = 0;
  try {
    const [loketRows] = await pool.query<RowDataPacket[]>(
      "SELECT jenis, pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
      [loketCode]
    );
    if (loketRows.length > 0) {
      if (loketRows[0].jenis) jenisLoket = loketRows[0].jenis;
      saldoLoket = Number(loketRows[0].pulsa || 0);
    }
  } catch {
    // fallback
  }

  // Validate saldo
  // bill.total sudah mencakup admin fee (total = rpAmount + admin), jadi biayaAdmin tidak perlu ditambahkan lagi
  const totalPembayaran = bills.reduce((sum, b) => sum + b.total, 0);
  if (saldoLoket < totalPembayaran) {
    return NextResponse.json(
      { error: `Saldo loket tidak mencukupi. Saldo: Rp ${saldoLoket.toLocaleString("id-ID")}, Total: Rp ${totalPembayaran.toLocaleString("id-ID")}` },
      { status: 400 }
    );
  }

  const normalizedRequestPayload = {
    provider: "LUNASIN",
    bills,
    loketCode,
    loketName,
    biayaAdmin,
  };
  const requestHash = buildRequestHash(normalizedRequestPayload);

  // Idempotency check
  let lockOwner = false;
  try {
    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_requests
      (idempotency_key, request_hash, status, provider, loket_code, username, request_payload, created_at, updated_at)
      VALUES (?, ?, 'PENDING', 'LUNASIN', ?, ?, ?, NOW(), NOW())`,
      [
        idempotencyKeyTrimmed,
        requestHash,
        loketCode,
        username,
        JSON.stringify(normalizedRequestPayload),
      ]
    );
    lockOwner = insertResult.affectedRows === 1;

    if (lockOwner) {
      await logTransactionEventSafe({
        idempotencyKey: idempotencyKeyTrimmed,
        provider: "LUNASIN",
        eventType: "PAYMENT_REQUEST_CREATED",
        severity: "INFO",
        username,
        loketCode,
        message: "Payment request Lunasin berhasil dibuat",
        payload: { billsCount: bills.length, totalPembayaran },
      });
    }
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr.code !== "ER_DUP_ENTRY") throw error;
  }

  if (!lockOwner) {
    const [existingRows] = await pool.query<PaymentRequestRow[]>(
      `SELECT id, idempotency_key, request_hash, status,
              CAST(response_payload AS CHAR) AS response_payload,
              error_code, error_message
         FROM payment_requests WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKeyTrimmed]
    );
    const existing = existingRows[0];
    if (!existing) {
      return NextResponse.json({ error: "Terjadi konflik idempotency, silakan coba lagi" }, { status: 409 });
    }
    if (existing.request_hash !== requestHash) {
      return NextResponse.json(
        { error: "idempotencyKey sudah dipakai dengan payload berbeda. Gunakan key baru." },
        { status: 409 }
      );
    }
    if (existing.status === "SUCCESS" || existing.status === "PARTIAL_SUCCESS") {
      const previousResponse = safeJsonParse<unknown>(existing.response_payload);
      if (previousResponse) return NextResponse.json(previousResponse, { status: 200 });
      return NextResponse.json(
        { success: existing.status === "SUCCESS", message: "Transaksi sudah diproses sebelumnya" },
        { status: 200 }
      );
    }
    if (existing.status === "FAILED") {
      return NextResponse.json(
        { error: existing.error_message || "Transaksi sebelumnya gagal", errorCode: existing.error_code },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Transaksi dengan idempotencyKey ini sedang diproses" }, { status: 409 });
  }

  const results: Array<{
    idpel: string;
    transactionCode: string;
    success: boolean;
    error?: string;
    errorCode?: string;
    total: number;
    nama: string;
    kodeProduk: string;
    periode?: string;
    adviceAttempts?: number;
    finalStatus?: string;
    providerData?: Record<string, unknown>;
  }> = [];

  try {
    // Create multi_payment_requests parent row (skip when called from orchestrator)
    let multiPaymentId: number | null = null;
    if (!skipMultiPayment) {
      const multiPaymentCode = `LNS-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
      const [mprResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO multi_payment_requests
          (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
           total_items, total_amount, total_admin, grand_total, paid_amount, change_amount)
         VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          multiPaymentCode, idempotencyKeyTrimmed, loketCode, loketName || "", username,
          bills.length,
          bills.reduce((s, b) => s + b.rpAmount, 0),
          bills.reduce((s, b) => s + b.admin, 0),
          totalPembayaran,
        ]
      );
      multiPaymentId = mprResult.insertId;
    }

    for (const bill of bills) {
      const transactionCode = `LNS${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

      // Phase 1: Persist pending row into multi_payment_items (skip when called from orchestrator)
      if (!skipMultiPayment && multiPaymentId) {
        try {
          const metadata = {
            id_trx:      bill.idTrx,
            periode:     bill.periode  || "",
            jum_bill:    bill.jumBill  || "1",
            tarif:       bill.tarif    || "",
            daya:        bill.daya     || "",
            input2:      bill.input2   || "",
            input3:      bill.input3   || "",
            jenis_loket: jenisLoket,
            source:      "loket",
          };
          await pool.execute(
            `INSERT INTO multi_payment_items
              (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
               product_code, period_label, amount, admin_fee, total, status, transaction_code, metadata_json)
             VALUES (?, ?, 'LUNASIN', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
            [
              multiPaymentId, `LNS-${transactionCode}`,
              bill.kodeProduk.toLowerCase().startsWith("pln") ? (bill.kodeProduk.toLowerCase().includes("prepaid") || bill.kodeProduk.toLowerCase().includes("prabayar") ? "PLN_PREPAID" : bill.kodeProduk.toLowerCase().includes("nonrek") ? "PLN_NONTAGLIS" : "PLN_POSTPAID") :
              bill.kodeProduk.toLowerCase().startsWith("bpjs") ? "BPJS" :
              bill.kodeProduk.toLowerCase().startsWith("telkom") ? "TELKOM" :
              bill.kodeProduk.toLowerCase().startsWith("hp") ? "PULSA" :
              bill.kodeProduk.toLowerCase().startsWith("paketdata") ? "PAKET_DATA" :
              bill.kodeProduk.toLowerCase().startsWith("pdam") ? "PDAM" : "LAINNYA",
              bill.idpel, bill.nama,
              bill.kodeProduk, bill.periode || "",
              bill.rpAmount, bill.admin, bill.total,
              transactionCode, JSON.stringify(metadata),
            ]
          );
        } catch (dbErr: unknown) {
          const dbMessage = dbErr instanceof Error ? dbErr.message : "Gagal menyimpan data pending";
          results.push({
            idpel: bill.idpel,
            transactionCode,
            success: false,
            error: dbMessage,
            errorCode: "DB_PENDING_INSERT_FAILED",
            total: bill.total,
            nama: bill.nama,
            kodeProduk: bill.kodeProduk,
          });
          continue;
        }
      }

      // Phase 2: Call Lunasin payment (no auto-advice, advice dilakukan manual terpisah)
      try {
        await logTransactionEventSafe({
          idempotencyKey: idempotencyKeyTrimmed,
          transactionCode,
          provider: "LUNASIN",
          eventType: "PAYMENT_PROVIDER_REQUEST",
          severity: "INFO",
          username,
          loketCode,
          custId: bill.idpel,
          message: `Mengirim payment ke Lunasin produk ${bill.kodeProduk}`,
          payload: { idpel: bill.idpel, kodeProduk: bill.kodeProduk, idTrx: bill.idTrx },
        });

        const payResult = await lunasinPayment({
          idpel: bill.idpel,
          kodeProduk: bill.kodeProduk,
          idTrx: bill.idTrx,
          input2: bill.input2 || "",
          input3: bill.input3 || "",
        });

        // Log
        try {
          await pool.execute(
            "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
            [
              `LUNASIN_PAYMENT_${payResult.isPending ? "PENDING" : "SUCCESS"}`,
              JSON.stringify({
                idpel: bill.idpel,
                kodeProduk: bill.kodeProduk,
                transactionCode,
                isPending: payResult.isPending,
                response: payResult.rawResponse,
              }),
              username,
            ]
          );
        } catch {
          // Non-critical
        }

        if (!payResult.isPending) {
          // SUCCESS
          if (!skipMultiPayment) {
            await pool.execute(
              `UPDATE multi_payment_items
                  SET status = 'SUCCESS',
                      provider_error_code = NULL,
                      provider_error_message = NULL,
                      provider_response = ?,
                      advice_attempts = 0,
                      paid_at = NOW(),
                      failed_at = NULL
                WHERE transaction_code = ? AND status = 'PENDING'`,
              [
                JSON.stringify(payResult.data || null),
                transactionCode,
              ]
            );
          }

          results.push({
            idpel: bill.idpel,
            transactionCode,
            success: true,
            total: bill.total,
            nama: bill.nama,
            kodeProduk: bill.kodeProduk,
            periode: bill.periode,
            adviceAttempts: 0,
            finalStatus: "SUCCESS",
            providerData: payResult.data as unknown as Record<string, unknown>,
          });

          // Deduct saldo (bill.total sudah mencakup admin fee)
          const billTotal = bill.total;
          try {
            await pool.execute("UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?", [billTotal, loketCode]);
            try {
              const [balRows] = await pool.query<RowDataPacket[]>(
                "SELECT pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
                [loketCode]
              );
              if (balRows.length > 0) {
                notifyLowBalance({
                  loketCode,
                  loketName: loketName || loketCode,
                  currentBalance: Number(balRows[0].pulsa || 0),
                });
              }
            } catch {
              // non-critical
            }
          } catch {
            // non-critical
          }

          await logTransactionEventSafe({
            idempotencyKey: idempotencyKeyTrimmed,
            transactionCode,
            provider: "LUNASIN",
            eventType: "PAYMENT_PROVIDER_SUCCESS",
            severity: "INFO",
            username,
            loketCode,
            custId: bill.idpel,
            message: `Payment Lunasin berhasil untuk ${bill.kodeProduk}`,
            payload: {
              data: payResult.data,
              rawResponse: payResult.rawResponse,
            },
          });
        } else if (payResult.isPending) {
          // PENDING — belum ada hasil, perlu advice manual
          if (!skipMultiPayment) {
            await pool.execute(
              `UPDATE multi_payment_items
                  SET status = 'PENDING_ADVICE',
                      provider_error_code = 'LUNASIN_PENDING',
                      provider_error_message = 'Transaksi pending, silakan lakukan advice manual',
                      provider_response = ?,
                      advice_attempts = 0
                WHERE transaction_code = ? AND status = 'PENDING'`,
              [
                JSON.stringify(payResult.data || null),
                transactionCode,
              ]
            );
          }

          await logTransactionEventSafe({
            idempotencyKey: idempotencyKeyTrimmed,
            transactionCode,
            provider: "LUNASIN",
            eventType: "PAYMENT_PROVIDER_PENDING",
            severity: "WARN",
            username,
            loketCode,
            custId: bill.idpel,
            providerErrorCode: "LUNASIN_PENDING",
            message: `Payment Lunasin pending untuk ${bill.kodeProduk}, perlu advice manual`,
            payload: {
              data: payResult.data,
              rawResponse: payResult.rawResponse,
            },
          });

          results.push({
            idpel: bill.idpel,
            transactionCode,
            success: false,
            error: "Transaksi pending, silakan cek di menu Advice Lunasin",
            errorCode: "LUNASIN_PENDING",
            total: bill.total,
            nama: bill.nama,
            kodeProduk: bill.kodeProduk,
            finalStatus: "PENDING",
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pembayaran gagal";
        const errorCode = err instanceof LunasinApiError ? err.code : "UNKNOWN_ERROR";

        try {
          await pool.execute(
            "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
            [
              "LUNASIN_PAYMENT_FAILED",
              JSON.stringify({
                idpel: bill.idpel,
                kodeProduk: bill.kodeProduk,
                transactionCode,
                errorCode,
                message,
                response: err instanceof LunasinApiError ? err.rawResponse ?? null : null,
              }),
              username,
            ]
          );
        } catch {
          // Non-critical
        }

        await logTransactionEventSafe({
          idempotencyKey: idempotencyKeyTrimmed,
          transactionCode,
          provider: "LUNASIN",
          eventType: "PAYMENT_PROVIDER_FAILED",
          severity: "ERROR",
          username,
          loketCode,
          custId: bill.idpel,
          providerErrorCode: errorCode,
          message,
          payload: {
            kodeProduk: bill.kodeProduk,
            rawResponse: err instanceof LunasinApiError ? err.rawResponse ?? null : null,
          },
        });

        if (!skipMultiPayment) {
          await pool.execute(
            `UPDATE multi_payment_items
                SET status = 'FAILED',
                    provider_error_code = ?,
                    provider_error_message = ?,
                    failed_at = NOW()
              WHERE transaction_code = ? AND status IN ('PENDING', 'PENDING_ADVICE')`,
            [errorCode, message, transactionCode]
          );
        }

        results.push({
          idpel: bill.idpel,
          transactionCode,
          success: false,
          error: message,
          errorCode,
          total: bill.total,
          nama: bill.nama,
          kodeProduk: bill.kodeProduk,
        });
      }
    }

    const allSuccess = results.length > 0 && results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);
    const successCount = results.filter((r) => r.success).length;
    const paidAt = new Date().toISOString();
    const finalStatus = allSuccess ? "SUCCESS" : anySuccess ? "PARTIAL_SUCCESS" : "FAILED";

    const responsePayload = {
      success: allSuccess,
      partialSuccess: !allSuccess && anySuccess,
      message: allSuccess
        ? `${successCount} tagihan berhasil dibayarkan`
        : anySuccess
          ? `${successCount}/${results.length} tagihan berhasil, ${results.length - successCount} gagal`
          : `Semua ${results.length} tagihan gagal diproses`,
      results,
      loketCode,
      loketName,
      biayaAdmin,
      paidAt,
      idempotencyKey: idempotencyKeyTrimmed,
    };

    const failedSample = results.find((r) => !r.success);
    await pool.execute(
      `UPDATE payment_requests
          SET status = ?, response_payload = ?, error_code = ?, error_message = ?, updated_at = NOW()
        WHERE idempotency_key = ?`,
      [
        finalStatus,
        JSON.stringify(responsePayload),
        failedSample?.errorCode ?? null,
        failedSample?.error ?? null,
        idempotencyKeyTrimmed,
      ]
    );

    // Update multi_payment_requests parent with final status (skip when called from orchestrator)
    if (!skipMultiPayment && multiPaymentId) {
      const paidAmount = results.filter((r) => r.success).reduce((s, r) => s + r.total, 0);
      await pool.execute(
        `UPDATE multi_payment_requests
            SET status = ?,
                response_payload = ?,
                error_code = ?,
                error_message = ?,
                paid_amount = ?,
                paid_at = ${allSuccess || anySuccess ? "NOW()" : "NULL"}
          WHERE id = ?`,
        [
          finalStatus,
          JSON.stringify(responsePayload),
          failedSample?.errorCode ?? null,
          failedSample?.error ?? null,
          paidAmount,
          multiPaymentId,
        ]
      );
    }

    if (finalStatus === "FAILED" || finalStatus === "PARTIAL_SUCCESS") {
      notifyTransactionFailed({
        idempotencyKey: idempotencyKeyTrimmed,
        username,
        loketCode,
        errorMessage: failedSample?.error || "Transaksi Lunasin gagal",
        billCount: results.length,
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pembayaran gagal diproses";
    const errorCode = error instanceof LunasinApiError ? error.code : "UNEXPECTED_ERROR";

    await pool.execute(
      `UPDATE payment_requests
          SET status = 'FAILED', error_code = ?, error_message = ?, updated_at = NOW()
        WHERE idempotency_key = ?`,
      [errorCode, message, idempotencyKeyTrimmed]
    );

    notifyTransactionFailed({
      idempotencyKey: idempotencyKeyTrimmed,
      username,
      loketCode,
      errorMessage: message,
      billCount: bills.length,
    });

    return NextResponse.json({ error: message, errorCode }, { status: 500 });
  }
}
