// PDAM BJM External API Configuration & Helpers

import { checkCircuit, recordSuccess, recordFailure, configureCircuitBreaker } from "@/lib/circuit-breaker";

const PDAM_PROVIDER = "PDAM";
configureCircuitBreaker(PDAM_PROVIDER, { failureThreshold: 5, resetTimeoutMs: 30_000, halfOpenMaxAttempts: 2 });

const PDAM_PROTOCOL = process.env.PDAM_PROTOCOL || "https";
const PDAM_BASE_URL = `${PDAM_PROTOCOL}://${process.env.PDAM_IPADDR}:${process.env.PDAM_PORT || "8730"}/webpdam.svc`;
const PDAM_CLIENT_ID = process.env.PDAM_CLIENT_ID || "";
const PDAM_PASSWORD = process.env.PDAM_PASSWORD || "";

/**
 * Parse angka dari response PDAM API.
 * PDAM menggunakan "." sebagai pemisah ribuan (format Indonesia).
 * Contoh: "15.181" = 15181, "1.234.567" = 1234567
 * Desimal menggunakan ",": "388,47" = 388.47
 * Angka tanpa format: "39229" = 39229
 */
export function parsePdamNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  const str = String(value).trim();
  if (str === "") return 0;

  // Pattern: dot as thousands separator (e.g. "15.181", "1.234.567")
  // Matches: 1-3 digits, then groups of .XXX (exactly 3 digits), optionally followed by ,XX (decimal)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    // Remove dots (thousands), replace comma with dot (decimal)
    const normalized = str.replace(/\./g, "").replace(",", ".");
    return Number(normalized) || 0;
  }

  // Pattern: comma as decimal separator without thousands dot (e.g. "388,47")
  if (/^\d+(,\d+)$/.test(str)) {
    return Number(str.replace(",", ".")) || 0;
  }

  // Standard number (e.g. "39229", "388.47", "0")
  return Number(str) || 0;
}

export interface PdamInquiryItem {
  alamat: string;
  angsuran: string;
  biaya_meter: string;
  biaya_tetap: string;
  byadmin: string;
  denda: string;
  gma: string;
  gol: string;
  harga: string;
  limbah: string;
  materai: string;
  nama: string;
  pakai: string;
  retribusi: string;
  stand_i: string;
  stand_l: string;
  status: string;
  sub_tot: string;
  tanggal: string;
  thbln: string;
  total: string;
  diskon: string;
}

export interface PdamInquiryResultObj {
  data: PdamInquiryItem[];
  error_code: string;
  message: string;
  status: string;
}

export interface PdamInquiryResponse {
  RequestPelangganRev2Result: string | PdamInquiryResultObj;
}

export interface PdamInquiryExecutionResult {
  items: PdamInquiryItem[];
  rawResponse: PdamInquiryResponse;
  httpStatus: number;
}

export interface PdamPaymentResponse {
  RequestPaymentBulk_Rev2Result:
    | string
    | {
        data: PdamInquiryItem[] | null;
        error_code: string;
        message: string;
        status: string;
      };
}

export interface PdamPaymentExecutionResult {
  code: string;
  data: PdamInquiryItem[];
  rawResponse: PdamPaymentResponse;
  httpStatus: number;
}

export class PdamApiError extends Error {
  code: string;
  retryable: boolean;
  attemptCount?: number;
  httpStatus?: number;
  rawResponse?: unknown;

  constructor(message: string, code: string, retryable: boolean, attemptCount?: number) {
    super(message);
    this.name = "PdamApiError";
    this.code = code;
    this.retryable = retryable;
    this.attemptCount = attemptCount;
  }
}

// Error code mapping
export const PDAM_ERROR_CODES: Record<string, string> = {
  "402": "Internal system error pada server PDAM",
  "403": "Pelanggan tidak ditemukan atau tagihan tidak tersedia",
  "404": "Client ID tidak valid",
  "405": "Client ID terblokir oleh PDAM",
  "406": "Transaksi gagal diproses",
};

