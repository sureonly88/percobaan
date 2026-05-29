// Lunasin API Client — multi-product payment provider
// Supports: PLN Postpaid/Prepaid, BPJS, Telkom, PDAM, TV, Pulsa, etc.
// Docs: https://doc.lunasin.co.id

import { checkCircuit, recordSuccess, recordFailure, configureCircuitBreaker } from "@/lib/circuit-breaker";
import { mockLunasinInquiry, mockLunasinPayment, mockLunasinAdvice } from "@/lib/lunasin-mock";

const LUNASIN_MOCK = process.env.LUNASIN_MOCK === "true";

const LUNASIN_PROVIDER = "LUNASIN";
configureCircuitBreaker(LUNASIN_PROVIDER, { failureThreshold: 5, resetTimeoutMs: 30_000, halfOpenMaxAttempts: 2 });

const LUNASIN_URL = process.env.LUNASIN_URL || "https://dev.lunasin.co.id:2083";
const LUNASIN_LOKET = process.env.LUNASIN_LOKET || "";
const LUNASIN_TOKEN = process.env.LUNASIN_TOKEN || "";
const LUNASIN_APP_ID = process.env.LUNASIN_APP_ID || "";

// ── Types ──────────────────────────────────────────────

export interface LunasinRequest {
  tipe_pesan: "inquiry" | "payment" | "advice";
  kode_loket: string;
  input1: string;
  input2: string;
  input3: string;
  id_trx: string;
  kode_produk: string;
  access_token: string;
  id_app: string;
}

export interface LunasinDetailItem {
  periode?: string;
  // PLN Pascabayar
  stand_meter?: string;
  rp_amount?: string;
  // PDAM via Lunasin (doc.lunasin.co.id)
  rp_total?: string;
  meter_awal?: string;
  meter_akhir?: string;
  rp_air?: string;
  rp_denda?: string;
  rp_materai?: string;
  rp_administrasi?: string;
  rp_danameter?: string;
  rp_sampah?: string;
  [key: string]: unknown;
}

export interface LunasinResponseData {
  nama: string;
  jum_bill: string;
  refnum_lunasin: string;
  rp_amount: string;
  rp_admin: string;
  rp_total: string;
  idpel: string;
  // PLN Postpaid / Prepaid / Nonrek shared
  periode?: string;
  jum_tunggakan?: string;
  tarif?: string;
  daya?: string;
  stand_meter?: string;
  // PLN Prepaid specific
  nometer?: string;       // meter number (= input1, may differ from idpel)
  rp_materai?: string;    // materai fee (decimal string, e.g. "0.00")
  rp_ppn?: string;        // PPn (decimal string)
  rp_pju?: string;        // Pajak Penerangan Jalan (decimal string)
  rp_angsuran?: string;   // installment (decimal string)
  rp_token?: string;      // net token value (decimal string)
  kwh?: string;           // kilowatt hours (decimal string)
  token?: string;         // 20-digit token with dashes (payment/advice only)
  // PLN Nonrek specific
  noreg?: string;         // registration order number (= input1)
  tgl_reg?: string;       // registration date YYYYMMDD
  jenis_reg?: string;     // registration type e.g. "PB", "TAMBAH DAYA"
  // BPJS specific
  nova?: string;          // virtual account number
  nova_kepala_keluarga?: string;
  jum_peserta?: string;
  kode_cabang?: string;
  nama_cabang?: string;
  sisa?: string;
  // Pulsa / Paket Data specific
  nomor?: string;         // phone number
  denom?: string;         // denomination
  nama_produk?: string;   // product display name
  serial_number?: string; // SN (payment/advice only)
  masa_berlaku?: string;  // validity period (payment/advice only)
  // Payment-specific fields (all products)
  saldo_terpotong?: string;
  sisa_saldo?: string;
  tgl_lunas?: string;
  refnum?: string;
  pesan_biller?: string;
  detail?: LunasinDetailItem[];
  // Generic catch-all
  [key: string]: unknown;
}

export interface LunasinResponse {
  rc: string;
  rc_msg: string;
  tipe_pesan: string;
  kode_loket: string;
  input1: string;
  input2: string;
  input3: string;
  id_trx: string;
  kode_produk: string;
  access_token: string;
  id_app: string;
  data?: LunasinResponseData;
}

export class LunasinApiError extends Error {
  code: string;
  rcMsg: string;
  retryable: boolean;
  httpStatus?: number;
  rawResponse?: unknown;

  constructor(message: string, code: string, rcMsg: string, retryable: boolean) {
    super(message);
    this.name = "LunasinApiError";
    this.code = code;
    this.rcMsg = rcMsg;
    this.retryable = retryable;
  }
}

// ── Response Code Handling ──────────────────────────────

