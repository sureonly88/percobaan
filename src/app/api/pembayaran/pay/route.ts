import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { canProcessPayment } from "@/lib/rbac";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import {
  PdamApiError,
  generateTransactionCode,
  pdamPaymentWithRetry,
  parsePdamNumber,
} from "@/lib/pdam-api";
import { CircuitOpenError } from "@/lib/circuit-breaker";
import pool from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { logTransactionEventSafe, logTransactionEventFireAndForget } from "@/lib/transaction-events";
import { notifyTransactionFailed, notifyLowBalance } from "@/lib/notifications";
import { cached } from "@/lib/cache";
import { assertCashierCanProcessPayment, CashierClosingError } from "@/lib/cashier-closing";

interface PaymentBill {
  idpel: string;
  nama: string;
  alamat: string;
  blth: string;
  gol: string;
  harga: number;
  denda: number;
  materai: number;
  limbah: number;
  retribusi: number;
  standLalu: number;
  standKini: number;
  subTotal: number;
  biayaMeter: number;
  bebanTetap: number;
  abodemen: number;
  total: number;
  diskon: number;
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
  if (!canProcessPayment(token.role)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk pembayaran" }, { status: 403 });
  }

  const body = await req.json();
  const { bills, loketCode, loketName, biayaAdmin, idempotencyKey, skipMultiPayment } = body as {
    bills: PaymentBill[];
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

  const username = String(token.username || token.name || "");
  const idempotencyKeyTrimmed = idempotencyKey.trim();
  const pdamProtocol = process.env.PDAM_PROTOCOL || "https";

  try {
    await assertCashierCanProcessPayment({ username, loketCode });
  } catch (error) {
    if (error instanceof CashierClosingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Fetch jenis loket from cache (rarely changes), saldo fresh from DB
  let jenisLoket = "SWITCHING";
  let saldoLoket = 0;
  let biayaAdminLoket = biayaAdmin || 0;
  try {
    const loketInfo = await cached(
      `loket:${loketCode}`,
      async () => {
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT jenis FROM lokets WHERE loket_code = ? LIMIT 1",
          [loketCode]
        );
        return rows[0]?.jenis || "SWITCHING";
      },
      5 * 60 * 1000 // 5 min TTL
    );
    jenisLoket = loketInfo;

    // Saldo and biaya_admin must always be fresh
    const [balRows] = await pool.query<RowDataPacket[]>(
      "SELECT pulsa, biaya_admin, max_pdam_tagihan FROM lokets WHERE loket_code = ? LIMIT 1",
      [loketCode]
    );
    if (balRows.length > 0) {
      saldoLoket = Number(balRows[0].pulsa || 0);
      biayaAdminLoket = Number(balRows[0].biaya_admin || 0);
      // Enforce per-loket PDAM tagihan limit
      const maxPdamTagihan = balRows[0].max_pdam_tagihan != null ? Number(balRows[0].max_pdam_tagihan) : null;
      if (maxPdamTagihan !== null && bills.length > maxPdamTagihan) {
        return NextResponse.json(
          {
            error: `Tagihan memiliki ${bills.length} bulan tunggakan. Loket Anda hanya diizinkan memproses maksimal ${maxPdamTagihan} bulan tagihan sekaligus.`,
            code: "PDAM_TAGIHAN_LIMIT_EXCEEDED",
          },
          { status: 422 }
        );
      }
    }
  } catch {
    // fallback to default
  }

  // Validate saldo loket
  const totalPembayaran = bills.reduce((sum, b) => sum + b.subTotal + (biayaAdminLoket || 0), 0);
  if (saldoLoket < totalPembayaran) {
    return NextResponse.json(
      { error: `Saldo loket tidak mencukupi. Saldo: Rp ${saldoLoket.toLocaleString("id-ID")}, Total: Rp ${totalPembayaran.toLocaleString("id-ID")}` },
      { status: 400 }
    );
  }

  const normalizedRequestPayload = {
    provider: "PDAM",
    bills,
    loketCode,
    loketName,
    biayaAdmin,
  };
  const requestHash = buildRequestHash(normalizedRequestPayload);

  let lockOwner = false;
  try {
    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_requests
      (idempotency_key, request_hash, status, provider, loket_code, username, request_payload, created_at, updated_at)
      VALUES (?, ?, 'PENDING', 'PDAM', ?, ?, ?, NOW(), NOW())`,
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
      logTransactionEventFireAndForget({
        idempotencyKey: idempotencyKeyTrimmed,
        provider: "PDAM",
        eventType: "PAYMENT_REQUEST_CREATED",
        severity: "INFO",
        username,
        loketCode,
        message: "Payment request berhasil dibuat dan dikunci dengan idempotency key",
        payload: {
          billsCount: bills.length,
          totalPembayaran,
          protocol: pdamProtocol,
        },
      });
    }
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr.code !== "ER_DUP_ENTRY") {
      throw error;
    }
  }

  if (!lockOwner) {
    const [existingRows] = await pool.query<PaymentRequestRow[]>(
      `SELECT id, idempotency_key, request_hash, status,
              CAST(response_payload AS CHAR) AS response_payload,
              error_code, error_message
         FROM payment_requests
        WHERE idempotency_key = ?
        LIMIT 1`,
      [idempotencyKeyTrimmed]
    );

    const existing = existingRows[0];
    if (!existing) {
      return NextResponse.json(
        { error: "Terjadi konflik idempotency, silakan coba lagi" },
        { status: 409 }
      );
    }

    if (existing.request_hash !== requestHash) {
      return NextResponse.json(
        {
          error:
            "idempotencyKey sudah dipakai dengan payload berbeda. Gunakan key baru.",
        },
        { status: 409 }
      );
    }

    if (existing.status === "SUCCESS" || existing.status === "PARTIAL_SUCCESS") {
      const previousResponse = safeJsonParse<unknown>(existing.response_payload);
      if (previousResponse) {
        return NextResponse.json(previousResponse, { status: 200 });
      }
      return NextResponse.json(
        { success: existing.status === "SUCCESS", message: "Transaksi sudah diproses sebelumnya" },
        { status: 200 }
      );
    }

    if (existing.status === "FAILED") {
      return NextResponse.json(
        {
          error: existing.error_message || "Transaksi sebelumnya gagal",
          errorCode: existing.error_code,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Transaksi dengan idempotencyKey ini sedang diproses" },
      { status: 409 }
    );
  }

  const results: Array<{
    idpel: string;
    transactionCode: string;
    success: boolean;
    error?: string;
    errorCode?: string;
    total: number;
    nama: string;
    blth: string;
    attempts?: number;
    providerData?: Record<string, unknown>;
  }> = [];

  try {
    // Group bills by idpel — 1 API call per pelanggan
    const grouped = new Map<string, PaymentBill[]>();
    for (const bill of bills) {
      const existing = grouped.get(bill.idpel);
      if (existing) {
        existing.push(bill);
      } else {
        grouped.set(bill.idpel, [bill]);
      }
    }
    const groupedEntries = Array.from(grouped.entries());

    // Create multi_payment_requests parent row (skip when called from orchestrator)
    const multiPaymentCode = `PDAM-${generateTransactionCode()}`;
    let multiPaymentId: number | null = null;
    if (!skipMultiPayment) {
      const [mprResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO multi_payment_requests
          (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
           total_items, total_amount, total_admin, grand_total, paid_amount, change_amount)
         VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          multiPaymentCode, idempotencyKeyTrimmed, loketCode, loketName || "", username,
          bills.length,
          bills.reduce((s, b) => s + b.subTotal, 0),
          bills.length * biayaAdminLoket,
          totalPembayaran,
        ]
      );
      multiPaymentId = mprResult.insertId;
    }

    for (const [idpel, pelBills] of groupedEntries) {
      const transactionCode = generateTransactionCode();

      // Phase 1: Persist pending rows into multi_payment_items (skip when called from orchestrator)
      if (!skipMultiPayment && multiPaymentId) {
        try {
          for (const bill of pelBills) {
            const metadata = {
              alamat: bill.alamat || "",
              idgol: bill.gol || "",
              harga_air: bill.harga,
              abodemen: bill.abodemen || 0,
              materai: bill.materai,
              limbah: bill.limbah,
              retribusi: bill.retribusi,
              denda: bill.denda,
              stand_lalu: bill.standLalu,
              stand_kini: bill.standKini,
              beban_tetap: bill.bebanTetap || 0,
              biaya_meter: bill.biayaMeter || 0,
              diskon: bill.diskon || 0,
              jenis_loket: jenisLoket,
              source: "loket",
            };
            await pool.execute(
              `INSERT INTO multi_payment_items
                (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
                 period_label, amount, admin_fee, total, status, transaction_code, metadata_json)
               VALUES (?, ?, 'PDAM', 'PDAM_NATIVE', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
              [
                multiPaymentId, `PDAM-${transactionCode}-${bill.blth}`,
                bill.idpel, bill.nama, bill.blth,
                bill.subTotal, biayaAdminLoket, bill.subTotal + biayaAdminLoket,
                transactionCode, JSON.stringify(metadata),
              ]
            );
          }

          await logTransactionEventSafe({
            idempotencyKey: idempotencyKeyTrimmed,
            transactionCode,
            provider: "PDAM",
            eventType: "PAYMENT_PENDING_SAVED",
            severity: "INFO",
            username,
            loketCode,
            custId: idpel,
            message: `${pelBills.length} tagihan berhasil disimpan sebagai pending di database lokal`,
            payload: {
              idpel,
              billsCount: pelBills.length,
              periods: pelBills.map((bill) => bill.blth),
              totalNominal: pelBills.reduce((sum, bill) => sum + bill.total, 0),
            },
          });
        } catch (dbInsertError: unknown) {
          const dbMessage =
            dbInsertError instanceof Error
              ? dbInsertError.message
              : "Gagal menyimpan data pending transaksi";

          await logTransactionEventSafe({
            idempotencyKey: idempotencyKeyTrimmed,
            transactionCode,
            provider: "PDAM",
            eventType: "PAYMENT_PENDING_SAVE_FAILED",
            severity: "ERROR",
            username,
            loketCode,
            custId: idpel,
            providerErrorCode: "DB_PENDING_INSERT_FAILED",
            message: dbMessage,
            payload: {
              idpel,
              billsCount: pelBills.length,
              periods: pelBills.map((bill) => bill.blth),
            },
          });

          for (const bill of pelBills) {
            results.push({
              idpel: bill.idpel,
              transactionCode,
              success: false,
              error: dbMessage,
              errorCode: "DB_PENDING_INSERT_FAILED",
              total: bill.total,
              nama: bill.nama,
              blth: bill.blth,
            });
          }
          continue;
        }
      }

