// Struk digital versi mobile: dibagikan ke WhatsApp (teks) atau diunduh/dibagikan sebagai
// gambar PNG. Ini format ketiga di samping print-bridge/formatter.js (ESC/P continuous form)
// dan lib/print-receipt.ts (cetak browser) — agen keliling tidak membawa printer.
import { formatPeriode, formatRp } from "./products";

export type ReceiptItemStatus = "SUCCESS" | "PENDING" | "FAILED";

export interface ShareReceiptItem {
  productLabel: string;
  customerId: string;
  customerName: string;
  periode?: string;
  amount: number;
  admin: number;
  total: number;
  status: ReceiptItemStatus;
  transactionCode?: string;
  /** Baris tambahan (Tarif/Daya, kWh, SN, dst.) */
  extras: Array<[string, string]>;
  /** Token PLN prabayar (sudah diformat xxxx-xxxx-…) */
  token?: string;
}

export interface ShareReceipt {
  loketName: string;
  loketCode: string;
  kasir: string;
  paidAt: string; // ISO
  referenceCode: string;
  items: ShareReceiptItem[];
  grandTotal: number;
  paidAmount: number;
  change: number;
}

/** Ambil detail yang relevan dari providerData hasil bayar. */
export function extrasFromProviderData(
  serviceType: string,
  pd: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
): { extras: Array<[string, string]>; token?: string; periode?: string } {
  const p = pd || {};
  const m = metadata || {};
  const s = (v: unknown) => (v == null ? "" : String(v).trim());
  const extras: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    const val = s(v);
    if (val) extras.push([label, val]);
  };
  let token: string | undefined;
  let periode: string | undefined;

  switch (serviceType) {
    case "PLN_PREPAID": {
      push("No. Meter", p.nometer);
      const tarif = [s(p.tarif), s(p.daya)].filter(Boolean).join("/");
      if (tarif) extras.push(["Tarif/Daya", tarif]);
      push("kWh", p.kwh);
      const raw = s(p.token).replace(/\D/g, "");
      if (raw) token = raw.match(/.{1,4}/g)?.join("-") ?? raw;
      break;
    }
    case "PLN_POSTPAID": {
      const tarif = [s(p.tarif || m.tarif), s(p.daya || m.daya)].filter(Boolean).join("/");
      if (tarif) extras.push(["Tarif/Daya", tarif]);
      push("Stand Meter", p.stand_meter || m.standMeter);
      periode = s(p.periode || m.periode);
      break;
    }
    case "PLN_NONREK":
      push("No. Registrasi", p.noreg || m.noreg);
      push("Jenis", p.jenis_reg || m.jenis_reg);
      break;
    case "BPJS":
      push("Jml Peserta", p.jum_peserta);
      if (s(p.jum_bill || m.jumBill)) extras.push(["Jml Bulan", `${s(p.jum_bill || m.jumBill)} bulan`]);
      break;
    case "TELKOM":
      periode = s(p.periode || m.periode);
      break;
    case "PULSA":
    case "PAKET_DATA":
      push("Produk", p.nama_produk);
      push("SN", p.serial_number);
      break;
    case "PDAM_LUNASIN":
      push("PDAM", p.nama_pdam);
      periode = s(p.periode || m.periode);
      break;
    case "PDAM_NATIVE": {
      periode = s(m.blth);
      const lalu = Number(m.standLalu || 0);
      const kini = Number(m.standKini || 0);
      if (lalu || kini) extras.push(["Stand Meter", `${lalu} - ${kini}`]);
      push("Golongan", m.gol);
      break;
    }
  }
  push("Ref", p.refnum_lunasin || p.refnum);
  return { extras, token, periode };
}

/** Periode Lunasin bisa "202610202611" (gabungan) atau "202610,202611". */
function formatPeriodeList(raw: string): string {
  const s = raw.replace(/\s/g, "");
  if (/^(\d{6})+$/.test(s) && s.length > 6) return (s.match(/\d{6}/g) || []).map(formatPeriode).join(", ");
  if (s.includes(",")) return s.split(",").filter(Boolean).map(formatPeriode).join(", ");
  return formatPeriode(s);
}

function fmtTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<ReceiptItemStatus, string> = {
  SUCCESS: "LUNAS",
  PENDING: "SEDANG DIPROSES",
  FAILED: "GAGAL",
};

type Line =
  | { t: "title"; text: string }
  | { t: "center"; text: string }
  | { t: "kv"; k: string; v: string; bold?: boolean }
  | { t: "rule" }
  | { t: "big"; text: string }
  | { t: "gap" };

function buildLines(r: ShareReceipt): Line[] {
  const lines: Line[] = [
    { t: "title", text: "STRUK PEMBAYARAN" },
    { t: "center", text: r.loketName || r.loketCode },
    { t: "rule" },
    { t: "kv", k: "Tanggal", v: fmtTanggal(r.paidAt) },
    { t: "kv", k: "No. Ref", v: r.referenceCode },
    { t: "kv", k: "Petugas", v: r.kasir },
    { t: "rule" },
  ];
  r.items.forEach((it, i) => {
    if (i > 0) lines.push({ t: "gap" });
    lines.push({ t: "center", text: it.productLabel.toUpperCase() });
    lines.push({ t: "kv", k: "ID Pel", v: it.customerId });
    if (it.customerName) lines.push({ t: "kv", k: "Nama", v: it.customerName });
    if (it.periode) lines.push({ t: "kv", k: "Periode", v: formatPeriodeList(it.periode) });
    for (const [k, v] of it.extras) lines.push({ t: "kv", k, v });
    lines.push({ t: "kv", k: "Tagihan", v: formatRp(it.amount) });
    if (it.admin) lines.push({ t: "kv", k: "Admin", v: formatRp(it.admin) });
    lines.push({ t: "kv", k: "Total", v: formatRp(it.total), bold: true });
    lines.push({ t: "kv", k: "Status", v: STATUS_LABEL[it.status], bold: true });
    if (it.transactionCode) lines.push({ t: "kv", k: "No. Trx", v: it.transactionCode });
    if (it.token) {
      lines.push({ t: "center", text: "TOKEN PLN" });
      lines.push({ t: "big", text: it.token });
    }
  });
  lines.push({ t: "rule" });
  lines.push({ t: "kv", k: "TOTAL BAYAR", v: formatRp(r.grandTotal), bold: true });
  if (r.paidAmount > r.grandTotal) {
    lines.push({ t: "kv", k: "Tunai", v: formatRp(r.paidAmount) });
    lines.push({ t: "kv", k: "Kembali", v: formatRp(r.change) });
  }
  lines.push({ t: "rule" });
  lines.push({ t: "center", text: "Simpan struk ini sebagai bukti" });
  lines.push({ t: "center", text: "pembayaran yang sah. Terima kasih." });
  return lines;
}

/** Teks untuk WhatsApp (memakai *tebal* dan ``` monospace ``` untuk token). */
export function buildReceiptText(r: ShareReceipt): string {
  const out: string[] = [];
  for (const l of buildLines(r)) {
    switch (l.t) {
      case "title": out.push(`*${l.text}*`); break;
      case "center": out.push(l.text); break;
      case "kv": out.push(l.bold ? `*${l.k}: ${l.v}*` : `${l.k}: ${l.v}`); break;
      case "rule": out.push("------------------------------"); break;
      case "big": out.push("```" + l.text + "```"); break;
      case "gap": out.push(""); break;
    }
  }
  return out.join("\n");
}