export const LUNASIN_RC: Record<string, { status: string; retryable: boolean }> = {
  "0000": { status: "Sukses", retryable: false },
  "0001": { status: "Pending", retryable: true },
  "0002": { status: "Gagal", retryable: false },
  "0003": { status: "Timeout/Pending", retryable: true },
  "0004": { status: "Biller Sibuk", retryable: false },
  "0005": { status: "Auth Invalid", retryable: false },
  "0006": { status: "Gagal", retryable: false },
  "1000": { status: "IDPEL tidak dikenali", retryable: false },
  "1001": { status: "Tagihan lunas", retryable: false },
  "1002": { status: "Tagihan belum ada", retryable: false },
  "1003": { status: "KWH melebihi batas", retryable: false },
  "1004": { status: "IDPEL diblok", retryable: false },
};

function isRetryableRC(rc: string): boolean {
  return rc === "0001" || rc === "0003";
}

// ── Product Codes ──────────────────────────────────────

export const LUNASIN_PRODUCTS: Record<string, { label: string; category: string; type: string }> = {
  // PLN (base codes — tier suffix appended dynamically)
  "pln-postpaid": { label: "PLN Pascabayar", category: "PLN", type: "postpaid" },
  "pln-prepaid": { label: "PLN Prabayar (Token)", category: "PLN", type: "prepaid" },
  "pln-nonrek": { label: "PLN Non-Rekening", category: "PLN", type: "postpaid" },
  // BPJS
  "bpjs-kesehatan": { label: "BPJS Kesehatan", category: "BPJS", type: "postpaid" },
  // Telkom
  "telkom-telepon": { label: "Telkom Telepon", category: "Telkom", type: "postpaid" },
  // PDAM
  "pdam-kota-banjarmasin": { label: "PDAM Kota Banjarmasin", category: "PDAM", type: "postpaid" },
  // TV
  "tv-indovision": { label: "Indovision", category: "TV", type: "postpaid" },
};

export type LunasinProductCode = string;

// ── Transaction ID Generator ──────────────────────────

export function generateLunasinTrxId(): string {
  // 15-digit numeric: timestamp + random
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return (ts + rand).slice(0, 15);
}

// ── Core API Call ──────────────────────────────────────

async function callLunasin(payload: LunasinRequest): Promise<LunasinResponse> {
  checkCircuit(LUNASIN_PROVIDER);

  let res: Response;
  try {
    res = await fetch(LUNASIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(JSON.stringify(payload)).toString(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error: unknown) {
    recordFailure(LUNASIN_PROVIDER);
    if (error instanceof DOMException && error.name === "AbortError") {
      const err = new LunasinApiError("Lunasin API timeout", "NETWORK_TIMEOUT", "Timeout", true);
      err.httpStatus = 408;
      throw err;
    }
    const message = error instanceof Error ? error.message : "Network error";
    const err = new LunasinApiError(message, "NETWORK_ERROR", "Network error", true);
    err.httpStatus = 0;
    throw err;
  }

  if (!res.ok) {
    recordFailure(LUNASIN_PROVIDER);
    const err = new LunasinApiError(
      `Lunasin API HTTP ${res.status}`,
      `HTTP_${res.status}`,
      `HTTP Error ${res.status}`,
      res.status === 429 || res.status >= 500
    );
    err.httpStatus = res.status;
    throw err;
  }

  const data: LunasinResponse = await res.json();
  recordSuccess(LUNASIN_PROVIDER);
  return data;
}

// ── Inquiry ────────────────────────────────────────────

export interface LunasinInquiryResult {
  data: LunasinResponseData;
  rawResponse: LunasinResponse;
  idTrx: string;
}

export async function lunasinInquiry(opts: {
  idpel: string;
  kodeProduk: string;
  input2?: string;
  input3?: string;
}): Promise<LunasinInquiryResult> {
  const idTrx = generateLunasinTrxId();

  if (LUNASIN_MOCK) return mockLunasinInquiry({ idpel: opts.idpel, kodeProduk: opts.kodeProduk, input2: opts.input2, idTrx });

  const payload: LunasinRequest = {
    tipe_pesan: "inquiry",
    kode_loket: LUNASIN_LOKET,
    input1: opts.idpel,
    input2: opts.input2 || "",
    input3: opts.input3 || "",
    id_trx: idTrx,
    kode_produk: opts.kodeProduk,
    access_token: LUNASIN_TOKEN,
    id_app: LUNASIN_APP_ID,
  };

  const response = await callLunasin(payload);

  if (response.rc !== "0000") {
    const rcInfo = LUNASIN_RC[response.rc];
    // RC 0005 = auth invalid from Lunasin, reword to avoid confusing with app session
    const message = response.rc === "0005"
      ? "Autentikasi ke provider PLN gagal. Hubungi admin untuk cek konfigurasi."
      : response.rc_msg || rcInfo?.status || `Error ${response.rc}`;
    const err = new LunasinApiError(message, response.rc, response.rc_msg, rcInfo?.retryable ?? false);
    err.rawResponse = response;
    throw err;
  }

  if (!response.data) {
    const err = new LunasinApiError("Tidak ada data tagihan dari provider", "NO_DATA", "No data", false);
    err.rawResponse = response;
    throw err;
  }

  return {
    data: response.data,
    rawResponse: response,
    idTrx,
  };
}

// ── Payment ────────────────────────────────────────────

export interface LunasinPaymentResult {
  data: LunasinResponseData;
  rawResponse: LunasinResponse;
  isPending: boolean;
}

export async function lunasinPayment(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
  input2?: string;
  input3?: string;
}): Promise<LunasinPaymentResult> {
  if (LUNASIN_MOCK) return mockLunasinPayment({ idpel: opts.idpel, kodeProduk: opts.kodeProduk, idTrx: opts.idTrx });

  const payload: LunasinRequest = {
    tipe_pesan: "payment",
    kode_loket: LUNASIN_LOKET,
    input1: opts.idpel,
    input2: opts.input2 || "",
    input3: opts.input3 || "",
    id_trx: opts.idTrx,
    kode_produk: opts.kodeProduk,
    access_token: LUNASIN_TOKEN,
    id_app: LUNASIN_APP_ID,
  };

  const response = await callLunasin(payload);

  // Pending — caller should send advice
  if (isRetryableRC(response.rc)) {
    return {
      data: response.data || ({} as LunasinResponseData),
      rawResponse: response,
      isPending: true,
    };
  }

  if (response.rc !== "0000") {
    const rcInfo = LUNASIN_RC[response.rc];
    const message = response.rc_msg || rcInfo?.status || `Error ${response.rc}`;
    const err = new LunasinApiError(message, response.rc, response.rc_msg, false);
    err.rawResponse = response;
    throw err;
  }

  return {
    data: response.data!,
    rawResponse: response,
    isPending: false,
  };
}

// ── Advice (check pending transaction status) ──────────

export interface LunasinAdviceResult {
  data: LunasinResponseData;
  rawResponse: LunasinResponse;
  isSuccess: boolean;
  isFailed: boolean;
  isPending: boolean;
}

export async function lunasinAdvice(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
  input2?: string;
  input3?: string;
}): Promise<LunasinAdviceResult> {
  if (LUNASIN_MOCK) return mockLunasinAdvice({ idpel: opts.idpel, kodeProduk: opts.kodeProduk, idTrx: opts.idTrx });

  const payload: LunasinRequest = {
    tipe_pesan: "advice",
    kode_loket: LUNASIN_LOKET,
    input1: opts.idpel,
    input2: opts.input2 || "",
    input3: opts.input3 || "",
    id_trx: opts.idTrx,
    kode_produk: opts.kodeProduk,
    access_token: LUNASIN_TOKEN,
    id_app: LUNASIN_APP_ID,
  };

  const response = await callLunasin(payload);

  // For advice: only RC 0002 = definitively failed
  const isSuccess = response.rc === "0000";
  const isFailed = response.rc === "0002";
  const isPending = !isSuccess && !isFailed;

  return {
    data: response.data || ({} as LunasinResponseData),
    rawResponse: response,
    isSuccess,
    isFailed,
    isPending,
  };
}

