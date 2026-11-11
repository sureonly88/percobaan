// Katalog produk versi mobile. Kode produk & endpoint sama dengan halaman /pembayaran
// desktop; nominal tetap divalidasi server lewat snapshot inquiry.

export type MobileProductKind =
  | "pdam"        // PDAM native → /api/pembayaran/inquiry
  | "lunasin"     // PLN/BPJS/Telkom → /api/pembayaran/lunasin/inquiry
  | "pln-token"   // PLN prabayar: perlu nominal (input2)
  | "pulsa"       // operator + nominal
  | "data"        // operator + paket
  | "pdam-kal";   // PDAM via Lunasin: pilih PDAM dulu

export interface MobileProduct {
  slug: string;
  label: string;
  shortLabel: string;
  icon: string;
  /** Kelas Tailwind untuk ikon/aksen produk */
  tone: string;
  kind: MobileProductKind;
  /** Kode produk Lunasin dasar (PLN tanpa tier — tier loket ditambahkan server) */
  baseCode?: string;
  inputLabel: string;
  inputPlaceholder: string;
  inputMode: "numeric" | "tel";
}

export const MOBILE_PRODUCTS: MobileProduct[] = [
  {
    slug: "pdam", label: "PDAM", shortLabel: "PDAM", icon: "water_drop",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    kind: "pdam", inputLabel: "ID Pelanggan PDAM", inputPlaceholder: "Contoh: 1111000123", inputMode: "numeric",
  },
  {
    slug: "pln-token", label: "PLN Token (Prabayar)", shortLabel: "Token PLN", icon: "bolt",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    kind: "pln-token", baseCode: "pln-prepaid", inputLabel: "No. Meter / ID Pelanggan", inputPlaceholder: "11–12 digit", inputMode: "numeric",
  },
  {
    slug: "pln-pasca", label: "PLN Pascabayar", shortLabel: "PLN Pasca", icon: "electric_meter",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    kind: "lunasin", baseCode: "pln-postpaid", inputLabel: "ID Pelanggan PLN", inputPlaceholder: "12 digit", inputMode: "numeric",
  },
  {
    slug: "pln-nonrek", label: "PLN Non-Rekening", shortLabel: "PLN Nonrek", icon: "receipt_long",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    kind: "lunasin", baseCode: "pln-nonrek", inputLabel: "Nomor Registrasi", inputPlaceholder: "13 digit", inputMode: "numeric",
  },
  {
    slug: "bpjs", label: "BPJS Kesehatan", shortLabel: "BPJS", icon: "health_and_safety",
    tone: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    kind: "lunasin", baseCode: "bpjs-kesehatan", inputLabel: "Nomor VA / Peserta BPJS", inputPlaceholder: "Contoh: 8888801234567890", inputMode: "numeric",
  },
  {
    slug: "telkom", label: "Telkom", shortLabel: "Telkom", icon: "call",
    tone: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    kind: "lunasin", baseCode: "telkom-telepon", inputLabel: "Nomor Telepon / IndiHome", inputPlaceholder: "Contoh: 0511xxxxxxx", inputMode: "numeric",
  },
  {
    slug: "pulsa", label: "Pulsa", shortLabel: "Pulsa", icon: "smartphone",
    tone: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    kind: "pulsa", inputLabel: "Nomor HP", inputPlaceholder: "08xxxxxxxxxx", inputMode: "tel",
  },
  {
    slug: "paket-data", label: "Paket Data", shortLabel: "Paket Data", icon: "wifi",
    tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    kind: "data", inputLabel: "Nomor HP", inputPlaceholder: "08xxxxxxxxxx", inputMode: "tel",
  },
  {
    slug: "pdam-lain", label: "PDAM Daerah Lain", shortLabel: "PDAM Lain", icon: "water",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    kind: "pdam-kal", inputLabel: "ID Pelanggan PDAM", inputPlaceholder: "Nomor pelanggan", inputMode: "numeric",
  },
];

export function findMobileProduct(slug: string): MobileProduct | undefined {
  return MOBILE_PRODUCTS.find((p) => p.slug === slug);
}

export const PLN_TOKEN_NOMINALS = [20000, 50000, 100000, 200000, 500000, 1000000];

/** Tebak operator dari awalan nomor HP (bisa diganti manual oleh agen). */
const OPERATOR_PREFIX: Record<string, string[]> = {
  telkomsel: ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"],
  indosat: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"],
  xl: ["0817", "0818", "0819", "0859", "0877", "0878"],
  axis: ["0831", "0832", "0833", "0838"],
  three: ["0895", "0896", "0897", "0898", "0899"],
  smartfren: ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"],
};

export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  return d;
}

export function guessOperator(phone: string): string | null {
  const p = normalizePhone(phone).slice(0, 4);
  if (p.length < 4) return null;
  for (const [op, prefixes] of Object.entries(OPERATOR_PREFIX)) {
    if (prefixes.includes(p)) return op;
  }
  return null;
}

export function lunasinServiceType(kodeProduk: string): string {
  if (kodeProduk.startsWith("pln-postpaid")) return "PLN_POSTPAID";
  if (kodeProduk.startsWith("pln-prepaid")) return "PLN_PREPAID";
  if (kodeProduk.startsWith("pln-nonrek")) return "PLN_NONREK";
  if (kodeProduk.startsWith("bpjs")) return "BPJS";
  if (kodeProduk.startsWith("telkom")) return "TELKOM";
  if (kodeProduk.startsWith("pulsa")) return "PULSA";
  if (kodeProduk.startsWith("paketdata")) return "PAKET_DATA";
  if (kodeProduk.startsWith("pdam")) return "PDAM_LUNASIN";
  return "LUNASIN_SERVICE";
}

export function formatRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "202611" → "Nov 2026"; selain format YYYYMM dikembalikan apa adanya. */
export function formatPeriode(raw: string): string {
  const s = String(raw || "").trim();
  if (/^\d{6}$/.test(s)) {
    const m = Number(s.slice(4, 6));
    if (m >= 1 && m <= 12) return `${BULAN[m - 1]} ${s.slice(0, 4)}`;
  }
  return s;
}

/** Ikon & warna per service_type multipay (untuk daftar riwayat). */
export function serviceVisual(serviceType: string | null | undefined): { icon: string; tone: string } {
  const slugByService: Record<string, string> = {
    PDAM_NATIVE: "pdam",
    PLN_PREPAID: "pln-token",
    PLN_POSTPAID: "pln-pasca",
    PLN_NONREK: "pln-nonrek",
    BPJS: "bpjs",
    TELKOM: "telkom",
    PULSA: "pulsa",
    PAKET_DATA: "paket-data",
    PDAM_LUNASIN: "pdam-lain",
  };
  const p = findMobileProduct(slugByService[String(serviceType || "")] || "");
  return p ? { icon: p.icon, tone: p.tone } : { icon: "receipt_long", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

/** Tanggal lokal YYYY-MM-DD (bukan UTC) untuk parameter filter API. */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
