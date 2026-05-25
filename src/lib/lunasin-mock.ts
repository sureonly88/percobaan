/**
 * Lunasin Mock / Dummy API
 *
 * Aktifkan dengan set environment variable:
 *   LUNASIN_MOCK=true
 *
 * Skenario dikendalikan oleh 4 digit pertama idpel:
 *
 *  default / 1111  → PLN Pascabayar 1 bulan, sukses
 *  2222xxxxxx      → PLN Pascabayar 2 bulan tunggakan, sukses
 *  3333xxxxxx      → PLN Prabayar (token), sukses
 *  4444xxxxxx      → BPJS Kesehatan, sukses
 *  5555xxxxxx      → Telkom Telepon, sukses
 *  6666xxxxxx      → IDPEL tidak ditemukan (RC 1000) — inquiry error
 *  7777xxxxxx      → inquiry sukses, payment gagal (RC 0002)
 *  8888xxxxxx      → inquiry sukses, payment pending → advice sukses
 *  9999xxxxxx      → Pulsa, sukses
 *
 * Semua skenario sukses respek kode produk aktual (pln-postpaid/bpjs/telkom/pulsa/dst).
 * Prefix 6666/7777/8888 hanya override perilaku error.
 */

import {
  LunasinInquiryResult,
  LunasinPaymentResult,
  LunasinAdviceResult,
  LunasinApiError,
  LunasinResponse,
  LunasinResponseData,
} from "@/lib/lunasin-api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function detectScenario(idpel: string): string {
  const prefix = idpel.replace(/\D/g, "").slice(0, 4);
  if (prefix === "2222") return "TWO_BILLS";
  if (prefix === "3333") return "PLN_PREPAID";
  if (prefix === "4444") return "BPJS";
  if (prefix === "5555") return "TELKOM";
  if (prefix === "6666") return "INQUIRY_ERROR";
  if (prefix === "7777") return "PAYMENT_ERROR";
  if (prefix === "8888") return "PAYMENT_PENDING";
  if (prefix === "9999") return "PULSA";
  return "SUCCESS";
}

function nowYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function monthsAgoYYYYMM(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fakeToken(): string {
  // 20-digit PLN token
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
}

function makeMockRawResponse(
  idTrx: string,
  idpel: string,
  kodeProduk: string,
  tipe: "inquiry" | "payment" | "advice",
  data: LunasinResponseData,
  rc = "0000",
  rcMsg = "SUCCESS"
): LunasinResponse {
  return {
    rc,
    rc_msg: rcMsg,
    tipe_pesan: tipe,
    kode_loket: "MOCK",
    input1: idpel,
    input2: "",
    input3: "",
    id_trx: idTrx,
    kode_produk: kodeProduk,
    access_token: "mock-token",
    id_app: "mock-app",
    data,
  };
}

// ── Data Builders ─────────────────────────────────────────────────────────────

function makePlnPostpaidData(idpel: string, numBills: number): LunasinResponseData {
  const rpPerBulan = 185_000;
  const rpAdmin = 3_000;
  const rpAmount = rpPerBulan * numBills;
  const detail = Array.from({ length: numBills }, (_, i) => ({
    periode: monthsAgoYYYYMM(i),
    stand_meter: String(1550 + i * 52),
    rp_amount: String(rpPerBulan),
  }));
  return {
    idpel,
    nama: `PELANGGAN PLN ${idpel.slice(-6)}`,
    jum_bill: String(numBills),
    jum_tunggakan: String(numBills),
    tarif: "R1",
    daya: "900",
    stand_meter: "1550",
    rp_amount: String(rpAmount),
    rp_admin: String(rpAdmin),
    rp_total: String(rpAmount + rpAdmin),
    refnum_lunasin: `LNS${Date.now()}`,
    periode: detail.map((d) => d.periode).join(","),
    detail,
  };
}

function makePlnPrepaidData(idpel: string): LunasinResponseData {
  return {
    idpel,
    nama: `PELANGGAN TOKEN ${idpel.slice(-6)}`,
    jum_bill: "1",
    tarif: "R1",
    daya: "1300",
    stand_meter: "0",
    rp_amount: "100000",
    rp_admin: "3000",
    rp_total: "103000",
    refnum_lunasin: `LNS${Date.now()}`,
    periode: monthsAgoYYYYMM(0),
    detail: [],
  };
}

function makePlnNonrekData(idpel: string): LunasinResponseData {
  return {
    idpel,
    nama: `PELANGGAN NONREK ${idpel.slice(-6)}`,
    jum_bill: "1",
    tarif: "R1",
    daya: "2200",
    rp_amount: "525000",
    rp_admin: "3000",
    rp_total: "528000",
    refnum_lunasin: `LNS${Date.now()}`,
    noreg: `NR${idpel.slice(-6)}`,
    tgl_reg: nowYYYYMMDD(),
    jenis_reg: "PB",
    periode: "",
    detail: [],
  };
}

function makeBpjsData(idpel: string): LunasinResponseData {
  const periode = monthsAgoYYYYMM(0);
  return {
    idpel,
    nama: `PESERTA BPJS ${idpel.slice(-6)}`,
    jum_bill: "1",
    nova: `${idpel.padEnd(13, "0").slice(0, 13)}`,
    nova_kepala_keluarga: `${idpel.padEnd(13, "0").slice(0, 13)}`,
    jum_peserta: "4",
    kode_cabang: "0301",
    nama_cabang: "BANJARMASIN",
    sisa: "0",
    rp_amount: "248000",
    rp_admin: "2500",
    rp_total: "250500",
    refnum_lunasin: `LNS${Date.now()}`,
    periode,
    detail: [{ periode, rp_amount: "248000" }],
  };
}

function makeTelkomData(idpel: string): LunasinResponseData {
  const periode = monthsAgoYYYYMM(0);
  return {
    idpel,
    nama: `PELANGGAN TELKOM ${idpel.slice(-6)}`,
    jum_bill: "1",
    rp_amount: "150000",
    rp_admin: "2500",
    rp_total: "152500",
    refnum_lunasin: `LNS${Date.now()}`,
    refnum: `REF${Date.now()}`,
    periode,
    detail: [{ periode, rp_amount: "150000" }],
  };
}

function makePulsaData(idpel: string, kodeProduk: string): LunasinResponseData {
  // try to extract denom from kode produk e.g. "pulsa-10000"
  const denomMatch = kodeProduk.match(/(\d+)$/);
  const denom = denomMatch ? Number(denomMatch[1]) : 25_000;
  return {
    idpel,
    nama: `PULSA ${idpel}`,
    jum_bill: "1",
    nomor: idpel,
    denom: String(denom),
    nama_produk: `PULSA${Math.round(denom / 1000)}K`,
    serial_number: `SN${Date.now()}`,
    masa_berlaku: "30 hari",
    rp_amount: String(denom),
    rp_admin: "2000",
    rp_total: String(denom + 2000),
    refnum_lunasin: `LNS${Date.now()}`,
    periode: "",
    detail: [],
  };
}

/** Pilih data berdasarkan skenario dan kode produk */
function buildInquiryData(idpel: string, kodeProduk: string, scenario: string): LunasinResponseData {
  // Scenario-forced product type
  if (scenario === "TWO_BILLS") return makePlnPostpaidData(idpel, 2);
  if (scenario === "PLN_PREPAID" || kodeProduk.startsWith("pln-prepaid")) return makePlnPrepaidData(idpel);
  if (scenario === "BPJS"        || kodeProduk.startsWith("bpjs"))        return makeBpjsData(idpel);
  if (scenario === "TELKOM"      || kodeProduk.startsWith("telkom"))       return makeTelkomData(idpel);
  if (scenario === "PULSA"       || kodeProduk.startsWith("pulsa") || kodeProduk.startsWith("paketdata")) return makePulsaData(idpel, kodeProduk);
  if (kodeProduk.startsWith("pln-nonrek")) return makePlnNonrekData(idpel);
  // Default / SUCCESS / PAYMENT_ERROR / PAYMENT_PENDING → PLN Pascabayar 1 bulan
  return makePlnPostpaidData(idpel, 1);
}

// ── Mock: Inquiry ─────────────────────────────────────────────────────────────

export async function mockLunasinInquiry(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
}): Promise<LunasinInquiryResult> {
  await sleep(800 + Math.floor(Math.random() * 500));

  const scenario = detectScenario(opts.idpel);

  if (scenario === "INQUIRY_ERROR") {
    const err = new LunasinApiError(
      "IDPEL tidak dikenali atau tidak terdaftar",
      "1000",
      "IDPEL tidak dikenali",
      false
    );
    err.httpStatus = 200;
    err.rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "inquiry", {} as LunasinResponseData, "1000", "IDPEL tidak dikenali");
    throw err;
  }

  const data = buildInquiryData(opts.idpel, opts.kodeProduk, scenario);
  const rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "inquiry", data);

  return { data, rawResponse, idTrx: opts.idTrx };
}

