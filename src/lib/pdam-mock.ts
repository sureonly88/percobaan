/**
 * PDAM Mock / Dummy API
 *
 * Aktifkan dengan set environment variable:
 *   PDAM_MOCK=true
 *
 * Skenario dikendalikan oleh 4 digit pertama idpel:
 *
 *  1111xxxxxx  → inquiry 1 bulan, payment sukses cepat
 *  2222xxxxxx  → inquiry 2 bulan tunggakan, payment sukses
 *  3333xxxxxx  → inquiry 3 bulan tunggakan, payment sukses
 *  4444xxxxxx  → payment timeout → advice konfirmasi (adviceUsed: true)
 *  5555xxxxxx  → payment timeout → advice kosong → throw PENDING_ADVICE
 *  6666xxxxxx  → inquiry error: pelanggan tidak ditemukan (PDAM_403)
 *  7777xxxxxx  → inquiry sukses 1 bulan, payment error bisnis (406)
 *  8888xxxxxx  → inquiry sukses 1 bulan, payment LAMBAT (3s, sukses)
 *  default     → inquiry 1 bulan, payment sukses
 */

import {
  PdamInquiryItem,
  PdamInquiryExecutionResult,
  PdamPaymentExecutionResult,
  PdamAdviceExecutionResult,
  PdamApiError,
  PdamPaymentResponse,
} from "@/lib/pdam-api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function padThousands(n: number): string {
  // PDAM format: titik sebagai pemisah ribuan
  return n.toLocaleString("id-ID").replace(/,/g, ".");
}

function todayYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function monthsBefore(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Buat 1 item tagihan dummy */
function makeBill(idpel: string, offsetMonths: number, opts?: {
  nama?: string;
  harga?: number;
  denda?: number;
  gol?: string;
}): PdamInquiryItem {
  const harga  = opts?.harga  ?? 58_500;
  const denda  = opts?.denda  ?? (offsetMonths > 1 ? 5_000 : 0);
  const materai  = 0;
  const limbah   = 8_500;
  const retribusi = 2_000;
  const total    = harga + denda + materai + limbah + retribusi;

  return {
    alamat      : `Jl. Mock No.${idpel.slice(-3)} RT 01`,
    angsuran    : "0",
    biaya_meter : "0",
    biaya_tetap : "0",
    byadmin     : "2000",
    denda       : padThousands(denda),
    gma         : "0",
    gol         : opts?.gol  ?? "R1",
    harga       : padThousands(harga),
    limbah      : padThousands(limbah),
    materai     : padThousands(materai),
    nama        : opts?.nama ?? `PELANGGAN DUMMY ${idpel.slice(-4)}`,
    pakai       : "12",
    retribusi   : padThousands(retribusi),
    stand_i     : "0512",
    stand_l     : "0500",
    status      : "A",
    sub_tot     : padThousands(harga + denda),
    tanggal     : todayYYYYMMDD(),
    thbln       : monthsBefore(offsetMonths),
    total       : padThousands(total),
    diskon      : "0",
  };
}

/** Pilih skenario dari 4 digit pertama idpel */
function detectScenario(idpel: string): string {
  const prefix = idpel.replace(/\D/g, "").slice(0, 4);
  if (prefix === "1111") return "SUCCESS_1";
  if (prefix === "2222") return "SUCCESS_2";
  if (prefix === "3333") return "SUCCESS_3";
  if (prefix === "4444") return "TIMEOUT_ADVICE_OK";
  if (prefix === "5555") return "TIMEOUT_ADVICE_EMPTY";
  if (prefix === "6666") return "INQUIRY_ERROR";
  if (prefix === "7777") return "PAYMENT_ERROR";
  if (prefix === "8888") return "SLOW_SUCCESS";
  return "SUCCESS_1"; // default
}

// ── Mock: Inquiry ─────────────────────────────────────────────────────────────

export async function mockPdamInquiry(idpel: string): Promise<PdamInquiryExecutionResult> {
  // Simulasi round-trip ke server PDAM (800–1400 ms)
  await sleep(800 + Math.floor(Math.random() * 600));

  const scenario = detectScenario(idpel);

  if (scenario === "INQUIRY_ERROR") {
    const err = new PdamApiError("Pelanggan tidak ditemukan atau tagihan tidak tersedia", "PDAM_403", false);
    err.httpStatus = 200;
    throw err;
  }

  let items: PdamInquiryItem[];

  switch (scenario) {
    case "SUCCESS_2":
      items = [makeBill(idpel, 1), makeBill(idpel, 2, { denda: 5_000 })];
      break;
    case "SUCCESS_3":
      items = [
        makeBill(idpel, 1),
        makeBill(idpel, 2, { denda: 5_000 }),
        makeBill(idpel, 3, { denda: 10_000 }),
      ];
      break;
    default:
      // SUCCESS_1, TIMEOUT_*, PAYMENT_ERROR, SLOW_SUCCESS
      items = [makeBill(idpel, 1)];
  }

  return {
    items,
    rawResponse: { RequestPelangganRev2Result: { data: items, error_code: "200", message: "SUCCESS", status: "success" } },
    httpStatus: 200,
  };
}

// ── Mock: Payment ─────────────────────────────────────────────────────────────

export async function mockPdamPayment(params: {
  idpel: string;
  totalBayar: number;
  transactionCode: string;
  loketCode: string;
  username: string;
}): Promise<PdamPaymentExecutionResult> {
  const scenario = detectScenario(params.idpel);

  if (scenario === "SLOW_SUCCESS") {
    await sleep(4_000 + Math.floor(Math.random() * 1_000)); // 4–5 detik (lambat)
  } else if (scenario === "TIMEOUT_ADVICE_OK" || scenario === "TIMEOUT_ADVICE_EMPTY") {
    await sleep(9_000); // 9 detik simulasi timeout sebelum lempar error
    const err = new PdamApiError("PDAM timeout", "NETWORK_TIMEOUT", true);
    err.httpStatus = 408;
    throw err;
  } else {
    await sleep(1_500 + Math.floor(Math.random() * 500)); // 1.5–2 detik normal
  }

  if (scenario === "PAYMENT_ERROR") {
    const err = new PdamApiError("Transaksi gagal diproses", "PDAM_406", false);
    err.httpStatus = 200;
    throw err;
  }

  // SUCCESS cases — use offsetMonths=1 to match inquiry (which also returns monthsBefore(1))
  const billData = [makeBill(params.idpel, 1, { nama: `PELANGGAN DUMMY ${params.idpel.slice(-4)}` })];
  const response: PdamPaymentResponse = {
    RequestPaymentBulk_Rev2Result: {
      data: billData,
      error_code: "200",
      message: "SUCCESS",
      status: "success",
    },
  };

  return {
    code: "000000",
    data: billData,
    rawResponse: response,
    httpStatus: 200,
  };
}

// ── Mock: Advice ──────────────────────────────────────────────────────────────

export async function mockPdamAdvice(params: {
  idpel: string;
  tanggal: string;
}): Promise<PdamAdviceExecutionResult> {
  // Simulasi query advice ke PDAM (600–1000 ms)
  await sleep(600 + Math.floor(Math.random() * 400));

  const scenario = detectScenario(params.idpel);

  if (scenario === "TIMEOUT_ADVICE_OK") {
    // Advice berhasil menemukan konfirmasi pembayaran
    const billData = [makeBill(params.idpel, 1, { nama: `PELANGGAN DUMMY ${params.idpel.slice(-4)}` })];
    return {
      data: billData,
      rawResponse: { RequestLppTanggalResult: { data: billData, error_code: "200", message: "SUCCESS", status: "success" } },
      httpStatus: 200,
    };
  }

  // TIMEOUT_ADVICE_EMPTY dan lainnya → advice kosong
  return {
    data: [],
    rawResponse: { RequestLppTanggalResult: { data: [], error_code: "200", message: "KOSONG", status: "success" } },
    httpStatus: 200,
  };
}

// ── Mock: pdamPaymentWithRetry ────────────────────────────────────────────────

export async function mockPdamPaymentWithRetry(
  params: {
    idpel: string;
    totalBayar: number;
    transactionCode: string;
    loketCode: string;
    username: string;
  },
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<{
  result: string;
  attempts: number;
  data: PdamInquiryItem[];
  rawResponse: PdamPaymentResponse;
  httpStatus: number;
  adviceUsed?: boolean;
}> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const tanggal = new Date().toISOString().slice(0, 10);

  const scenario = detectScenario(params.idpel);
  let paymentTimedOut = false;
  let lastError: PdamApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (paymentTimedOut) {
      // Advice phase — cepat (tidak ada sleep panjang di mock)
      await sleep(100);
      try {
        const adviceResult = await mockPdamAdvice({ idpel: params.idpel, tanggal });
        if (adviceResult.data.length > 0) {
          return {
            result: "000000",
            attempts: attempt,
            data: adviceResult.data,
            rawResponse: { RequestPaymentBulk_Rev2Result: "000000" } as PdamPaymentResponse,
            httpStatus: adviceResult.httpStatus,
            adviceUsed: true,
          };
        }
        const pending = new PdamApiError(
          "Pembayaran timeout. Advice belum menunjukkan konfirmasi dari PDAM.",
          "NETWORK_TIMEOUT",
          true
        );
        pending.attemptCount = attempt;
        lastError = pending;
        continue;
      } catch (advErr: unknown) {
        const msg = advErr instanceof Error ? advErr.message : "Advice gagal";
        const pending = new PdamApiError(`Pembayaran timeout, advice gagal: ${msg}`, "NETWORK_TIMEOUT", true);
        pending.attemptCount = attempt;
        lastError = pending;
        continue;
      }
    }

    try {
      const payResult = await mockPdamPayment(params);
      return {
        result: payResult.code,
        attempts: attempt,
        data: payResult.data,
        rawResponse: payResult.rawResponse,
        httpStatus: payResult.httpStatus,
      };
    } catch (err: unknown) {
      const normalized =
        err instanceof PdamApiError
          ? err
          : new PdamApiError(
              err instanceof Error ? err.message : "Pembayaran PDAM gagal",
              "UNKNOWN_ERROR",
              false
            );
      normalized.attemptCount = attempt;
      lastError = normalized;

      if (normalized.retryable && attempt < maxAttempts) {
        paymentTimedOut = true;
        continue;
      }
      break;
    }
  }

  // Setelah semua attempt habis tanpa sukses
  if (scenario === "TIMEOUT_ADVICE_EMPTY") {
    const pendingAdviceErr = new PdamApiError(
      "Pembayaran timeout. Silakan cek manual via menu Advice PDAM.",
      "PENDING_ADVICE",
      true
    );
    pendingAdviceErr.attemptCount = maxAttempts;
    throw pendingAdviceErr;
  }

  if (lastError) throw lastError;
  throw new PdamApiError("Pembayaran PDAM gagal", "UNKNOWN_ERROR", false);
}
