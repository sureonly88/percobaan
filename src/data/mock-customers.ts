/**
 * Sample pelanggan untuk mode mock (development / testing)
 *
 * PDAM  → aktifkan dengan PDAM_MOCK=true   di .env
 * PLN/BPJS/Telkom/Pulsa → aktifkan dengan LUNASIN_MOCK=true di .env
 *
 * Skenario ditentukan oleh 4 digit PERTAMA idpel.
 */

// ── PDAM (PDAM_MOCK=true) ─────────────────────────────────────────────────────

export const MOCK_PDAM = [
  {
    idpel: "111100000001",
    skenario: "Sukses — 1 bulan tagihan, payment cepat",
  },
  {
    idpel: "222200000001",
    skenario: "Sukses — 2 bulan tunggakan",
  },
  {
    idpel: "333300000001",
    skenario: "Sukses — 3 bulan tunggakan",
  },
  {
    idpel: "444400000001",
    skenario: "Payment timeout → advice konfirmasi sukses (adviceUsed: true)",
  },
  {
    idpel: "555500000001",
    skenario: "Payment timeout → advice kosong → status PENDING_ADVICE (perlu cek manual)",
  },
  {
    idpel: "666600000001",
    skenario: "Inquiry error — pelanggan tidak ditemukan (PDAM_403)",
  },
  {
    idpel: "777700000001",
    skenario: "Inquiry sukses, payment ditolak PDAM (error 406)",
  },
  {
    idpel: "888800000001",
    skenario: "Payment lambat ~4 detik, akhirnya sukses",
  },
] as const;

// ── PLN Pascabayar (LUNASIN_MOCK=true, produk: pln-postpaid) ─────────────────

export const MOCK_PLN_POSTPAID = [
  {
    idpel: "541000000001",
    skenario: "Sukses — 1 bulan tagihan, R1/900VA",
  },
  {
    idpel: "222200000002",
    skenario: "Sukses — 2 bulan tunggakan",
  },
] as const;

// ── PLN Prabayar / Token (LUNASIN_MOCK=true, produk: pln-prepaid) ────────────

export const MOCK_PLN_PREPAID = [
  {
    idpel: "333300000002",
    skenario: "Sukses — token 20 digit dihasilkan, R1/1300VA",
  },
] as const;

// ── BPJS Kesehatan (LUNASIN_MOCK=true, produk: bpjs-kesehatan) ───────────────

export const MOCK_BPJS = [
  {
    idpel: "444400000002",
    skenario: "Sukses — 4 peserta, cabang Banjarmasin",
  },
] as const;

// ── Telkom (LUNASIN_MOCK=true, produk: telkom-telepon) ───────────────────────

export const MOCK_TELKOM = [
  {
    idpel: "555500000002",
    skenario: "Sukses — 1 tagihan",
  },
] as const;

// ── Pulsa (LUNASIN_MOCK=true, produk: pulsa-*) ───────────────────────────────

export const MOCK_PULSA = [
  {
    idpel: "081250000001",
    skenario: "Sukses — denom dari kode produk (misal pulsa-25000)",
  },
] as const;

// ── Skenario Error Lunasin (berlaku untuk semua produk) ──────────────────────

export const MOCK_LUNASIN_ERROR = [
  {
    idpel: "666600000002",
    skenario: "Inquiry error — IDPEL tidak dikenali (RC 1000)",
  },
  {
    idpel: "777700000002",
    skenario: "Inquiry sukses, payment ditolak biller (RC 0002)",
  },
  {
    idpel: "888800000002",
    skenario: "Payment pending (RC 0001) → advice sukses otomatis",
  },
] as const;