// ── Mock: Payment ─────────────────────────────────────────────────────────────

export async function mockLunasinPayment(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
}): Promise<LunasinPaymentResult> {
  await sleep(1_200 + Math.floor(Math.random() * 600));

  const scenario = detectScenario(opts.idpel);

  if (scenario === "PAYMENT_ERROR") {
    const err = new LunasinApiError(
      "Transaksi ditolak oleh biller",
      "0002",
      "Gagal",
      false
    );
    err.httpStatus = 200;
    throw err;
  }

  if (scenario === "PAYMENT_PENDING") {
    // Simulate pending response — caller should follow up with advice
    const emptyData: LunasinResponseData = {
      idpel: opts.idpel,
      nama: "",
      jum_bill: "1",
      rp_amount: "0",
      rp_admin: "0",
      rp_total: "0",
      refnum_lunasin: opts.idTrx,
    };
    const rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "payment", emptyData, "0001", "PENDING");
    return { data: emptyData, rawResponse, isPending: true };
  }

  const data = buildInquiryData(opts.idpel, opts.kodeProduk, scenario);

  // Enrich with payment-specific fields
  data.tgl_lunas = nowYYYYMMDD();
  data.refnum = `PAY${Date.now()}`;
  data.saldo_terpotong = data.rp_total;
  data.sisa_saldo = "9999000";
  if (opts.kodeProduk.startsWith("pln-prepaid")) {
    data.token = fakeToken();
  }

  const rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "payment", data);
  return { data, rawResponse, isPending: false };
}

// ── Mock: Advice ──────────────────────────────────────────────────────────────

export async function mockLunasinAdvice(opts: {
  idpel: string;
  kodeProduk: string;
  idTrx: string;
}): Promise<LunasinAdviceResult> {
  await sleep(600 + Math.floor(Math.random() * 300));

  const scenario = detectScenario(opts.idpel);

  // PAYMENT_PENDING scenario: advice returns success (payment actually went through)
  const data = buildInquiryData(opts.idpel, opts.kodeProduk, scenario);
  data.tgl_lunas = nowYYYYMMDD();
  data.refnum = `ADV${Date.now()}`;

  if (opts.kodeProduk.startsWith("pln-prepaid")) {
    data.token = fakeToken();
  }

  const rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "advice", data);
  return { data, rawResponse, isSuccess: true, isFailed: false, isPending: false };
}
