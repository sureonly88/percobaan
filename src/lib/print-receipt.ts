/**
 * Thermal-style PDAM receipt printer utility.
 * Opens a new window with receipt HTML optimized for 58mm/80mm thermal printers
 * and triggers print dialog.
 */

export interface ReceiptBillItem {
  idpel: string;
  nama: string;
  alamat?: string;
  gol?: string;
  periode: string;
  standLalu?: number;
  standKini?: number;
  pemakaian?: number;
  hargaAir?: number;
  denda?: number;
  materai?: number;
  limbah?: number;
  retribusi?: number;
  bebanTetap?: number;
  biayaMeter?: number;
  diskon?: number;
  tagihan: number;
  admin: number;
  total: number;
  transactionCode?: string;
  // PLN-specific fields
  type?: "pdam" | "pln";
  kodeProduk?: string;
  tarif?: string;
  daya?: string;
  standMeter?: string;
  jumBill?: string;
  tokenPln?: string;
  refnumLunasin?: string;
  noMeter?: string;
  rpAmount?: number;
  rpAdmin?: number;
  // Additional Lunasin detail fields
  kwh?: string;
  rpMaterai?: number;
  rpPpn?: number;
  rpPju?: number;
  rpAngsuran?: number;
  rpToken?: number;
  rpTotal?: number;
  saldoTerpotong?: number;
  refnum?: string;
  tglLunas?: string;
  pesanBiller?: string;
  // PLN Non-Rekening specific
  noreg?: string;
  tglReg?: string;
  jenisReg?: string;
  // PDAM Lunasin-specific (via Lunasin API — berbeda dari field PDAM lama)
  namaPdam?: string;
  meterAwal?: number;   // meter_awal per periode
  meterAkhir?: number;  // meter_akhir per periode
  rpAir?: number;
  rpDanameter?: number;
  rpSampah?: number;
  rpAdministrasi?: number;
  extraBillFields?: Array<{ label: string; value: string }>; // nama_field_1 dll
  // BPJS-specific
  nova?: string;
  novaKepalaKeluarga?: string;
  jumPeserta?: string;
  kodeCabang?: string;
  namaCabang?: string;
  sisaSaldoBpjs?: string;
  // Pulsa & Paket Data specific
  nomor?: string;
  denom?: string;
  namaProduk?: string;
  serialNumber?: string;
  masaBerlaku?: string;
}

export interface ReceiptPrintData {
  loketName: string;
  loketCode: string;
  kasir: string;
  tanggal: string;
  bills: ReceiptBillItem[];
  totalTagihan: number;
  totalAdmin: number;
  totalBayar: number;
  tunai: number;
  kembalian: number;
  /** Tandai cetak ulang. Akan menambahkan watermark "COPY" di struk. */
  isCopy?: boolean;
  /** Nomor urut cetak ulang (1 = cetakan pertama, 2 = cetak ulang ke-2, dst). */
  copyNumber?: number;
  /** Username operator yang melakukan cetak ulang. */
  copyBy?: string;
  /** Timestamp ISO ketika cetak ulang dilakukan. */
  copyAt?: string;
  /** URL publik untuk validasi struk digital, biasanya /r/[receiptToken]. */
  digitalReceiptUrl?: string;
}

function fmtRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtTanggal(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function fmtPeriode(thbln: string): string {
  if (!thbln || thbln.length < 6) return thbln || "-";
  const year = thbln.substring(0, 4);
  const month = parseInt(thbln.substring(4, 6), 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${months[month - 1] || thbln.substring(4, 6)} ${year}`;
}

function fmtTglReg(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd || "-";
  const year  = yyyymmdd.substring(0, 4);
  const month = parseInt(yyyymmdd.substring(4, 6), 10);
  const day   = yyyymmdd.substring(6, 8);
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${day} ${months[month - 1] ?? yyyymmdd.substring(4, 6)} ${year}`;
}

/** Format a comma-separated list of YYYYMM periods, e.g. "201107,201106,201105" → "Jul 2011, Jun 2011, Mei 2011" */
function fmtPeriodeList(periodeStr: string): string {
  if (!periodeStr) return "-";
  return periodeStr.split(",").map((p) => fmtPeriode(p.trim())).join(", ");
}

function getProdukLabel(kodeProduk: string): string {
  if (kodeProduk.startsWith("pln-postpaid")) return "PLN Pascabayar";
  if (kodeProduk.startsWith("pln-prepaid")) return "PLN Prabayar (Token)";
  if (kodeProduk.startsWith("pln-nonrek")) return "PLN Non-Rekening";
  if (kodeProduk.startsWith("bpjs")) return "BPJS Kesehatan";
  if (kodeProduk.startsWith("telkom")) return "Telkom Telepon";
  if (kodeProduk.startsWith("pulsa")) return "Pulsa";
  if (kodeProduk.startsWith("paketdata")) return "Paket Data";
  if (kodeProduk.startsWith("pdam")) return "PDAM";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-text 80-column receipt formatter
// Used for HTML fallback and as payload for the ESC/P print bridge
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRINT_BRIDGE_URL = "https://localhost:6789";
const LS_KEY_BRIDGE_URL = "print_bridge_url";

function getPrintBridgeUrl(): string {
  try {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_KEY_BRIDGE_URL) || DEFAULT_PRINT_BRIDGE_URL;
    }
  } catch { /* ignore */ }
  return DEFAULT_PRINT_BRIDGE_URL;
}
const COLS = 80;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format one 40-char detail column: "    Label        :  value              " */
function detailCell(label: string, value: string): string {
  const INDENT = 4, LABEL_W = 12, SEP = " : ";
  const VAL_W = 40 - INDENT - LABEL_W - SEP.length; // = 21
  return " ".repeat(INDENT) + label.substring(0, LABEL_W).padEnd(LABEL_W) + SEP + value.substring(0, VAL_W).padEnd(VAL_W);
}

/** Right-align `right` against `left` to fill exactly COLS characters */
function r2c(left: string, right: string): string {
  const gap = COLS - left.length - right.length;
  if (gap < 1) return left.substring(0, COLS - right.length - 1) + " " + right;
  return left + " ".repeat(gap) + right;
}

function wrapText(text: string, width: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += width) chunks.push(text.slice(i, i + width));
  return chunks.length ? chunks : [""];
}

/**
 * Formats a ReceiptPrintData into an 80-column plain-text string.
 * Suitable for: <pre> HTML fallback, and as input to the ESC/P print bridge.
 */
