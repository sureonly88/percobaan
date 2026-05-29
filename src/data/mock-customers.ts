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
// Prefix resmi Lunasin: 5410XXXXXXXX (1 bln), 5420XXXXXXXX (2 bln),
//                       5430XXXXXXXX (3 bln), 5440XXXXXXXX (4 bln)

export const MOCK_PLN_POSTPAID = [
  // ── Sukses
  { idpel: "541000000001", skenario: "Sukses — 1 bulan tagihan, R1M/900VA" },
  { idpel: "542000000001", skenario: "Sukses — 2 bulan tunggakan, R1M/900VA" },
  { idpel: "543000000001", skenario: "Sukses — 3 bulan tunggakan, R1M/900VA" },
  { idpel: "544000000001", skenario: "Sukses — 4 bulan tunggakan, R1M/900VA" },
  // ── Error (ID resmi Lunasin — doc.lunasin.co.id Data Testing)
  { idpel: "540100000000", skenario: "Inquiry error — IDPEL telah lunas (RC 1001)" },
  { idpel: "540200000000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "540300000000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── PLN Prabayar / Token (LUNASIN_MOCK=true, produk: pln-prepaid-XXXXX) ──────
// Prefix resmi Lunasin: 5210XXXXXXXX atau 3210XXXXXXX
// input2 diisi nominal pembelian (mis. "50000")

export const MOCK_PLN_PREPAID = [
  // ── Sukses
  { idpel: "521000000001", skenario: "Sukses — token 20 digit dihasilkan, R1M/1300VA, nominal dari kode produk" },
  // ── Error (ID resmi Lunasin)
  { idpel: "530200000000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002) — nominal 50K" },
  { idpel: "530300000000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis — nominal 50K" },
  { idpel: "32020000000",  skenario: "Inquiry sukses, payment ditolak biller (RC 0002) — format 11 digit" },
  { idpel: "32030000000",  skenario: "Payment timeout (RC 0003) → advice sukses — format 11 digit" },
] as const;

// ── PLN Non-Rekening (LUNASIN_MOCK=true, produk: pln-nonrek-3000) ────────────
// Prefix resmi Lunasin: 1710XXXXXXXXX (13 digit)

export const MOCK_PLN_NONREK = [
  // ── Sukses
  { idpel: "1710000000001", skenario: "Sukses — pembayaran non-rekening PLN" },
  // ── Error (ID resmi Lunasin)
  { idpel: "1701000000000", skenario: "Inquiry error — IDPEL telah lunas (RC 1001)" },
  { idpel: "1702000000000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "1703000000000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── BPJS Kesehatan (LUNASIN_MOCK=true, produk: bpjs-kesehatan) ───────────────
// Prefix resmi Lunasin: 88888010XXXXXXXX (16 digit)
// input2 diisi periode bulan

export const MOCK_BPJS = [
  // ── Sukses
  { idpel: "8888801000000001", skenario: "Sukses — 4 peserta, cabang Banjarmasin" },
  // ── Error (ID resmi Lunasin)
  { idpel: "8888800100000000", skenario: "Inquiry error — IDPEL telah lunas (RC 1001)" },
  { idpel: "8888800200000000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "8888800300000000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── Telkom (LUNASIN_MOCK=true, produk: telkom-telepon) ───────────────────────
// Prefix resmi Lunasin: 0211XXXXXXX (11 digit)

export const MOCK_TELKOM = [
  // ── Sukses
  { idpel: "02110000000", skenario: "Sukses — 1 tagihan" },
  // ── Error (ID resmi Lunasin)
  { idpel: "02101000000", skenario: "Inquiry error — IDPEL telah lunas (RC 1001)" },
  { idpel: "02102000000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "02103000000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── Pulsa (LUNASIN_MOCK=true, produk: pulsa-*) ───────────────────────────────
// Prefix resmi Lunasin: 0813XXXXXXXX
// Kode produk menentukan nominal, mis. pulsa-telkomsel-50K

export const MOCK_PULSA = [
  // ── Sukses
  { idpel: "081321010000", skenario: "Sukses — denom dari kode produk (misal pulsa-telkomsel-50K)" },
  // ── Error (ID resmi Lunasin)
  { idpel: "081321002000", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "081321003000", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── PDAM via Lunasin (LUNASIN_MOCK=true, produk: pdam-kota-banjarmasin) ──────
// Test IDPEL resmi Lunasin: doc.lunasin.co.id → Data Testing → pdam-kota-banjarmasin
// Catatan: 1022200 adalah custom extension (2 bulan), tidak ada di docs resmi

export const MOCK_PDAM_LUNASIN = [
  // ── Sukses (resmi Lunasin)
  { idpel: "1022100", skenario: "Sukses — 1 bulan tagihan (official Lunasin test ID)" },
  // ── Sukses (custom extension — tidak ada di docs Lunasin)
  { idpel: "1022200", skenario: "Sukses — 2 bulan tunggakan (custom, bukan ID resmi Lunasin)" },
  // ── Error (ID resmi Lunasin)
  { idpel: "1022010", skenario: "Inquiry error — IDPEL telah lunas (RC 1001)" },
  { idpel: "1022020", skenario: "Inquiry sukses, payment ditolak biller (RC 0002)" },
  { idpel: "1022030", skenario: "Payment timeout (RC 0003) → advice sukses otomatis" },
] as const;

// ── Skenario Error Lunasin — ID Resmi (per produk, lihat di atas) ────────────
// RC 1000 = IDPEL tidak dikenali
// RC 1001 = Tagihan telah lunas
// RC 0002 = Transaksi gagal / ditolak biller
// RC 0003 = Timeout / Pending (gunakan advice untuk cek status)
//
// Gunakan ID error per-produk di atas (MOCK_PLN_POSTPAID, MOCK_BPJS, dst)
// untuk testing yang akurat sesuai dokumentasi Lunasin.
//
// ── Custom Internal Patterns (prefix-based, bukan ID resmi Lunasin) ──────────
// Pattern ini dikenali oleh detectScenario untuk semua produk:
//   6666xxxxxxxx → Inquiry error (RC 1000)
//   7777xxxxxxxx → Payment error (RC 0002)
//   8888xxxxxxxx → Payment pending (RC 0003)

export const MOCK_LUNASIN_ERROR = [
  // Custom patterns (berlaku untuk semua produk tanpa memandang kode produk)
  { idpel: "666600000001", skenario: "Inquiry error — IDPEL tidak dikenali (RC 1000) [custom pattern]" },
  { idpel: "777700000001", skenario: "Inquiry sukses, payment ditolak biller (RC 0002) [custom pattern]" },
  { idpel: "888800000001", skenario: "Payment timeout (RC 0003) → advice sukses otomatis [custom pattern]" },
  // Official PLN Postpaid error IDs (untuk cross-check)
  { idpel: "540100000000", skenario: "PLN Postpaid — IDPEL telah lunas (RC 1001) [official]" },
  { idpel: "540200000000", skenario: "PLN Postpaid — payment ditolak biller (RC 0002) [official]" },
  { idpel: "540300000000", skenario: "PLN Postpaid — payment timeout (RC 0003) [official]" },
] as const;
