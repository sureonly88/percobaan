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
  const digits = idpel.replace(/\D/g, "");
  const p4 = digits.slice(0, 4);
  const p8 = digits.slice(0, 8);

  // BPJS: official prefix 88888010XXXXXXXX — must check before p4 "8888"
  if (p8 === "88888010" || p4 === "4444") return "BPJS";

  // Official Lunasin test patterns (doc.lunasin.co.id Data Testing)
  if (p4 === "5420" || p4 === "2222") return "TWO_BILLS";
  if (p4 === "5430") return "THREE_BILLS";
  if (p4 === "5440") return "FOUR_BILLS";
  if (p4 === "5210" || p4 === "3210" || p4 === "3333") return "PLN_PREPAID";
  if (p4 === "1710") return "PLN_NONREK";
  if (p4 === "0211" || p4 === "5555") return "TELKOM";
  // Pulsa error IDs must be checked BEFORE the generic p4 "0813" prefix
  if (digits === "081321002000") return "PAYMENT_ERROR";
  if (digits === "081321003000") return "PAYMENT_PENDING";
  if (p4 === "0813" || p4 === "9999") return "PULSA";

  // PDAM Lunasin official test IDs (pdam-kota-banjarmasin)
  if (digits === "1022100") return "PDAM_LUNASIN";
  if (digits === "1022200") return "PDAM_LUNASIN_TWO";

  // Official Lunasin error test IDs — per product
  // PLN Prepaid errors
  if (digits === "530200000000" || digits === "32020000000") return "PAYMENT_ERROR";
  if (digits === "530300000000" || digits === "32030000000") return "PAYMENT_PENDING";
  // BPJS Kesehatan errors (p8 ≠ "88888010" so these won't be caught by BPJS check above)
  if (digits === "8888800100000000") return "INQUIRY_ERROR";
  if (digits === "8888800200000000") return "PAYMENT_ERROR";
  if (digits === "8888800300000000") return "PAYMENT_PENDING";
  // PLN Nonrek errors
  if (digits === "1701000000000") return "INQUIRY_ERROR";
  if (digits === "1702000000000") return "PAYMENT_ERROR";
  if (digits === "1703000000000") return "PAYMENT_PENDING";
  // Telkom errors
  if (digits === "02101000000") return "INQUIRY_ERROR";
  if (digits === "02102000000") return "PAYMENT_ERROR";
  if (digits === "02103000000") return "PAYMENT_PENDING";

  // Error scenarios — official PLN Postpaid + PDAM + custom prefix patterns
  if (p4 === "6666" || digits === "540100000000" || digits === "1022010") return "INQUIRY_ERROR";
  if (p4 === "7777" || digits === "540200000000" || digits === "1022020") return "PAYMENT_ERROR";
  if (p4 === "8888" || digits === "540300000000" || digits === "1022030") return "PAYMENT_PENDING";

  return "SUCCESS";
}

function nowYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function nowDatetimeStr(): string {
  const d = new Date();
  return [
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`,
  ].join(" ");
}

function monthsAgoYYYYMM(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fakeToken(): string {
  // PLN token: 20 digits formatted as XXXX-XXXX-XXXX-XXXX-XXXX
  const digits = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
  return [0, 4, 8, 12, 16].map((s) => digits.slice(s, s + 4)).join("-");
}

function fakeRefnum(): string {
  // 32-char uppercase alphanumeric reference number (per Lunasin docs)
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function makeMockRawResponse(
  idTrx: string,
  idpel: string,
  kodeProduk: string,
  tipe: "inquiry" | "payment" | "advice",
  data: LunasinResponseData,
  rc = "0000",
  rcMsg = "Sukses"
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
  // Realistic per-bill amounts matching doc examples (~216K–242K)
  const billAmounts = [216_514, 242_215, 198_730, 235_450];
  const rpAdmin = 6_000; // PLN admin fee per docs
  const rpAmount = Array.from({ length: numBills }, (_, i) => billAmounts[i % billAmounts.length])
    .reduce((a, b) => a + b, 0);

  // Periods ordered oldest → newest, e.g. for 2 bills: [monthsAgo(1), monthsAgo(0)]
  const periods = Array.from({ length: numBills }, (_, i) => monthsAgoYYYYMM(numBills - 1 - i));

  // stand_meter: realistic sequential readings, formatted 8-digit zero-padded
  const baseStand = 3837;
  const increments = [308, 217, 289, 254];
  const meterReadings: number[] = [baseStand];
  for (let i = 0; i < numBills; i++) {
    meterReadings.push(meterReadings[i] + increments[i % increments.length]);
  }
  const fmtMeter = (n: number) => String(n).padStart(8, "0");

  const detail = periods.map((periode, i) => ({
    periode,
    stand_meter: `${fmtMeter(meterReadings[i])}-${fmtMeter(meterReadings[i + 1])}`,
    rp_amount: String(billAmounts[i % billAmounts.length]),
  }));

  return {
    idpel,
    nama: `IRWAN AMIR ${idpel.slice(-4)}`,
    jum_bill: String(numBills),
    // zero-padded 2-digit string per docs ("00", "02", etc.)
    jum_tunggakan: String(numBills).padStart(2, "0"),
    tarif: "R1M",
    daya: "900",
    stand_meter: `${fmtMeter(meterReadings[0])}-${fmtMeter(meterReadings[numBills])}`,
    rp_amount: String(rpAmount),
    rp_admin: String(rpAdmin),
    rp_total: String(rpAmount + rpAdmin),
    refnum_lunasin: `LNS${Date.now()}`,
    // Format: YYYYMMYYYYMM (periods concatenated, per docs)
    periode: periods.join(""),
    detail,
  };
}

function makePlnPrepaidData(idpel: string, nominal = 50_000): LunasinResponseData {
  const rpAdmin = 3_000;
  // PJU (Pajak Penerangan Jalan) ~9.1% of nominal; rp_token = nominal - rp_pju
  const rpPju = Math.round(nominal * 0.091);
  const rpToken = nominal - rpPju;
  const kwh = (rpToken / 1349).toFixed(2);    // R1M/900VA tariff ~Rp1349/kWh
  return {
    nometer: idpel,                             // meter number = input1
    idpel,
    nama: "IRWAN AMIR",
    jum_bill: "1",
    tarif: "R1M",
    daya: "900",
    rp_amount: String(nominal),
    rp_admin: String(rpAdmin),
    rp_total: String(nominal + rpAdmin),
    rp_materai: "0.00",
    rp_ppn: "0.00",
    rp_pju: `${rpPju}.00`,
    rp_angsuran: "0.00",
    rp_token: `${rpToken}.00`,
    kwh,
    refnum_lunasin: `LNS${Date.now()}`,
    periode: "",
  };
}

function makePlnNonrekData(idpel: string): LunasinResponseData {
  // noreg = registration order number = input1; idpel = internal PLN customer ID
  return {
    noreg: idpel,
    idpel: `540${idpel.slice(-9).padStart(9, "0")}`,
    nama: "IRWAN AMIR",
    jum_bill: "1",
    rp_amount: "572000",
    rp_admin: "3000",
    rp_total: "575000",
    refnum_lunasin: `LNS${Date.now()}`,
    tgl_reg: nowYYYYMMDD(),
    jenis_reg: "PB",
    periode: "",
  };
}

function makeBpjsData(idpel: string): LunasinResponseData {
  // Per Lunasin docs: periode = bulan pembayaran (from input2, mock uses "1")
  // nova = nomor VA = input1 (same as idpel in mock context)
  const numPeserta = 4;
  const rpPerPeserta = 45_000;
  const rpAmount = rpPerPeserta * numPeserta;
  const rpAdmin = 2_500;
  return {
    idpel,
    nova: idpel,
    nova_kepala_keluarga: idpel,
    nama: "IRWAN AMIR",
    jum_bill: "1",
    jum_peserta: String(numPeserta),
    kode_cabang: "",
    nama_cabang: "",
    sisa: "0",
    rp_amount: String(rpAmount),
    rp_admin: String(rpAdmin),
    rp_total: String(rpAmount + rpAdmin),
    refnum_lunasin: `LNS${Date.now()}`,
    periode: "1",
  };
}

function makeTelkomData(idpel: string): LunasinResponseData {
  // Telkom periode = comma-separated YYYYMM (e.g. "202501") per simulate-telkom.js
  const numBills = 1;
  const rpAmount = 150_000;
  const rpAdmin = 3_000 * numBills;
  const periods = Array.from({ length: numBills }, (_, i) => monthsAgoYYYYMM(numBills - 1 - i));
  return {
    idpel,
    nama: "IRWAN AMIR",
    jum_bill: String(numBills),
    rp_amount: String(rpAmount),
    rp_admin: String(rpAdmin),
    rp_total: String(rpAmount + rpAdmin),
    refnum_lunasin: `LNS${Date.now()}`,
    refnum: "012A",
    periode: periods.join(","),
  };
}

function makePdamLunasinData(idpel: string, numBills = 1): LunasinResponseData {
  // Struktur berdasarkan response resmi Lunasin (doc.lunasin.co.id – pdam-kota-banjarmasin)
  // Bulan tertunggak paling lama memiliki denda; bulan berikutnya normal
  const billAmounts = [128_974, 62_599, 95_200, 78_000];   // rp_total per detail
  const rpAirArr    = [62_474,  46_099, 55_000, 48_000];
  const rpDendaArr  = [50_000,  0,      0,      0];          // denda hanya di bulan pertama
  const rpAdmin     = 3_000 * numBills;                      // 3000/bulan sesuai docs (6000 untuk 2 bln)

  const rpAmount = Array.from({ length: numBills }, (_, i) => billAmounts[i % billAmounts.length])
    .reduce((a, b) => a + b, 0);

  // Periods: tertua → terbaru
  const periods = Array.from({ length: numBills }, (_, i) => monthsAgoYYYYMM(numBills - 1 - i));

  // Meter air: mulai 172 m³, naik 20 m³/bulan (sesuai contoh docs: 172→192→212)
  const baseStand = 172;
  const meterReadings: number[] = [baseStand];
  for (let i = 0; i < numBills; i++) {
    meterReadings.push(meterReadings[i] + 20);
  }

  const detail = periods.map((periode, i) => ({
    periode,
    meter_awal: String(meterReadings[i]),
    meter_akhir: String(meterReadings[i + 1]),
    rp_total: String(billAmounts[i % billAmounts.length]),
    rp_air: String(rpAirArr[i % rpAirArr.length]),
    rp_denda: String(rpDendaArr[i % rpDendaArr.length]),
    rp_materai: "0",
    rp_administrasi: "0",
    rp_danameter: "12500",
    rp_sampah: "0",
    nama_field_1: "retribusi",
    value_field_1: "4000",
    nama_field_2: "",
    value_field_2: "",
    nama_field_3: "",
    value_field_3: "",
  }));

  return {
    idpel,
    nama: "IRWAN AMIR",
    golongan: "",
    alamat: "Jalan Soekarno Hatta 182",
    nama_pdam: "PDAM Kota Banjarmasin",
    jum_bill: String(numBills),
    jum_tunggakan: String(numBills).padStart(2, "0"),
    rp_amount: String(rpAmount),
    rp_admin: String(rpAdmin),
    rp_total: String(rpAmount + rpAdmin),
    refnum_lunasin: `LNS${Date.now()}`,
    refnum: String(Date.now()),
    // Format: YYYYMMYYYYMM (gabungan periode awal & akhir per docs)
    periode: periods.join(""),
    nama_field_1: "",
    value_field_1: "",
    nama_field_2: "",
    value_field_2: "",
    nama_field_3: "",
    value_field_3: "",
    detail,
  };
}

function makePulsaData(idpel: string, kodeProduk: string): LunasinResponseData {
  // Extract denom: "pulsa-telkomsel-50K" → 50000, "pulsa-10000" → 10000
  const denomK = kodeProduk.match(/[-_](\d+)[kK]$/);
  const denomNum = kodeProduk.match(/(\d+)$/);
  const denom = denomK ? Number(denomK[1]) * 1000 : (denomNum ? Number(denomNum[1]) : 25_000);
  // Build display name: "pulsa-telkomsel-50K" → "Pulsa Telkomsel 50K"
  const parts = kodeProduk.split("-");
  const label = parts[0].toLowerCase().startsWith("paketdata") ? "Paket Data" : "Pulsa";
  const operator = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "";
  const denomLabel = denomK ? `${denomK[1]}K` : `${Math.round(denom / 1000)}K`;
  const nama_produk = [label, operator, denomLabel].filter(Boolean).join(" ");
  // Per Lunasin docs: for pulsa rp_admin=0, rp_total=rp_amount (price embedded in buy price)
  const rpAmount = denom;
  return {
    idpel,
    nama: "-",                                    // per official Lunasin inquiry response
    jum_bill: "1",
    nomor: idpel,
    denom: String(denom),
    nama_produk,
    rp_amount: String(rpAmount),
    rp_admin: "0",                                // no admin fee for pulsa
    rp_total: String(rpAmount),
    refnum_lunasin: `LNS${Date.now()}`,
  };
}

/** Pilih data berdasarkan skenario dan kode produk */
function buildInquiryData(idpel: string, kodeProduk: string, scenario: string, nominal?: number): LunasinResponseData {
  if (scenario === "TWO_BILLS")   return makePlnPostpaidData(idpel, 2);
  if (scenario === "THREE_BILLS") return makePlnPostpaidData(idpel, 3);
  if (scenario === "FOUR_BILLS")  return makePlnPostpaidData(idpel, 4);
  if (scenario === "PLN_PREPAID" || kodeProduk.startsWith("pln-prepaid")) {
    // Nominal token dari input2 (dikirim dari halaman pembayaran); fallback 50_000
    return makePlnPrepaidData(idpel, nominal ?? 50_000);
  }
  if (scenario === "BPJS"   || kodeProduk.startsWith("bpjs"))        return makeBpjsData(idpel);
  if (scenario === "TELKOM" || kodeProduk.startsWith("telkom"))       return makeTelkomData(idpel);
  if (scenario === "PULSA"  || kodeProduk.startsWith("pulsa") || kodeProduk.startsWith("paketdata")) return makePulsaData(idpel, kodeProduk);
  if (scenario === "PLN_NONREK" || kodeProduk.startsWith("pln-nonrek")) return makePlnNonrekData(idpel);
  if (scenario === "PDAM_LUNASIN_TWO") return makePdamLunasinData(idpel, 2);
  if (scenario === "PDAM_LUNASIN" || kodeProduk.startsWith("pdam")) return makePdamLunasinData(idpel, 1);
  // Default / SUCCESS / PAYMENT_ERROR / PAYMENT_PENDING → PLN Pascabayar 1 bulan
  return makePlnPostpaidData(idpel, 1);
}

// ── Mock: Inquiry ─────────────────────────────────────────────────────────────

export async function mockLunasinInquiry(opts: {
  idpel: string;
  kodeProduk: string;
  input2?: string;
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

  const nominal = opts.input2 ? Number(opts.input2) : undefined;
  const data = buildInquiryData(opts.idpel, opts.kodeProduk, scenario, nominal);
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
  data.tgl_lunas = nowDatetimeStr();
  data.refnum = fakeRefnum();
  data.saldo_terpotong = data.rp_total;
  data.sisa_saldo = "9999000";
  if (opts.kodeProduk.startsWith("pln-prepaid")) {
    data.token = fakeToken();
    data.pesan_biller = "Informasi Hubungi Call Center 123 Atau hubungi PLN Terdekat";
  } else if (opts.kodeProduk.startsWith("pln")) {
    data.pesan_biller = "Rincian Tagihan dapat Diakses di www.pln.co.id";
  } else if (opts.kodeProduk.startsWith("bpjs")) {
    data.pesan_biller = "Rincian tagihan dapat diakses pada http://www.bpjs-kesehatan.go.id";
  } else if (opts.kodeProduk.startsWith("pulsa") || opts.kodeProduk.startsWith("paketdata")) {
    data.serial_number = `${Date.now()}`;
    data.masa_berlaku = "";
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
  data.tgl_lunas = nowDatetimeStr();
  data.refnum = `ADV${fakeRefnum()}`;
  data.saldo_terpotong = data.rp_total;
  data.sisa_saldo = "9999000";

  if (opts.kodeProduk.startsWith("pln-prepaid")) {
    data.token = fakeToken();
    data.pesan_biller = "Informasi Hubungi Call Center 123 Atau hubungi PLN Terdekat";
  } else if (opts.kodeProduk.startsWith("pln")) {
    data.pesan_biller = "Rincian Tagihan dapat Diakses di www.pln.co.id";
  } else if (opts.kodeProduk.startsWith("bpjs")) {
    data.pesan_biller = "Rincian tagihan dapat diakses pada http://www.bpjs-kesehatan.go.id";
  } else if (opts.kodeProduk.startsWith("pulsa") || opts.kodeProduk.startsWith("paketdata")) {
    data.serial_number = `${Date.now()}`;
    data.masa_berlaku = "";
  }

  const rawResponse = makeMockRawResponse(opts.idTrx, opts.idpel, opts.kodeProduk, "advice", data);
  return { data, rawResponse, isSuccess: true, isFailed: false, isPending: false };
}