export function formatReceiptPlainText(data: ReceiptPrintData): string {
  const HEAVY = "=".repeat(COLS);
  const LIGHT = "-".repeat(COLS);
  const lines: string[] = [];

  function push(s: string) { lines.push(s); }
  function pushCtr(text: string) {
    const pad = Math.max(0, Math.floor((COLS - text.length) / 2));
    lines.push(" ".repeat(pad) + text);
  }
  function pushC2(left: string, right: string) { lines.push(r2c(left, right)); }

  push(HEAVY);
  if (data.isCopy) {
    const tag = data.copyNumber && data.copyNumber > 1
      ? `*** COPY #${data.copyNumber} — BUKAN STRUK ASLI ***`
      : `*** COPY — BUKAN STRUK ASLI ***`;
    pushCtr(tag);
    if (data.copyBy || data.copyAt) {
      const meta = [
        data.copyBy ? `Dicetak ulang oleh: ${data.copyBy}` : "",
        data.copyAt ? fmtTanggal(data.copyAt) : "",
      ].filter(Boolean).join("  •  ");
      pushCtr(meta);
    }
    push(HEAVY);
  }
  pushCtr("PEDAMI PAYMENT");
  pushCtr("Layanan Pembayaran Multi-Produk");
  push(HEAVY);
  pushC2("Loket   : " + data.loketCode + " " + data.loketName, "Kasir : " + data.kasir);
  push("Tanggal : " + fmtTanggal(data.tanggal));
  push(LIGHT);

  data.bills.forEach((b, idx) => {
    const isPln = b.type === "pln";
    const isPdamLunasin = isPln && (b.kodeProduk?.startsWith("pdam") ?? false);

    push(`[${idx + 1}] ${b.nama}`);
    let idLine = `    ID   : ${b.idpel}`;
    if (isPdamLunasin && b.periode) idLine += "  Periode : " + fmtPeriode(b.periode);
    else if (!isPln && b.periode) idLine += "  Periode : " + fmtPeriode(b.periode);
    push(idLine);
    if (b.namaPdam) push("    PDAM  : " + b.namaPdam);
    if (!isPdamLunasin && b.alamat) push("    Alamat: " + b.alamat.substring(0, COLS - 12));
    if (b.transactionCode) push("    Kode  : " + b.transactionCode);

    const pairs: [string, string][] = [];
    if (isPln) {
      const prod = getProdukLabel(b.kodeProduk || "");
      const isNonrek = b.kodeProduk?.startsWith("pln-nonrek");
      const isBpjs   = b.kodeProduk?.startsWith("bpjs");
      const isTelkom = b.kodeProduk?.startsWith("telkom");
      const isPulsa  = b.kodeProduk?.startsWith("pulsa") || b.kodeProduk?.startsWith("paketdata");
      if (isPdamLunasin) {
        // ── PDAM via Lunasin API ─────────────────────────────────────────────
        if (b.alamat)   pairs.push(["Alamat", b.alamat.substring(0, 21)]);
        if (b.gol)      pairs.push(["Golongan", b.gol]);
        if (b.meterAwal != null && b.meterAkhir != null) {
          pairs.push(["Stand Meter", `${b.meterAwal} -> ${b.meterAkhir}`]);
          pairs.push(["Pemakaian", `${(b.meterAkhir - b.meterAwal).toLocaleString("id-ID")} m3`]);
        } else if (b.standMeter) {
          pairs.push(["Stand Meter", b.standMeter]);
        }
        // Komponen tagihan — tampilkan semua meski nilainya 0
        pairs.push(["Rek. Air",     fmtRp(b.rpAir          ?? 0)]);
        pairs.push(["Dana Meter",   fmtRp(b.rpDanameter    ?? 0)]);
        pairs.push(["Ret. Sampah",  fmtRp(b.rpSampah       ?? 0)]);
        pairs.push(["Administrasi", fmtRp(b.rpAdministrasi ?? 0)]);
        pairs.push(["Materai",      fmtRp(b.materai        ?? 0)]);
        pairs.push(["Denda",        fmtRp(b.denda          ?? 0)]);
        if (b.extraBillFields) {
          for (const ef of b.extraBillFields) pairs.push([ef.label.substring(0, 12), ef.value]);
        }
        if (b.refnumLunasin) pairs.push(["Ref Lunasin", b.refnumLunasin]);
        if (b.tglLunas)      pairs.push(["Tgl Lunas",   fmtTanggal(b.tglLunas)]);
      } else if (!isPdamLunasin && prod) {
        pairs.push(["Produk", b.namaProduk || prod]);
      }
      if (!isPdamLunasin && isBpjs) {
        if (b.nova)                                                 pairs.push(["No VA",        b.nova]);
        if (b.novaKepalaKeluarga && b.novaKepalaKeluarga !== b.nova) pairs.push(["VA Kepala Kel", b.novaKepalaKeluarga]);
        if (b.jumPeserta)   pairs.push(["Jml Peserta",  b.jumPeserta + " orang"]);
        if (b.namaCabang)   pairs.push(["Cabang",       b.namaCabang]);
        if (b.periode)      pairs.push(["Periode",      b.periode + " Bulan"]);
        if (b.refnum)       pairs.push(["Ref Biller",   b.refnum]);
        if (b.tglLunas)     pairs.push(["Tgl Lunas",    fmtTanggal(b.tglLunas)]);
        if (b.pesanBiller)  pairs.push(["Info",         b.pesanBiller.substring(0, 60)]);
        if ((b.rpAmount ?? b.tagihan) > 0) pairs.push(["Tagihan",      fmtRp(b.rpAmount ?? b.tagihan)]);
        if (b.admin > 0)     pairs.push(["Biaya Admin",   fmtRp(b.admin)]);
      } else if (!isPdamLunasin && isNonrek) {
        if (b.noreg)    pairs.push(["No Registrasi", b.noreg]);
        if (b.tglReg)   pairs.push(["Tgl Registrasi", fmtTglReg(b.tglReg)]);
        if (b.jenisReg) pairs.push(["Jenis Reg", b.jenisReg]);
      } else if (!isPdamLunasin && isTelkom) {
        const jum = Number(b.jumBill || 1);
        if (jum > 1) pairs.push(["Jml Tagihan", String(jum) + " bulan"]);
        if (b.periode) pairs.push(["Periode", fmtPeriodeList(b.periode)]);
        if (b.refnum)  pairs.push(["Ref Biller", b.refnum]);
        if (b.tglLunas) pairs.push(["Tgl Lunas", fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin) pairs.push(["Ref Lunasin", b.refnumLunasin]);
        if ((b.rpAmount ?? b.tagihan) > 0) pairs.push(["Tagihan",     fmtRp(b.rpAmount ?? b.tagihan)]);
        if (b.admin > 0)      pairs.push(["Biaya Admin",  fmtRp(b.admin)]);
      } else if (!isPdamLunasin && isPulsa) {
        if (b.nomor)             pairs.push(["No. HP",       b.nomor]);
        if (b.denom)             pairs.push(["Denominasi",   "Rp " + Number(b.denom).toLocaleString("id-ID")]);
        if (b.serialNumber)      pairs.push(["Serial No",    b.serialNumber]);
        if (b.masaBerlaku)       pairs.push(["Masa Berlaku", b.masaBerlaku]);
        if (b.tglLunas)          pairs.push(["Tgl Lunas",    fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin)     pairs.push(["Ref Lunasin",  b.refnumLunasin]);
        if ((b.rpAmount ?? b.tagihan) > 0) pairs.push(["Tagihan",      fmtRp(b.rpAmount ?? b.tagihan)]);
        if (b.admin > 0)         pairs.push(["Biaya Admin",  fmtRp(b.admin)]);
      } else if (!isPdamLunasin) {
        if (b.tarif || b.daya) pairs.push(["Tarif/Daya", `${b.tarif ?? ""}${b.daya ? "/" + b.daya + " VA" : ""}`]);
        if (b.noMeter) pairs.push(["No Meter", b.noMeter]);
        if (b.standMeter) pairs.push(["Stand Meter", b.standMeter]);
        if (b.jumBill && b.jumBill !== "1" && b.jumBill !== "0") pairs.push(["Jml Tagihan", b.jumBill]);
        if (b.periode && !b.kodeProduk?.startsWith("pln-prepaid")) pairs.push(["Periode", fmtPeriode(b.periode)]);
      }
      if (!isPdamLunasin && !isBpjs && !isTelkom && !isPulsa) {
        if ((b.rpAmount ?? 0) > 0) pairs.push(["Tagihan", fmtRp(b.rpAmount!)]);
        if ((b.rpAdmin ?? 0) > 0) pairs.push(["Admin", fmtRp(b.rpAdmin!)]);
      }
      if (!isPdamLunasin && !isBpjs && !isPulsa) {
        if (b.refnumLunasin) pairs.push(["Ref Lunasin", b.refnumLunasin]);
        if (b.kwh) pairs.push(["kWh", b.kwh]);
        if ((b.rpMaterai ?? 0) > 0) pairs.push(["Materai", fmtRp(b.rpMaterai!)]);
        if ((b.rpPpn ?? 0) > 0) pairs.push(["PPN", fmtRp(b.rpPpn!)]);
        if ((b.rpPju ?? 0) > 0) pairs.push(["PPJ", fmtRp(b.rpPju!)]);
        if ((b.rpAngsuran ?? 0) > 0) pairs.push(["Angsuran", fmtRp(b.rpAngsuran!)]);
        if ((b.rpToken ?? 0) > 0) pairs.push(["Nilai Token", fmtRp(b.rpToken!)]);
        if ((b.rpTotal ?? 0) > 0) pairs.push(["Total", fmtRp(b.rpTotal!)]);
      }
      if (!isPdamLunasin && !isBpjs && !isTelkom && !isPulsa) {
        if (b.refnum) pairs.push(["Ref Number", b.refnum]);
        if (b.tglLunas) pairs.push(["Tgl Lunas", b.tglLunas]);
        if (b.pesanBiller) pairs.push(["Pesan Biller", b.pesanBiller.substring(0, 21)]);
      }
    } else {
      {
        // ── PDAM lama (pedami) ───────────────────────────────────────────────
        const pemakaian = b.pemakaian ?? ((b.standKini ?? 0) - (b.standLalu ?? 0));
        pairs.push(["Golongan",   b.gol || "-"]);
        pairs.push(["Stand Meter", `${b.standLalu ?? 0} -> ${b.standKini ?? 0}`]);
        pairs.push(["Pemakaian",  `${pemakaian.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m3`]);
        pairs.push(["Harga Air",  fmtRp(b.hargaAir  ?? 0)]);
        pairs.push(["Beban Tetap",fmtRp(b.bebanTetap ?? 0)]);
        pairs.push(["Biaya Meter",fmtRp(b.biayaMeter ?? 0)]);
        pairs.push(["Limbah",     fmtRp(b.limbah     ?? 0)]);
        pairs.push(["Retribusi",  fmtRp(b.retribusi  ?? 0)]);
        pairs.push(["Denda",      fmtRp(b.denda      ?? 0)]);
        pairs.push(["Materai",    fmtRp(b.materai    ?? 0)]);
        pairs.push(["Diskon",     `- ${fmtRp(b.diskon ?? 0)}`]);
      }
    }

    for (let j = 0; j < pairs.length; j += 2) {
      const c1 = detailCell(pairs[j][0], pairs[j][1]);
      const c2 = j + 1 < pairs.length ? detailCell(pairs[j + 1][0], pairs[j + 1][1]) : " ".repeat(40);
      push(c1 + c2);
    }

    if (isPln && b.tokenPln) {
      const tokenFmt = b.tokenPln.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1-");
      push(LIGHT);
      pushCtr("TOKEN PLN");
      pushCtr(tokenFmt);
      push(LIGHT);
    }

    if (!isPln) {
      pushC2("  Tagihan", fmtRp(b.tagihan));
      pushC2("  Admin  ", fmtRp(b.admin));
    } else if (isPdamLunasin) {
      if ((b.admin ?? 0) > 0) pushC2("  Biaya Admin", fmtRp(b.admin));
    }
    pushC2("  SUBTOTAL", fmtRp(b.total));

    if (idx < data.bills.length - 1) push(LIGHT);
  });

  if (data.digitalReceiptUrl) {
    push(LIGHT);
    pushCtr("VALIDASI STRUK DIGITAL");
    pushCtr("Scan QR atau buka URL berikut:");
    for (const line of wrapText(data.digitalReceiptUrl, COLS)) pushCtr(line);
  }

  push(HEAVY);
  push(""); push(""); push(""); push("");
  return lines.join("\n");
}

/** Attempt to print via the local ESC/P print bridge. Returns true on success. */
async function tryPrintBridge(data: ReceiptPrintData): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${getPrintBridgeUrl()}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const json: unknown = await res.json();
    return (json as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

/** HTML fallback: opens a <pre>-based print window — faster on dot matrix than CSS layout. */
function printReceiptViaHtml(data: ReceiptPrintData): void {
  const plainText = formatReceiptPlainText(data);
  const qrHtml = data.digitalReceiptUrl ? `
<div class="qr-block">
  <img alt="QR Struk Digital" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(data.digitalReceiptUrl)}" />
  <div>Scan untuk validasi struk digital</div>
  <small>${escapeHtml(data.digitalReceiptUrl)}</small>
</div>` : "";
  const watermarkCss = data.isCopy ? `
    body { position: relative; }
    body::before {
      content: "COPY";
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 140pt; font-weight: bold; color: rgba(180, 0, 0, 0.18);
      transform: rotate(-30deg);
      pointer-events: none; z-index: 9999;
      letter-spacing: 20pt;
    }
  ` : "";
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>Struk Pembayaran${data.isCopy ? " (COPY)" : ""}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 241mm auto; margin: 3mm 8mm; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; line-height: 1.2; color: #000; background: #fff; }
    pre { white-space: pre; word-wrap: normal; overflow: visible; position: relative; z-index: 1; }
    .qr-block { margin-top: 8px; text-align: center; font-family: Arial, sans-serif; font-size: 9pt; }
    .qr-block img { width: 35mm; height: 35mm; display: block; margin: 0 auto 4px; }
    .qr-block small { display: block; word-break: break-all; font-size: 7pt; }
    ${watermarkCss}
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
<pre>${escapeHtml(plainText)}</pre>
${qrHtml}
<script>
window.onload = function() {
  window.print();
  window.onafterprint = function() { window.close(); };
};
</script>
</body>
</html>`;
  const pw = window.open("", "_blank", "width=600,height=700");
  if (pw) { pw.document.write(html); pw.document.close(); }
}

/**
 * Print a receipt.
 * Tries the local ESC/P print bridge at localhost:6789 first.
 * Falls back to browser window.print() with a plain-text <pre> template.
 */
export function printReceipt(data: ReceiptPrintData): void {
  void tryPrintBridge(data).then((ok) => {
    if (!ok) {
      // Notify user that bridge failed and we're falling back to HTML print
      try {
        const msg = document.createElement('div');
        msg.textContent = '⚠ Print bridge tidak terhubung — menggunakan cetak browser';
        Object.assign(msg.style, {
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#f59e0b', color: '#000', padding: '8px 18px',
          borderRadius: '8px', fontSize: '13px', fontWeight: '500',
          zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap',
        });
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 4000);
      } catch { /* ignore */ }
      printReceiptViaHtml(data);
    }
  });
}