      try {
        logTransactionEventFireAndForget({
          idempotencyKey: idempotencyKeyTrimmed,
          transactionCode,
          provider: "PDAM",
          eventType: "PAYMENT_PROVIDER_REQUEST",
          severity: "INFO",
          username,
          loketCode,
          custId: idpel,
          message: "Mengirim request payment ke provider PDAM",
          payload: {
            idpel,
            protocol: pdamProtocol,
            billsCount: pelBills.length,
            periods: pelBills.map((bill) => bill.blth),
            totalBayar: pelBills.reduce((sum: number, b: PaymentBill) => sum + b.total, 0),
          },
        });

        const paymentResult = await pdamPaymentWithRetry({
          idpel,
          totalBayar: pelBills.reduce((sum: number, b: PaymentBill) => sum + b.total, 0),
          transactionCode,
          loketCode,
          username,
        });

        // Log payment success response
        try {
          await pool.execute(
            "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
            [
              "PDAM_PAYMENT_SUCCESS",
              JSON.stringify({ idpel, transactionCode, attempts: paymentResult.attempts, response: paymentResult.rawResponse }),
              username,
            ]
          );
        } catch {
          // Non-critical
        }

        logTransactionEventFireAndForget({
          idempotencyKey: idempotencyKeyTrimmed,
          transactionCode,
          provider: "PDAM",
          eventType: "PAYMENT_PROVIDER_SUCCESS",
          severity: "INFO",
          username,
          loketCode,
          custId: idpel,
          message: "Provider PDAM mengembalikan respons sukses untuk payment",
          payload: {
            idpel,
            attempts: paymentResult.attempts,
            billsCount: pelBills.length,
            periods: pelBills.map((bill) => bill.blth),
            responseCount: paymentResult.data?.length || 0,
            httpStatus: paymentResult.httpStatus,
            rawResponse: paymentResult.rawResponse,
          },
        });

        // Phase 2a: finalize success in DB — update with actual data from PDAM response
        try {
          // Build a map of blth → response item for updating each row
          const responseItems = paymentResult.data || [];
          const itemByBlth = new Map<string, (typeof responseItems)[0]>();
          for (const item of responseItems) {
            if (item.thbln) itemByBlth.set(item.thbln, item);
          }

          // Update multi_payment_items with provider_response + metadata
          if (!skipMultiPayment) {
            for (const bill of pelBills) {
              const resp = itemByBlth.get(bill.blth);
              if (resp) {
                const updatedMetadata = {
                  alamat: resp.alamat || bill.alamat || "",
                  idgol: resp.gol || bill.gol || "",
                  harga_air: parsePdamNumber(resp.harga),
                  abodemen: parsePdamNumber(resp.byadmin),
                  materai: parsePdamNumber(resp.materai),
                  limbah: parsePdamNumber(resp.limbah),
                  retribusi: parsePdamNumber(resp.retribusi),
                  denda: parsePdamNumber(resp.denda),
                  stand_lalu: resp.stand_l || "0",
                  stand_kini: resp.stand_i || "0",
                  beban_tetap: parsePdamNumber(resp.biaya_tetap),
                  biaya_meter: parsePdamNumber(resp.biaya_meter),
                  diskon: parsePdamNumber(resp.diskon),
                  jenis_loket: jenisLoket,
                  source: "loket",
                };
                const respSubTotal = parsePdamNumber(resp.total);
                await pool.execute(
                  `UPDATE multi_payment_items
                      SET status = 'SUCCESS',
                          provider_response = ?,
                          metadata_json = ?,
                          amount = ?,
                          total = ?,
                          paid_at = NOW(),
                          failed_at = NULL
                    WHERE transaction_code = ?
                      AND period_label = ?
                      AND status = 'PENDING'`,
                  [
                    JSON.stringify(resp),
                    JSON.stringify(updatedMetadata),
                    respSubTotal,
                    respSubTotal + biayaAdminLoket,
                    transactionCode,
                    bill.blth,
                  ]
                );
              } else {
                // No per-bill data from PDAM API — save raw response as provider_response
                const fallbackResp = {
                  alamat: bill.alamat || "",
                  gol: bill.gol || "",
                  harga: String(bill.harga),
                  byadmin: "0",
                  materai: String(bill.materai),
                  limbah: String(bill.limbah),
                  retribusi: String(bill.retribusi),
                  denda: String(bill.denda),
                  stand_l: String(bill.standLalu),
                  stand_i: String(bill.standKini),
                  biaya_tetap: String(bill.bebanTetap),
                  biaya_meter: String(bill.biayaMeter),
                  diskon: String(bill.diskon),
                  thbln: bill.blth,
                  total: String(bill.subTotal),
                  nama: bill.nama,
                  _source: "bill_fallback",
                };
                await pool.execute(
                  `UPDATE multi_payment_items
                      SET status = 'SUCCESS',
                          provider_response = ?,
                          paid_at = NOW(),
                          failed_at = NULL
                    WHERE transaction_code = ?
                      AND period_label = ?
                      AND status = 'PENDING'`,
                  [
                    JSON.stringify(fallbackResp),
                    transactionCode,
                    bill.blth,
                  ]
                );
              }
            }
          }

          for (const bill of pelBills) {
            results.push({
              idpel: bill.idpel,
              transactionCode,
              success: true,
              total: bill.subTotal + biayaAdminLoket,
              nama: bill.nama,
              blth: bill.blth,
              attempts: paymentResult.attempts,
              providerData: (itemByBlth.get(bill.blth) as Record<string, unknown> | undefined) || {
                alamat: bill.alamat || "",
                gol: bill.gol || "",
                harga: String(bill.harga),
                byadmin: "0",
                materai: String(bill.materai),
                limbah: String(bill.limbah),
                retribusi: String(bill.retribusi),
                denda: String(bill.denda),
                stand_l: String(bill.standLalu),
                stand_i: String(bill.standKini),
                biaya_tetap: String(bill.bebanTetap),
                biaya_meter: String(bill.biayaMeter),
                diskon: String(bill.diskon),
                thbln: bill.blth,
                total: String(bill.subTotal),
                nama: bill.nama,
                _source: "bill_fallback",
              },
            });
          }

          // Deduct saldo loket
          const groupTotal = pelBills.reduce((sum, b) => sum + b.subTotal + biayaAdminLoket, 0);
          try {
            await pool.execute(
              "UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?",
              [groupTotal, loketCode]
            );
            // Check low balance and notify
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
            // Non-critical: saldo deduction failed but payment succeeded
          }
        } catch (dbFinalizeError: unknown) {
          const syncMessage =
            dbFinalizeError instanceof Error
              ? dbFinalizeError.message
              : "Pembayaran sukses di provider, sinkronisasi lokal gagal";

          await logTransactionEventSafe({
            idempotencyKey: idempotencyKeyTrimmed,
            transactionCode,
            provider: "PDAM",
            eventType: "PAYMENT_DB_FINALIZE_FAILED",
            severity: "ERROR",
            username,
            loketCode,
            custId: idpel,
            providerErrorCode: "DB_FINALIZE_FAILED",
            message: syncMessage,
            payload: {
              idpel,
              attempts: paymentResult.attempts,
              billsCount: pelBills.length,
            },
          });

          // Keep rows in PENDING for manual reconciliation
          if (!skipMultiPayment) {
            await pool.execute(
              `UPDATE multi_payment_items
                  SET provider_error_code = ?,
                      provider_error_message = ?
                WHERE transaction_code = ?
                  AND status = 'PENDING'`,
              ["DB_FINALIZE_FAILED", syncMessage, transactionCode]
            );
          }

          for (const bill of pelBills) {
            results.push({
              idpel: bill.idpel,
              transactionCode,
              success: false,
              error: "Pembayaran ke provider berhasil, tetapi pencatatan lokal gagal. Mohon hubungi admin.",
              errorCode: "DB_FINALIZE_FAILED",
              total: bill.subTotal + biayaAdminLoket,
              nama: bill.nama,
              blth: bill.blth,
              attempts: paymentResult.attempts,
            });
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pembayaran gagal";
        const errorCode = err instanceof PdamApiError ? err.code : "UNKNOWN_ERROR";
        const attempts = err instanceof PdamApiError ? err.attemptCount : undefined;

        // Log payment error response
        try {
          await pool.execute(
            "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
            [
              "PDAM_PAYMENT_FAILED",
              JSON.stringify({ idpel, transactionCode, errorCode, message, attempts, response: err instanceof PdamApiError ? err.rawResponse ?? null : null }),
              username,
            ]
          );
        } catch {
          // Non-critical
        }

        await logTransactionEventSafe({
          idempotencyKey: idempotencyKeyTrimmed,
          transactionCode,
          provider: "PDAM",
          eventType: "PAYMENT_PROVIDER_FAILED",
          severity: "ERROR",
          username,
          loketCode,
          custId: idpel,
          providerErrorCode: errorCode,
          message,
          payload: {
            idpel,
            attempts,
            billsCount: pelBills.length,
            periods: pelBills.map((bill) => bill.blth),
            httpStatus: err instanceof PdamApiError ? err.httpStatus ?? null : null,
            rawResponse: err instanceof PdamApiError ? err.rawResponse ?? null : null,
          },
        });

        // Phase 2b: finalize failed in DB
        if (!skipMultiPayment) {
          await pool.execute(
            `UPDATE multi_payment_items
                SET status = 'FAILED',
                    provider_error_code = ?,
                    provider_error_message = ?,
                    failed_at = NOW()
              WHERE transaction_code = ?
                AND status = 'PENDING'`,
            [errorCode, message, transactionCode]
          );
        }

        for (const bill of pelBills) {
          results.push({
            idpel: bill.idpel,
            transactionCode,
            success: false,
            error: message,
            errorCode,
            total: bill.subTotal + biayaAdminLoket,
            nama: bill.nama,
            blth: bill.blth,
            attempts,
          });
        }
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
      biayaAdmin: biayaAdminLoket,
      paidAt,
      idempotencyKey: idempotencyKeyTrimmed,
    };

    const failedSample = results.find((r) => !r.success);
    await pool.execute(
      `UPDATE payment_requests
          SET status = ?,
              response_payload = ?,
              error_code = ?,
              error_message = ?,
              updated_at = NOW()
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

    logTransactionEventFireAndForget({
      idempotencyKey: idempotencyKeyTrimmed,
      provider: "PDAM",
      eventType: "PAYMENT_REQUEST_COMPLETED",
      severity: finalStatus === "FAILED" ? "ERROR" : finalStatus === "PARTIAL_SUCCESS" ? "WARN" : "INFO",
      username,
      loketCode,
      providerErrorCode: failedSample?.errorCode ?? null,
      message: responsePayload.message,
      payload: {
        finalStatus,
        success: responsePayload.success,
        partialSuccess: responsePayload.partialSuccess,
        successCount,
        totalResults: results.length,
      },
    });

    // Auto-notify on failure
    if (finalStatus === "FAILED" || finalStatus === "PARTIAL_SUCCESS") {
      notifyTransactionFailed({
        idempotencyKey: idempotencyKeyTrimmed,
        username,
        loketCode,
        errorMessage: failedSample?.error || "Transaksi gagal",
        billCount: results.length,
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    if (error instanceof CircuitOpenError) {
      return NextResponse.json({ error: error.message, errorCode: "CIRCUIT_OPEN" }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Pembayaran gagal diproses";
    const errorCode = error instanceof PdamApiError ? error.code : "UNEXPECTED_ERROR";

    await pool.execute(
      `UPDATE payment_requests
          SET status = 'FAILED',
              error_code = ?,
              error_message = ?,
              updated_at = NOW()
        WHERE idempotency_key = ?`,
      [errorCode, message, idempotencyKeyTrimmed]
    );

    await logTransactionEventSafe({
      idempotencyKey: idempotencyKeyTrimmed,
      provider: "PDAM",
      eventType: "PAYMENT_REQUEST_FAILED",
      severity: "ERROR",
      username,
      loketCode,
      providerErrorCode: errorCode,
      message,
      payload: {
        billsCount: bills.length,
        totalPembayaran,
      },
    });

    // Auto-notify on unhandled error
    notifyTransactionFailed({
      idempotencyKey: idempotencyKeyTrimmed,
      username,
      loketCode,
      errorMessage: message,
      billCount: bills.length,
    });

    return NextResponse.json(
      {
        error: message,
        errorCode,
      },
      { status: 500 }
    );
  }
}