/** Gambar struk (PNG) — lebar 576px seperti kertas thermal 72 mm. */
export async function buildReceiptImage(r: ShareReceipt): Promise<Blob> {
  const W = 576;
  const PAD = 28;
  const lines = buildLines(r);
  const font = (size: number, bold = false) => `${bold ? "700" : "400"} ${size}px ui-monospace, Menlo, Consolas, monospace`;
  const heights: Record<Line["t"], number> = { title: 40, center: 28, kv: 28, rule: 22, big: 44, gap: 14 };
  const H = PAD * 2 + lines.reduce((s, l) => s + heights[l.t], 0);

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "middle";

  let y = PAD;
  for (const l of lines) {
    const h = heights[l.t];
    const mid = y + h / 2;
    if (l.t === "title" || l.t === "center" || l.t === "big") {
      ctx.font = l.t === "title" ? font(26, true) : l.t === "big" ? font(28, true) : font(19);
      ctx.textAlign = "center";
      ctx.fillText(l.text, W / 2, mid, W - PAD * 2);
    } else if (l.t === "kv") {
      ctx.font = font(19, l.bold);
      ctx.textAlign = "left";
      ctx.fillText(l.k, PAD, mid);
      ctx.textAlign = "right";
      ctx.fillText(l.v, W - PAD, mid, W - PAD * 2 - 150);
    } else if (l.t === "rule") {
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD, mid);
      ctx.lineTo(W - PAD, mid);
      ctx.stroke();
    }
    y += h;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar"))), "image/png")
  );
}

/** Nomor HP → format wa.me (62…). Kosong bila tidak valid. */
export function toWaNumber(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (d.startsWith("8")) d = "62" + d;
  return /^62\d{8,13}$/.test(d) ? d : "";
}

const SERVICE_LABEL: Record<string, string> = {
  PDAM_NATIVE: "PDAM",
  PLN_PREPAID: "PLN Token (Prabayar)",
  PLN_POSTPAID: "PLN Pascabayar",
  PLN_NONREK: "PLN Non-Rekening",
  BPJS: "BPJS Kesehatan",
  TELKOM: "Telkom",
  PULSA: "Pulsa",
  PAKET_DATA: "Paket Data",
  PDAM_LUNASIN: "PDAM",
};

export function serviceLabel(serviceType: string | null | undefined): string {
  return SERVICE_LABEL[String(serviceType || "")] || "Pembayaran";
}

export interface ReceiptSourceItem {
  serviceType: string;
  provider: string;
  customerId: string;
  customerName?: string | null;
  periodLabel?: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
  transactionCode?: string | null;
  providerData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Susun struk dari item multipay. Hanya item berstatus SUCCESS yang dimasukkan —
 * tagihan yang masih diproses tidak boleh diberikan ke pelanggan sebagai bukti bayar.
 * Mengembalikan null bila tidak ada item yang lunas.
 */
export function buildShareReceipt(input: {
  loketName: string;
  loketCode: string;
  kasir: string;
  paidAt: string;
  referenceCode: string;
  paidAmount: number;
  items: ReceiptSourceItem[];
}): ShareReceipt | null {
  const ok = input.items.filter((i) => i.status === "SUCCESS");
  if (ok.length === 0) return null;
  const items: ShareReceiptItem[] = ok.map((i) => {
    const ex = extrasFromProviderData(i.serviceType, i.providerData || undefined, i.metadata || undefined);
    return {
      productLabel: serviceLabel(i.serviceType),
      customerId: i.customerId,
      customerName: i.customerName || "",
      periode: ex.periode || (i.provider === "PDAM" ? i.periodLabel || undefined : undefined),
      amount: i.amount,
      admin: i.adminFee,
      total: i.total,
      status: "SUCCESS",
      transactionCode: i.transactionCode || undefined,
      extras: ex.extras,
      token: ex.token,
    };
  });
  const grandTotal = items.reduce((s, i) => s + i.total, 0);
  // Tunai/kembalian hanya bermakna bila seluruh tagihan dalam transaksi lunas
  const paidAmount = ok.length === input.items.length ? input.paidAmount : grandTotal;
  return {
    loketName: input.loketName,
    loketCode: input.loketCode,
    kasir: input.kasir,
    paidAt: input.paidAt,
    referenceCode: input.referenceCode,
    items,
    grandTotal,
    paidAmount,
    change: Math.max(0, paidAmount - grandTotal),
  };
}