// ── Payment with auto-advice ───────────────────────────

export interface LunasinPayWithAdviceResult {
  data: LunasinResponseData;
  rawResponse: LunasinResponse;
  finalStatus: "SUCCESS" | "FAILED" | "PENDING";
  adviceAttempts: number;
}

export async function lunasinPayWithAdvice(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
  input2?: string;
  input3?: string;
  maxAdviceAttempts?: number;
}): Promise<LunasinPayWithAdviceResult> {
  const maxAdvice = opts.maxAdviceAttempts ?? 3;

  // Step 1: Send payment
  let payResult: LunasinPaymentResult;
  try {
    payResult = await lunasinPayment(opts);
  } catch (err) {
    // Network error / timeout → try advice
    if (err instanceof LunasinApiError && err.retryable) {
      return await runAdviceLoop(opts, maxAdvice);
    }
    throw err;
  }

  // Payment succeeded
  if (!payResult.isPending) {
    return {
      data: payResult.data,
      rawResponse: payResult.rawResponse,
      finalStatus: "SUCCESS",
      adviceAttempts: 0,
    };
  }

  // Payment pending → run advice loop
  return await runAdviceLoop(opts, maxAdvice);
}

async function runAdviceLoop(
  opts: { idpel: string; kodeProduk: string; idTrx: string; input2?: string; input3?: string },
  maxAttempts: number
): Promise<LunasinPayWithAdviceResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Wait before each advice attempt (2s, 4s, 6s)
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));

    try {
      const adviceResult = await lunasinAdvice(opts);

      if (adviceResult.isSuccess) {
        return {
          data: adviceResult.data,
          rawResponse: adviceResult.rawResponse,
          finalStatus: "SUCCESS",
          adviceAttempts: attempt,
        };
      }

      if (adviceResult.isFailed) {
        return {
          data: adviceResult.data,
          rawResponse: adviceResult.rawResponse,
          finalStatus: "FAILED",
          adviceAttempts: attempt,
        };
      }
      // Still pending — continue loop
    } catch {
      // Advice call failed — continue loop
    }
  }

  // Exhausted all advice attempts, still pending
  return {
    data: {} as LunasinResponseData,
    rawResponse: {} as LunasinResponse,
    finalStatus: "PENDING",
    adviceAttempts: maxAttempts,
  };
}
