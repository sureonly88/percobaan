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

const PRINT_BRIDGE_URL = "http://localhost:6789";
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
  pushCtr("PEDAMI PAYMENT");
  pushCtr("Layanan Pembayaran Multi-Produk");
  push(HEAVY);
  pushC2("Loket   : " + data.loketCode + " " + data.loketName, "Kasir : " + data.kasir);
  push("Tanggal : " + fmtTanggal(data.tanggal));
  push(LIGHT);

  data.bills.forEach((b, idx) => {
    const isPln = b.type === "pln";

    push(`[${idx + 1}] ${b.nama}`);
    let idLine = `    ID   : ${b.idpel}`;
    if (!isPln && b.periode) idLine += "  Periode : " + fmtPeriode(b.periode);
    push(idLine);
    if (b.alamat) push("    Alamat: " + b.alamat.substring(0, COLS - 12));
    if (b.transactionCode) push("    Kode  : " + b.transactionCode);

    const pairs: [string, string][] = [];
    if (isPln) {
      const prod = getProdukLabel(b.kodeProduk || "");
      const isNonrek = b.kodeProduk?.startsWith("pln-nonrek");
      const isBpjs   = b.kodeProduk?.startsWith("bpjs");
      const isTelkom = b.kodeProduk?.startsWith("telkom");
      const isPulsa  = b.kodeProduk?.startsWith("pulsa") || b.kodeProduk?.startsWith("paketdata");
      if (prod) pairs.push(["Produk", b.namaProduk || prod]);
      if (isBpjs) {
        if (b.nova)                                                 pairs.push(["No VA",        b.nova]);
        if (b.novaKepalaKeluarga && b.novaKepalaKeluarga !== b.nova) pairs.push(["VA Kepala Kel", b.novaKepalaKeluarga]);
        if (b.jumPeserta)   pairs.push(["Jml Peserta",  b.jumPeserta + " orang"]);
        if (b.namaCabang)   pairs.push(["Cabang",       b.namaCabang]);
        if (b.periode)      pairs.push(["Periode",      b.periode + " Bulan"]);
        if (b.refnum)       pairs.push(["Ref Biller",   b.refnum]);
        if (b.tglLunas)     pairs.push(["Tgl Lunas",    fmtTanggal(b.tglLunas)]);
        if (b.pesanBiller)  pairs.push(["Info",         b.pesanBiller.substring(0, 60)]);
      } else if (isNonrek) {
        if (b.noreg)    pairs.push(["No Registrasi", b.noreg]);
        if (b.tglReg)   pairs.push(["Tgl Registrasi", fmtTglReg(b.tglReg)]);
        if (b.jenisReg) pairs.push(["Jenis Reg", b.jenisReg]);
      } else if (isTelkom) {
        const jum = Number(b.jumBill || 1);
        if (jum > 1) pairs.push(["Jml Tagihan", String(jum) + " bulan"]);
        if (b.periode) pairs.push(["Periode", fmtPeriodeList(b.periode)]);
        if (b.refnum)  pairs.push(["Ref Biller", b.refnum]);
        if (b.tglLunas) pairs.push(["Tgl Lunas", fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin) pairs.push(["Ref Lunasin", b.refnumLunasin]);
      } else if (isPulsa) {
        if (b.nomor)             pairs.push(["No. HP",       b.nomor]);
        if (b.denom)             pairs.push(["Denominasi",   "Rp " + Number(b.denom).toLocaleString("id-ID")]);
        if (b.serialNumber)      pairs.push(["Serial No",    b.serialNumber]);
        if (b.masaBerlaku)       pairs.push(["Masa Berlaku", b.masaBerlaku]);
        if (b.tglLunas)          pairs.push(["Tgl Lunas",    fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin)     pairs.push(["Ref Lunasin",  b.refnumLunasin]);
      } else {
        if (b.tarif || b.daya) pairs.push(["Tarif/Daya", `${b.tarif ?? ""}${b.daya ? "/" + b.daya + " VA" : ""}`]);
        if (b.noMeter) pairs.push(["No Meter", b.noMeter]);
        if (b.standMeter) pairs.push(["Stand Meter", b.standMeter]);
        if (b.jumBill && b.jumBill !== "1" && b.jumBill !== "0") pairs.push(["Jml Tagihan", b.jumBill]);
        if (b.periode && !b.kodeProduk?.startsWith("pln-prepaid")) pairs.push(["Periode", fmtPeriode(b.periode)]);
      }
      if (!isBpjs && !isTelkom && !isPulsa) {
        if ((b.rpAmount ?? 0) > 0) pairs.push(["Tagihan", fmtRp(b.rpAmount!)]);
        if ((b.rpAdmin ?? 0) > 0) pairs.push(["Admin", fmtRp(b.rpAdmin!)]);
      }
      if (!isBpjs && !isPulsa) {
        if (b.refnumLunasin) pairs.push(["Ref Lunasin", b.refnumLunasin]);
        if (b.kwh) pairs.push(["kWh", b.kwh]);
        if ((b.rpMaterai ?? 0) > 0) pairs.push(["Materai", fmtRp(b.rpMaterai!)]);
        if ((b.rpPpn ?? 0) > 0) pairs.push(["PPN", fmtRp(b.rpPpn!)]);
        if ((b.rpPju ?? 0) > 0) pairs.push(["PPJ", fmtRp(b.rpPju!)]);
        if ((b.rpAngsuran ?? 0) > 0) pairs.push(["Angsuran", fmtRp(b.rpAngsuran!)]);
        if ((b.rpToken ?? 0) > 0) pairs.push(["Nilai Token", fmtRp(b.rpToken!)]);
        if ((b.rpTotal ?? 0) > 0) pairs.push(["Total", fmtRp(b.rpTotal!)]);
      }
      if (!isBpjs && !isTelkom && !isPulsa) {
        if (b.refnum) pairs.push(["Ref Number", b.refnum]);
        if (b.tglLunas) pairs.push(["Tgl Lunas", b.tglLunas]);
        if (b.pesanBiller) pairs.push(["Pesan Biller", b.pesanBiller.substring(0, 21)]);
      }
    } else {
      const pemakaian = b.pemakaian ?? ((b.standKini ?? 0) - (b.standLalu ?? 0));
      if (b.gol) pairs.push(["Golongan", b.gol]);
      if ((b.standLalu ?? 0) > 0 || (b.standKini ?? 0) > 0)
        pairs.push(["Stand Meter", `${b.standLalu ?? 0} -> ${b.standKini ?? 0}`]);
      if (pemakaian > 0) pairs.push(["Pemakaian", `${pemakaian.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m3`]);
      if ((b.hargaAir ?? 0) > 0) pairs.push(["Harga Air", fmtRp(b.hargaAir!)]);
      if ((b.bebanTetap ?? 0) > 0) pairs.push(["Beban Tetap", fmtRp(b.bebanTetap!)]);
      if ((b.biayaMeter ?? 0) > 0) pairs.push(["Biaya Meter", fmtRp(b.biayaMeter!)]);
      if ((b.limbah ?? 0) > 0) pairs.push(["Limbah", fmtRp(b.limbah!)]);
      if ((b.retribusi ?? 0) > 0) pairs.push(["Retribusi", fmtRp(b.retribusi!)]);
      if ((b.denda ?? 0) > 0) pairs.push(["Denda", fmtRp(b.denda!)]);
      if ((b.materai ?? 0) > 0) pairs.push(["Materai", fmtRp(b.materai!)]);
      if ((b.diskon ?? 0) > 0) pairs.push(["Diskon", `- ${fmtRp(b.diskon!)}`]);
    }

    for (let j = 0; j < pairs.length; j += 2) {
      const c1 = detailCell(pairs[j][0], pairs[j][1]);
      const c2 = j + 1 < pairs.length ? detailCell(pairs[j + 1][0], pairs[j + 1][1]) : " ".repeat(40);
      push(c1 + c2);
    }

    if (isPln && b.tokenPln) {
      push(LIGHT);
      pushCtr("TOKEN PLN");
      pushCtr(b.tokenPln);
      push(LIGHT);
    }

    if (!isPln) {
      pushC2("  Tagihan", fmtRp(b.tagihan));
      pushC2("  Admin  ", fmtRp(b.admin));
    }
    pushC2("  SUBTOTAL", fmtRp(b.total));

    if (idx < data.bills.length - 1) push(LIGHT);
  });

  push(HEAVY);
  pushC2("Total Tagihan", fmtRp(data.totalTagihan));
  pushC2(`Total Admin (${data.bills.length}x)`, fmtRp(data.totalAdmin));
  push(HEAVY);
  pushC2("TOTAL BAYAR", fmtRp(data.totalBayar));
  push(HEAVY);

  if (data.tunai > 0) {
    pushC2("Tunai  ", fmtRp(data.tunai));
    pushC2("Kembali", fmtRp(data.kembalian));
    push("");
  }

  pushCtr("*** LUNAS ***");
  push("");
  pushCtr("Struk ini sebagai bukti pembayaran yang sah.");
  pushCtr("Terima kasih.");
  push(""); push(""); push(""); push("");
  return lines.join("\n");
}

/** Attempt to print via the local ESC/P print bridge. Returns true on success. */
async function tryPrintBridge(data: ReceiptPrintData): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${PRINT_BRIDGE_URL}/print`, {
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
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>Struk Pembayaran</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 241mm auto; margin: 3mm 8mm; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; line-height: 1.2; color: #000; background: #fff; }
    pre { white-space: pre; word-wrap: normal; overflow: visible; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
<pre>${escapeHtml(plainText)}</pre>
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
    if (!ok) printReceiptViaHtml(data);
  });
}