export const PDAM_PAYMENT_ERROR_CODES: Record<string, string> = {
  "403": "Payment gagal diproses oleh PDAM",
  "404": "Client ID tidak valid",
  "405": "Pembayaran diblokir oleh PDAM",
  "406": "Transaksi gagal diproses",
};

/**
 * Customer inquiry — fetch billing details from PDAM
 */
export async function pdamInquiry(idpel: string): Promise<PdamInquiryExecutionResult> {
  checkCircuit(PDAM_PROVIDER);

  const url = `${PDAM_BASE_URL}/reqcustomer_rev2/?idpel=${encodeURIComponent(idpel)}&clientid=${PDAM_CLIENT_ID}&password=${PDAM_PASSWORD}`;
  
  let res: Response;
  try {
    res = await fetch(url, { 
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error: unknown) {
    recordFailure(PDAM_PROVIDER);
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new PdamApiError("PDAM inquiry timeout", "NETWORK_TIMEOUT", true);
      timeoutError.httpStatus = 408;
      throw timeoutError;
    }
    const message = error instanceof Error ? error.message : "PDAM network error";
    const networkError = new PdamApiError(message, "NETWORK_ERROR", true);
    networkError.httpStatus = 0;
    throw networkError;
  }

  if (!res.ok) {
    recordFailure(PDAM_PROVIDER);
    const httpError = new PdamApiError(`PDAM Inquiry API error: HTTP ${res.status}`, `HTTP_${res.status}`, false);
    httpError.httpStatus = res.status;
    throw httpError;
  }

  const data: PdamInquiryResponse = await res.json();
  const result = data.RequestPelangganRev2Result;

  // Check for error codes (plain string responses)
  if (typeof result === "string" && PDAM_ERROR_CODES[result]) {
    const providerError = new PdamApiError(PDAM_ERROR_CODES[result], `PDAM_${result}`, false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  // Handle nested object response: { data: [...], error_code, status }
  let items: PdamInquiryItem[];
  if (typeof result === "object" && result !== null && "data" in result) {
    const obj = result as PdamInquiryResultObj;
    if (obj.error_code && obj.error_code !== "200") {
      const errMsg = obj.message && obj.message !== "-" ? obj.message : PDAM_ERROR_CODES[obj.error_code] || `Error ${obj.error_code}`;
      const providerError = new PdamApiError(errMsg, `PDAM_${obj.error_code}`, false);
      providerError.httpStatus = res.status;
      providerError.rawResponse = data;
      throw providerError;
    }
    items = Array.isArray(obj.data) ? obj.data : [];
  } else if (typeof result === "string") {
    items = JSON.parse(result);
  } else if (Array.isArray(result)) {
    items = result;
  } else {
    items = [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    const providerError = new PdamApiError("Tidak ada tagihan ditemukan untuk pelanggan ini", "NO_BILLS", false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  recordSuccess(PDAM_PROVIDER);

  return {
    items,
    rawResponse: data,
    httpStatus: res.status,
  };
}

/**
 * Generate transaction code: YYYYMMDDHHmmss-<hex>
 */
export function generateTransactionCode(): string {
  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, "0")
    + String(now.getDate()).padStart(2, "0")
    + String(now.getHours()).padStart(2, "0")
    + String(now.getMinutes()).padStart(2, "0")
    + String(now.getSeconds()).padStart(2, "0");
  const hex = Math.random().toString(16).substring(2, 15).toUpperCase();
  return `${ts}-${hex}`;
}

/**
 * Process payment via PDAM API
 * DATA format: 1|{IDPEL}|0|{TOTAL_BAYAR}|{TGL_BAYAR_YYYYMMDD}|{IDTRANS}|{IDPETUGAS}|{KODE}|{TGL_TRANSAKSI}
 */
export async function pdamPayment(params: {
  idpel: string;
  totalBayar: number;
  transactionCode: string;
  loketCode: string;
  username: string;
}): Promise<PdamPaymentExecutionResult> {
  const now = new Date();
  const tglBayar = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, "0")
    + String(now.getDate()).padStart(2, "0");
  const tglTransaksi = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const dataParam = `1|${params.idpel}|0|${params.totalBayar}|${tglBayar}|${params.transactionCode}|${params.username}|${params.loketCode}|${tglTransaksi}`;

  const url = `${PDAM_BASE_URL}/reqpayment_package_rev2/?clientid=${PDAM_CLIENT_ID}&data=${encodeURIComponent(dataParam)}&password=${PDAM_PASSWORD}`;

  checkCircuit(PDAM_PROVIDER);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
    });
  } catch (error: unknown) {
    recordFailure(PDAM_PROVIDER);
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new PdamApiError("PDAM timeout", "NETWORK_TIMEOUT", true);
      timeoutError.httpStatus = 408;
      throw timeoutError;
    }

    const message = error instanceof Error ? error.message : "PDAM network error";
    const networkError = new PdamApiError(message, "NETWORK_ERROR", true);
    networkError.httpStatus = 0;
    throw networkError;
  }

  if (!res.ok) {
    const retryableHttp = [429, 502, 503, 504].includes(res.status);
    recordFailure(PDAM_PROVIDER);
    const httpError = new PdamApiError(
      `PDAM Payment API error: HTTP ${res.status}`,
      `HTTP_${res.status}`,
      retryableHttp
    );
    httpError.httpStatus = res.status;
    throw httpError;
  }

  const data: PdamPaymentResponse = await res.json();
  const result = data.RequestPaymentBulk_Rev2Result;

  if (typeof result === "object" && result !== null) {
    const errorCode = result.error_code || "UNKNOWN_ERROR";
    const status = (result.status || "").toLowerCase();

    if (status === "success" && errorCode === "200") {
      recordSuccess(PDAM_PROVIDER);
      return {
        code: "000000",
        data: Array.isArray(result.data) ? result.data : [],
        rawResponse: data,
        httpStatus: res.status,
      };
    }

    const errMsg =
      result.message && result.message.trim() !== "-"
        ? result.message.trim()
        : PDAM_PAYMENT_ERROR_CODES[errorCode] || `Pembayaran gagal (kode: ${errorCode})`;

    const providerError = new PdamApiError(errMsg, `PDAM_${errorCode}`, false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  if (typeof result === "string") {
    if (result === "000000") {
      recordSuccess(PDAM_PROVIDER);
      return {
        code: result,
        data: [],
        rawResponse: data,
        httpStatus: res.status,
      };
    }

    const errMsg = PDAM_PAYMENT_ERROR_CODES[result] || PDAM_ERROR_CODES[result] || `Pembayaran gagal (kode: ${result})`;
    const providerError = new PdamApiError(errMsg, `PDAM_${result}`, false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  const invalidResponseError = new PdamApiError("Format response payment PDAM tidak dikenali", "INVALID_PAYMENT_RESPONSE", false);
  invalidResponseError.httpStatus = res.status;
  invalidResponseError.rawResponse = data;
  throw invalidResponseError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Controlled retry for PDAM payment API.
 * Retry only for network/timeout/transient HTTP errors.
 */
export async function pdamPaymentWithRetry(
  params: {
    idpel: string;
    totalBayar: number;
    transactionCode: string;
    loketCode: string;
    username: string;
  },
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
  }
): Promise<{
  result: string;
  attempts: number;
  data: PdamInquiryItem[];
  rawResponse: PdamPaymentResponse;
  httpStatus: number;
}> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;

  let lastError: PdamApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const payResult = await pdamPayment(params);
      return {
        result: payResult.code,
        attempts: attempt,
        data: payResult.data,
        rawResponse: payResult.rawResponse,
        httpStatus: payResult.httpStatus,
      };
    } catch (error: unknown) {
      const normalized =
        error instanceof PdamApiError
          ? error
          : new PdamApiError(
              error instanceof Error ? error.message : "Pembayaran PDAM gagal",
              "UNKNOWN_ERROR",
              false
            );

      normalized.attemptCount = attempt;
      lastError = normalized;

      const shouldRetry = normalized.retryable && attempt < maxAttempts;
      if (!shouldRetry) break;

      const jitter = Math.floor(Math.random() * 150);
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(delayMs);
    }
  }

  if (lastError) throw lastError;
  throw new PdamApiError("Pembayaran PDAM gagal", "UNKNOWN_ERROR", false);
}

// ─── Advice / Re-check ────────────────────────────────────────────────────────

export interface PdamAdviceResultObj {
  data: PdamInquiryItem[];
  error_code: string;
  message: string;
  status: string;
}

export interface PdamAdviceResponse {
  RequestLppTanggalResult: string | PdamAdviceResultObj;
}

export interface PdamAdviceExecutionResult {
  data: PdamInquiryItem[];
  rawResponse: PdamAdviceResponse;
  httpStatus: number;
}

/**
 * PDAM Advice — re-check payment status for a transaction that timed out.
 * GET {PDAM_BASE_URL}/reqlpptanggal/?idpel=...&tanggal=YYYY-MM-DD&clientid=...&password=...
 * The `tanggal` should be the date the original payment was attempted (YYYY-MM-DD format).
 */
export async function pdamAdvice(params: {
  idpel: string;
  tanggal: string;  // YYYY-MM-DD
}): Promise<PdamAdviceExecutionResult> {
  checkCircuit(PDAM_PROVIDER);

  const url = `${PDAM_BASE_URL}/reqlpptanggal/?idpel=${encodeURIComponent(params.idpel)}&tanggal=${encodeURIComponent(params.tanggal)}&clientid=${PDAM_CLIENT_ID}&password=${PDAM_PASSWORD}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error: unknown) {
    recordFailure(PDAM_PROVIDER);
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new PdamApiError("PDAM advice timeout", "NETWORK_TIMEOUT", true);
      timeoutError.httpStatus = 408;
      throw timeoutError;
    }
    const message = error instanceof Error ? error.message : "PDAM network error";
    const networkError = new PdamApiError(message, "NETWORK_ERROR", true);
    networkError.httpStatus = 0;
    throw networkError;
  }

  if (!res.ok) {
    recordFailure(PDAM_PROVIDER);
    const httpError = new PdamApiError(`PDAM Advice API error: HTTP ${res.status}`, `HTTP_${res.status}`, false);
    httpError.httpStatus = res.status;
    throw httpError;
  }

  const data: PdamAdviceResponse = await res.json();
  const result = data.RequestLppTanggalResult;

  if (typeof result === "object" && result !== null) {
    const obj = result as PdamAdviceResultObj;
    const errorCode = obj.error_code || "UNKNOWN";
    const status = (obj.status || "").toLowerCase();

    if (status === "success" && errorCode === "200") {
      recordSuccess(PDAM_PROVIDER);
      return {
        data: Array.isArray(obj.data) ? obj.data : [],
        rawResponse: data,
        httpStatus: res.status,
      };
    }

    const errMsg =
      obj.message && obj.message.trim() !== "-"
        ? obj.message.trim()
        : PDAM_PAYMENT_ERROR_CODES[errorCode] || PDAM_ERROR_CODES[errorCode] || `Advice gagal (kode: ${errorCode})`;

    const providerError = new PdamApiError(errMsg, `PDAM_${errorCode}`, false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  if (typeof result === "string") {
    const errMsg = PDAM_PAYMENT_ERROR_CODES[result] || PDAM_ERROR_CODES[result] || `Advice gagal (kode: ${result})`;
    const providerError = new PdamApiError(errMsg, `PDAM_${result}`, false);
    providerError.httpStatus = res.status;
    providerError.rawResponse = data;
    throw providerError;
  }

  const invalidError = new PdamApiError("Format response advice PDAM tidak dikenali", "INVALID_ADVICE_RESPONSE", false);
  invalidError.httpStatus = res.status;
  invalidError.rawResponse = data;
  throw invalidError;
}
