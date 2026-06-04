import pool from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import * as XLSX from "xlsx";
import { normalizeRole } from "@/lib/rbac";
import { parsePdamNumber } from "@/lib/pdam-api";
import { auditLog } from "@/lib/audit-log";

type ReconciliationProvider = "pdam" | "lunasin";
export type ReconciliationItemStatus = "MATCH" | "SELISIH_NOMINAL" | "NEED_REVIEW" | "TIDAK_ADA_DI_PROVIDER" | "TIDAK_ADA_DI_INTERNAL" | "RESOLVED" | "IGNORED";
type CellValue = string | number | null | undefined;
type JsonRecord = Record<string, unknown>;

interface ReconciliationQueryOptions {
  provider: ReconciliationProvider;
  role?: string | null;
  userLoketCode?: string | null;
  loketCode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  limit?: number;
}

interface BaseTransactionRow extends RowDataPacket {
  id: number;
  transactionCode: string | null;
  customerId: string | null;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  amount: number | string | null;
  adminFee: number | string | null;
  total: number | string | null;
  serviceType: string | null;
  providerResponse: unknown;
  metadataJson: unknown;
  transactionDate: string | Date | null;
  loketCode: string | null;
  loketName: string | null;
  username: string | null;
}

interface ProviderImportDbRow extends RowDataPacket {
  id: number;
  import_id: number;
  transaction_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  product_code: string | null;
  period_label: string | null;
  loket_code: string | null;
  provider_reference: string | null;
  provider_status: string | null;
  provider_amount: number | string | null;
  provider_admin: number | string | null;
  provider_total: number | string | null;
  error_message: string | null;
}

interface ParsedProviderImportRow {
  rowNumber: number;
  transactionCode: string | null;
  customerId: string | null;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  loketCode: string | null;
  providerReference: string | null;
  providerStatus: string | null;
  providerAmount: number;
  providerAdmin: number;
  providerTotal: number;
  raw: Record<string, unknown>;
  errorMessage: string | null;
}

interface WorkbookColumn<Row> {
  label: string;
  getValue: (row: Row) => CellValue;
}

interface WorkbookSheet<Row> {
  name: string;
  columns: WorkbookColumn<Row>[];
  rows: Row[];
}

interface NormalizedExportRow {
  common: Record<string, CellValue>;
  detail: Record<string, CellValue>;
}

const PDAM_DETAIL_KEY_MAP: Record<string, string> = {
  alamat: "alamat",
  idgol: "golongan",
  gol: "golongan",
  blth: "periodeProvider",
  thbln: "periodeProvider",
  tanggal: "tanggalTagihan",
  harga: "hargaAir",
  harga_air: "hargaAir",
  hargaAir: "hargaAir",
  abodemen: "abodemen",
  byadmin: "abodemen",
  beban_tetap: "bebanTetap",
  bebanTetap: "bebanTetap",
  biaya_tetap: "bebanTetap",
  biaya_meter: "biayaMeter",
  biayaMeter: "biayaMeter",
  materai: "materai",
  limbah: "limbah",
  retribusi: "retribusi",
  denda: "denda",
  diskon: "diskon",
  gma: "gma",
  angsuran: "angsuran",
  pakai: "pemakaian",
  stand_lalu: "standLalu",
  standLalu: "standLalu",
  stand_l: "standLalu",
  stand_kini: "standKini",
  standKini: "standKini",
  stand_i: "standKini",
  sub_total: "subTotalProvider",
  subTotal: "subTotalProvider",
  sub_tot: "subTotalProvider",
  jenis_loket: "jenisLoket",
  jenisLoket: "jenisLoket",
  source: "source",
  detail: "detailJson",
};

const PDAM_DETAIL_LABELS: Record<string, string> = {
  alamat: "Alamat",
  golongan: "Golongan",
  periodeProvider: "Periode Provider",
  tanggalTagihan: "Tanggal Tagihan",
  hargaAir: "Harga Air",
  abodemen: "Abodemen",
  bebanTetap: "Beban Tetap",
  biayaMeter: "Biaya Meter",
  materai: "Materai",
  limbah: "Limbah",
  retribusi: "Retribusi",
  denda: "Denda",
  diskon: "Diskon",
  gma: "GMA",
  angsuran: "Angsuran",
  pemakaian: "Pemakaian",
  standLalu: "Stand Lalu",
  standKini: "Stand Kini",
  subTotalProvider: "Sub Total Provider",
  jenisLoket: "Jenis Loket",
  source: "Sumber",
  detailJson: "Detail JSON",
};

const PDAM_DETAIL_ORDER = [
  "alamat",
  "golongan",
  "periodeProvider",
  "tanggalTagihan",
  "standLalu",
  "standKini",
  "pemakaian",
  "hargaAir",
  "abodemen",
  "bebanTetap",
  "biayaMeter",
  "materai",
  "limbah",
  "retribusi",
  "denda",
  "diskon",
  "gma",
  "angsuran",
  "subTotalProvider",
  "jenisLoket",
  "source",
  "detailJson",
] as const;

const PDAM_NUMERIC_KEYS = new Set<string>([
  "hargaAir",
  "abodemen",
  "bebanTetap",
  "biayaMeter",
  "materai",
  "limbah",
  "retribusi",
  "denda",
  "diskon",
  "gma",
  "angsuran",
  "pemakaian",
  "standLalu",
  "standKini",
  "subTotalProvider",
]);

const LUNASIN_DETAIL_KEY_MAP: Record<string, string> = {
  id_trx: "idTrx",
  idTrx: "idTrx",
  input2: "input2",
  input3: "input3",
  tarif: "tarif",
  daya: "daya",
  periode: "periodeProvider",
  jum_bill: "jumlahTagihan",
  jumBill: "jumlahTagihan",
  stand_meter: "standMeter",
  standMeter: "standMeter",
  nometer: "noMeter",
  token: "token",
  kwh: "kwh",
  rp_amount: "tagihanProvider",
  rp_admin: "adminProvider",
  rp_total: "totalProvider",
  rp_materai: "materai",
  rp_ppn: "ppn",
  rp_pju: "ppj",
  rp_angsuran: "angsuran",
  rp_token: "nilaiToken",
  saldo_terpotong: "saldoTerpotong",
  refnum: "refnum",
  refnum_lunasin: "refnumLunasin",
  refnumLunasin: "refnumLunasin",
  tgl_lunas: "tanggalLunas",
  pesan_biller: "pesanBiller",
  detail: "detailJson",
  jenis_loket: "jenisLoket",
  jenisLoket: "jenisLoket",
  source: "source",
};

const LUNASIN_DETAIL_LABELS: Record<string, string> = {
  idTrx: "ID Trx Provider",
  input2: "Input 2",
  input3: "Input 3",
  tarif: "Tarif",
  daya: "Daya",
  periodeProvider: "Periode Provider",
  jumlahTagihan: "Jumlah Tagihan",
  standMeter: "Stand Meter",
  noMeter: "No. Meter",
  token: "Token",
  kwh: "kWh",
  tagihanProvider: "Tagihan Provider",
  adminProvider: "Admin Provider",
  totalProvider: "Total Provider",
  materai: "Materai",
  ppn: "PPN",
  ppj: "PPJ",
  angsuran: "Angsuran",
  nilaiToken: "Nilai Token",
  saldoTerpotong: "Saldo Terpotong",
  refnum: "Ref Number",
  refnumLunasin: "Ref Lunasin",
  tanggalLunas: "Tanggal Lunas",
  pesanBiller: "Pesan Biller",
  detailJson: "Detail JSON",
  jenisLoket: "Jenis Loket",
  source: "Sumber",
};

const LUNASIN_NUMERIC_KEYS = new Set<string>([
  "jumlahTagihan",
  "tagihanProvider",
  "adminProvider",
  "totalProvider",
  "materai",
  "ppn",
  "ppj",
  "angsuran",
  "nilaiToken",
  "saldoTerpotong",
]);

const SHEET_DETAIL_ORDER: Record<string, readonly string[]> = {
  Postpaid: [
    "idTrx",
    "tarif",
    "daya",
    "standMeter",
    "noMeter",
    "periodeProvider",
    "jumlahTagihan",
    "kwh",
    "tagihanProvider",
    "adminProvider",
    "materai",
    "ppn",
    "ppj",
    "angsuran",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  Prepaid: [
    "idTrx",
    "tarif",
    "daya",
    "noMeter",
    "standMeter",
    "token",
    "nilaiToken",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "saldoTerpotong",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  BPJS: [
    "idTrx",
    "periodeProvider",
    "jumlahTagihan",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  Telkom: [
    "idTrx",
    "periodeProvider",
    "jumlahTagihan",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  Pulsa: [
    "idTrx",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "token",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  "Paket Data": [
    "idTrx",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  "PDAM Lunasin": [
    "idTrx",
    "periodeProvider",
    "jumlahTagihan",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
  Lainnya: [
    "idTrx",
    "periodeProvider",
    "jumlahTagihan",
    "tagihanProvider",
    "adminProvider",
    "totalProvider",
    "refnum",
    "refnumLunasin",
    "tanggalLunas",
    "pesanBiller",
    "detailJson",
  ],
};

const LUNASIN_PRODUCT_LABELS: Record<string, string> = {
  "pln-postpaid": "PLN Pascabayar",
  "pln-prepaid": "PLN Prabayar",
  "pln-prepaidk": "PLN Prabayar K",
  "pln-nonrek": "PLN Non-Rekening",
  "pln-plnmobile": "PLN Mobile",
  "bpjs-kes": "BPJS Kesehatan",
  "telkom-postpaid": "Telkom",
  "pdam-lunasin": "PDAM Lunasin",
};

function parseJsonObject(value: unknown): JsonRecord {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function stringifyComplex(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return "";
        if (typeof item === "object") return JSON.stringify(item);
        return String(item);
      })
      .filter(Boolean)
      .join(" | ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function toFlatRecord(source: JsonRecord): Record<string, CellValue> {
  const result: Record<string, CellValue> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (typeof rawValue === "number") {
      result[key] = rawValue;
      continue;
    }
    result[key] = stringifyComplex(rawValue);
  }
  return result;
}

function normalizeDetailMap(
  source: Record<string, CellValue>,
  keyMap: Record<string, string>,
  numericKeys: Set<string>,
  parser?: (value: string | number) => number,
): Record<string, CellValue> {
  const normalized: Record<string, CellValue> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = keyMap[rawKey] || rawKey;
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;

    let nextValue: CellValue = rawValue;
    if (numericKeys.has(key)) {
      if (typeof rawValue === "number") {
        nextValue = rawValue;
      } else if (typeof rawValue === "string") {
        const parsed = parser ? parser(rawValue) : Number(rawValue);
        nextValue = Number.isFinite(parsed) ? parsed : rawValue;
      }
    }

    normalized[key] = nextValue;
  }
  return normalized;
}

function titleize(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getNumeric(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeImportHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeMatchValue(value: string | number | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePeriodValue(value: string | number | null | undefined): string {
  return normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function parseImportMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : 0;
  let text = String(value ?? "").trim();
  if (!text) return 0;
  text = text.replace(/\s/g, "").replace(/rp/gi, "").replace(/[^0-9,.-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(/,/g, ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

const PROVIDER_IMPORT_HEADER_ALIASES: Record<keyof Omit<ParsedProviderImportRow, "rowNumber" | "raw" | "errorMessage">, string[]> = {
  transactionCode: ["kode_transaksi", "kode transaksi", "transaction_code", "transaction code", "trx_id", "id_trx", "id trx", "ref_internal", "ref internal"],
  customerId: ["id_pelanggan", "id pelanggan", "customer_id", "customer id", "idpel", "no_pelanggan", "no pelanggan", "nomor_pelanggan", "nomor pelanggan"],
  customerName: ["nama_pelanggan", "nama pelanggan", "customer_name", "customer name", "nama"],
  productCode: ["produk", "product", "product_code", "product code", "kode_produk", "kode produk"],
  periodLabel: ["periode", "period", "period_label", "period label", "blth", "bulan"],
  loketCode: ["kode_loket", "kode loket", "loket_code", "loket code", "loket"],
  providerReference: ["ref_provider", "ref provider", "provider_reference", "provider reference", "refnum", "stan", "rrn"],
  providerStatus: ["status_provider", "status provider", "provider_status", "provider status", "status"],
  providerAmount: ["nominal_tagihan", "nominal tagihan", "amount", "tagihan", "provider_amount", "provider amount", "rp_amount"],
  providerAdmin: ["admin", "admin_fee", "admin fee", "provider_admin", "provider admin", "rp_admin"],
  providerTotal: ["total_provider", "total provider", "provider_total", "provider total", "total", "rp_total", "total_bayar", "total bayar"],
};

const PROVIDER_IMPORT_HEADER_LOOKUP = Object.entries(PROVIDER_IMPORT_HEADER_ALIASES).reduce<Record<string, string>>((acc, [canonical, aliases]) => {
  for (const alias of aliases) acc[normalizeImportHeader(alias)] = canonical;
  return acc;
}, {});

function parseProviderImportWorkbook(buffer: Buffer): ParsedProviderImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("File Excel tidak memiliki sheet");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (rawRows.length === 0) throw new Error("File Excel kosong");

  return rawRows.map((raw, index) => {
    const normalized: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const canonical = PROVIDER_IMPORT_HEADER_LOOKUP[normalizeImportHeader(header)];
      if (canonical) normalized[canonical] = value;
    }

    const providerAmount = parseImportMoney(normalized.providerAmount);
    const providerAdmin = parseImportMoney(normalized.providerAdmin);
    const providerTotal = parseImportMoney(normalized.providerTotal) || providerAmount + providerAdmin;
    const transactionCode = cleanText(normalized.transactionCode);
    const customerId = cleanText(normalized.customerId);
    const errorParts: string[] = [];
    if (!transactionCode && !customerId) errorParts.push("KODE_TRANSAKSI atau ID_PELANGGAN wajib diisi");
    if (providerTotal <= 0) errorParts.push("TOTAL_PROVIDER wajib lebih dari 0");

    return {
      rowNumber: index + 2,
      transactionCode,
      customerId,
      customerName: cleanText(normalized.customerName),
      productCode: cleanText(normalized.productCode),
      periodLabel: cleanText(normalized.periodLabel),
      loketCode: cleanText(normalized.loketCode),
      providerReference: cleanText(normalized.providerReference),
      providerStatus: cleanText(normalized.providerStatus),
      providerAmount,
      providerAdmin,
      providerTotal,
      raw,
      errorMessage: errorParts.length ? errorParts.join("; ") : null,
    };
  });
}

function pushMapValue<T>(map: Map<string, T[]>, key: string, value: T) {
  if (!key) return;
  const existing = map.get(key) || [];
  existing.push(value);
  map.set(key, existing);
}

function buildTransactionMatchKeys(row: BaseTransactionRow) {
  const customerId = normalizeMatchValue(row.customerId);
  const productCode = normalizeMatchValue(row.productCode);
  const periodLabel = normalizePeriodValue(row.periodLabel);
  const loketCode = normalizeMatchValue(row.loketCode);
  return [
    row.transactionCode ? `trx:${normalizeMatchValue(row.transactionCode)}` : "",
    customerId && productCode && periodLabel && loketCode ? `full:${customerId}|${productCode}|${periodLabel}|${loketCode}` : "",
    customerId && productCode && periodLabel ? `custprodperiod:${customerId}|${productCode}|${periodLabel}` : "",
    customerId && periodLabel ? `custperiod:${customerId}|${periodLabel}` : "",
    customerId ? `customer:${customerId}` : "",
  ].filter(Boolean);
}

function buildProviderMatchKeys(row: ProviderImportDbRow) {
  const customerId = normalizeMatchValue(row.customer_id);
  const productCode = normalizeMatchValue(row.product_code);
  const periodLabel = normalizePeriodValue(row.period_label);
  const loketCode = normalizeMatchValue(row.loket_code);
  return [
    row.transaction_code ? `trx:${normalizeMatchValue(row.transaction_code)}` : "",
    customerId && productCode && periodLabel && loketCode ? `full:${customerId}|${productCode}|${periodLabel}|${loketCode}` : "",
    customerId && productCode && periodLabel ? `custprodperiod:${customerId}|${productCode}|${periodLabel}` : "",
    customerId && periodLabel ? `custperiod:${customerId}|${periodLabel}` : "",
    customerId ? `customer:${customerId}` : "",
  ].filter(Boolean);
}

function getProductLabel(productCode: string | null | undefined): string {
  if (!productCode) return "Lunasin";
  const base = productCode.replace(/-\d+$/, "");
  if (LUNASIN_PRODUCT_LABELS[base]) return LUNASIN_PRODUCT_LABELS[base];
  return titleize(base.replace(/-/g, " "));
}

function getLunasinSheetName(productCode: string | null | undefined): string {
  const code = (productCode || "").toLowerCase();
  if (code.startsWith("pln-prepaid")) return "Prepaid";
  if (code.startsWith("pln-")) return "Postpaid";
  if (code.startsWith("bpjs-")) return "BPJS";
  if (code.startsWith("telkom-")) return "Telkom";
  if (code.startsWith("pulsa-")) return "Pulsa";
  if (code.startsWith("paketdata-")) return "Paket Data";
  if (code.startsWith("pdam-")) return "PDAM Lunasin";
  return "Lainnya";
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, " ").trim() || `Sheet ${index + 1}`;
  return cleaned.slice(0, 31);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderCell(value: CellValue, styleId?: string): string {
  if (value === null || value === undefined || value === "") {
    return styleId ? `<Cell ss:StyleID="${styleId}"/>` : "<Cell/>";
  }

  const type = typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
  const serialized = type === "Number" ? String(value) : escapeXml(String(value));
  const styleAttr = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${styleAttr}><Data ss:Type="${type}">${serialized}</Data></Cell>`;
}

function buildExcelWorkbookXml<Row>(sheets: WorkbookSheet<Row>[]): Buffer {
  const workbook = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<?mso-application progid="Excel.Sheet"?>`,
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">`,
    `<Styles>`,
    `<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top"/></Style>`,
    `<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>`,
    `</Styles>`,
    ...sheets.map((sheet, index) => {
      const columns = sheet.columns;
      const header = `<Row>${columns.map((column) => renderCell(column.label, "header")).join("")}</Row>`;
      const rows = sheet.rows.map((row) => `<Row>${columns.map((column) => renderCell(column.getValue(row))).join("")}</Row>`).join("");
      return [
        `<Worksheet ss:Name="${escapeXml(sanitizeSheetName(sheet.name, index))}">`,
        `<Table>`,
        ...columns.map(() => `<Column ss:AutoFitWidth="1"/>`),
        header,
        rows,
        `</Table>`,
        `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>`,
        `</Worksheet>`,
      ].join("");
    }),
    `</Workbook>`,
  ].join("");

  return Buffer.from(`\uFEFF${workbook}`, "utf8");
}

function sortDetailKeys(keys: string[], preferredOrder: readonly string[], labels: Record<string, string>): string[] {
  const preferred = preferredOrder.filter((key) => keys.includes(key));
  const remaining = keys
    .filter((key) => !preferred.includes(key))
    .sort((left, right) => {
      const leftLabel = labels[left] || titleize(left);
      const rightLabel = labels[right] || titleize(right);
      return leftLabel.localeCompare(rightLabel, "id");
    });
  return [...preferred, ...remaining];
}

function detailColumns(
  rows: NormalizedExportRow[],
  labels: Record<string, string>,
  preferredOrder: readonly string[],
): WorkbookColumn<NormalizedExportRow>[] {
  const allKeys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row.detail).filter((key) => row.detail[key] !== null && row.detail[key] !== undefined && row.detail[key] !== ""))),
  );

  return sortDetailKeys(allKeys, preferredOrder, labels).map((key) => ({
    label: labels[key] || titleize(key),
    getValue: (row: NormalizedExportRow) => row.detail[key],
  }));
}

function buildScopedFilter(options: ReconciliationQueryOptions) {
  const normalizedRole = normalizeRole(options.role || "kasir");
  const canSeeAll = normalizedRole === "admin" || normalizedRole === "supervisor";
  const effectiveLoketCode = canSeeAll
    ? options.loketCode && options.loketCode !== "semua" ? options.loketCode : ""
    : options.userLoketCode || "__NO_LOKET__";

  let where = `WHERE i.status = 'SUCCESS' AND i.provider = ?`;
  const params: Array<string | number> = [options.provider === "pdam" ? "PDAM" : "LUNASIN"];

  if (effectiveLoketCode) {
    where += " AND r.loket_code = ?";
    params.push(effectiveLoketCode);
  }
  if (options.startDate) {
    where += " AND COALESCE(i.paid_at, i.created_at) >= ?";
    params.push(`${options.startDate} 00:00:00`);
  }
  if (options.endDate) {
    where += " AND COALESCE(i.paid_at, i.created_at) <= ?";
    params.push(`${options.endDate} 23:59:59`);
  }

  return { where, params, canSeeAll, effectiveLoketCode };
}

async function fetchLoketList(canSeeAll: boolean, userLoketCode?: string | null) {
  const [rows] = await pool.query<RowDataPacket[]>(
    canSeeAll
      ? "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' ORDER BY nama"
      : "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' AND loket_code = ? ORDER BY nama",
    canSeeAll ? [] : [userLoketCode || "__NO_LOKET__"],
  );

  return rows.map((row) => ({
    nama: String(row.nama || row.loket_code || "-"),
    loketCode: String(row.loket_code || ""),
  }));
}

async function fetchTransactionRows(
  options: ReconciliationQueryOptions,
  pagination?: { limit: number; offset: number },
) {
  const { where, params } = buildScopedFilter(options);
  const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;
  const select = `SELECT
      i.id,
      i.transaction_code as transactionCode,
      i.customer_id as customerId,
      i.customer_name as customerName,
      i.product_code as productCode,
      i.period_label as periodLabel,
      i.amount,
      i.admin_fee as adminFee,
      i.total,
      i.service_type as serviceType,
      i.provider_response as providerResponse,
      i.metadata_json as metadataJson,
      COALESCE(i.paid_at, i.created_at) as transactionDate,
      r.loket_code as loketCode,
      r.loket_name as loketName,
      r.username
    ${baseFrom}
    ${where}
    ORDER BY COALESCE(i.paid_at, i.created_at) DESC`;

  const query = pagination
    ? `${select} LIMIT ? OFFSET ?`
    : select;
  const queryParams = pagination
    ? [...params, pagination.limit, pagination.offset]
    : params;

  const [rows] = await pool.query<BaseTransactionRow[]>(query, queryParams);
  return rows;
}

function buildPdamDetail(row: BaseTransactionRow): Record<string, CellValue> {
  const metadata = normalizeDetailMap(toFlatRecord(parseJsonObject(row.metadataJson)), PDAM_DETAIL_KEY_MAP, PDAM_NUMERIC_KEYS, parsePdamNumber);
  const provider = normalizeDetailMap(toFlatRecord(parseJsonObject(row.providerResponse)), PDAM_DETAIL_KEY_MAP, PDAM_NUMERIC_KEYS, parsePdamNumber);
  return { ...metadata, ...provider };
}

function buildLunasinDetail(row: BaseTransactionRow): Record<string, CellValue> {
  const metadata = normalizeDetailMap(toFlatRecord(parseJsonObject(row.metadataJson)), LUNASIN_DETAIL_KEY_MAP, LUNASIN_NUMERIC_KEYS);
  const rawProvider = parseJsonObject(row.providerResponse);
  const providerData = rawProvider.data && typeof rawProvider.data === "object" && !Array.isArray(rawProvider.data)
    ? (rawProvider.data as JsonRecord)
    : rawProvider;
  const provider = normalizeDetailMap(toFlatRecord(providerData), LUNASIN_DETAIL_KEY_MAP, LUNASIN_NUMERIC_KEYS);
  return { ...metadata, ...provider };
}

function mapPdamPreviewRow(row: BaseTransactionRow) {
  const detail = buildPdamDetail(row);
  return {
    id: Number(row.id),
    transactionDate: formatDateTime(row.transactionDate),
    transactionCode: String(row.transactionCode || "-"),
    customerId: String(row.customerId || "-"),
    customerName: String(row.customerName || "-"),
    periodLabel: String(row.periodLabel || detail.periodeProvider || "-"),
    loketCode: String(row.loketCode || "-"),
    loketName: String(row.loketName || row.loketCode || "-"),
    username: String(row.username || "-"),
    jenisLoket: String(detail.jenisLoket || "-"),
    amount: getNumeric(row.amount),
    adminFee: getNumeric(row.adminFee),
    total: getNumeric(row.total),
  };
}

function mapLunasinPreviewRow(row: BaseTransactionRow) {
  const detail = buildLunasinDetail(row);
  const productCode = String(row.productCode || "");
  return {
    id: Number(row.id),
    transactionDate: formatDateTime(row.transactionDate),
    transactionCode: String(row.transactionCode || "-"),
    customerId: String(row.customerId || "-"),
    customerName: String(row.customerName || "-"),
    productCode,
    productLabel: getProductLabel(productCode),
    sheetName: getLunasinSheetName(productCode),
    periodLabel: String(row.periodLabel || detail.periodeProvider || "-"),
    loketCode: String(row.loketCode || "-"),
    loketName: String(row.loketName || row.loketCode || "-"),
    username: String(row.username || "-"),
    amount: getNumeric(row.amount),
    adminFee: getNumeric(row.adminFee),
    total: getNumeric(row.total),
  };
}

function buildPdamExportRows(rows: BaseTransactionRow[]): NormalizedExportRow[] {
  return rows.map((row) => {
    const detail = buildPdamDetail(row);
    return {
      common: {
        transactionDate: formatDateTime(row.transactionDate),
        transactionCode: String(row.transactionCode || "-"),
        loketCode: String(row.loketCode || "-"),
        loketName: String(row.loketName || row.loketCode || "-"),
        username: String(row.username || "-"),
        customerId: String(row.customerId || "-"),
        customerName: String(row.customerName || "-"),
        periodLabel: String(row.periodLabel || detail.periodeProvider || "-"),
        amount: getNumeric(row.amount),
        adminFee: getNumeric(row.adminFee),
        total: getNumeric(row.total),
      },
      detail,
    };
  });
}

function buildLunasinExportRows(rows: BaseTransactionRow[]): Array<NormalizedExportRow & { sheetName: string }> {
  return rows.map((row) => {
    const detail = buildLunasinDetail(row);
    const productCode = String(row.productCode || "");
    return {
      sheetName: getLunasinSheetName(productCode),
      common: {
        transactionDate: formatDateTime(row.transactionDate),
        transactionCode: String(row.transactionCode || "-"),
        loketCode: String(row.loketCode || "-"),
        loketName: String(row.loketName || row.loketCode || "-"),
        username: String(row.username || "-"),
        productCode,
        productLabel: getProductLabel(productCode),
        customerId: String(row.customerId || "-"),
        customerName: String(row.customerName || "-"),
        periodLabel: String(row.periodLabel || detail.periodeProvider || "-"),
        amount: getNumeric(row.amount),
        adminFee: getNumeric(row.adminFee),
        total: getNumeric(row.total),
      },
      detail,
    };
  });
}

function buildPdamWorkbook(rows: BaseTransactionRow[]) {
  const exportRows = buildPdamExportRows(rows);
  const commonColumns: WorkbookColumn<NormalizedExportRow>[] = [
    { label: "Kode Transaksi", getValue: (row) => row.common.transactionCode },
    { label: "ID Pelanggan", getValue: (row) => row.common.customerId },
    { label: "Nama Pelanggan", getValue: (row) => row.common.customerName },
    { label: "Periode", getValue: (row) => row.common.periodLabel },
    { label: "Sub Total", getValue: (row) => row.common.amount },
    { label: "Biaya Admin", getValue: (row) => row.common.adminFee },
    { label: "Total Bayar", getValue: (row) => row.common.total },
    { label: "Kode Loket", getValue: (row) => row.common.loketCode },
    { label: "Tanggal Transaksi", getValue: (row) => row.common.transactionDate },
  ];

  return buildExcelWorkbookXml([
    {
      name: "PDAM Native",
      columns: commonColumns,
      rows: exportRows,
    },
  ]);
}

function buildLunasinWorkbook(rows: BaseTransactionRow[]) {
  const exportRows = buildLunasinExportRows(rows);
  const grouped = new Map<string, Array<NormalizedExportRow & { sheetName: string }>>();
  for (const row of exportRows) {
    const bucket = grouped.get(row.sheetName) || [];
    bucket.push(row);
    grouped.set(row.sheetName, bucket);
  }

  const commonColumns: WorkbookColumn<NormalizedExportRow>[] = [
    { label: "Tanggal Bayar", getValue: (row) => row.common.transactionDate },
    { label: "Kode Transaksi", getValue: (row) => row.common.transactionCode },
    { label: "Kode Loket", getValue: (row) => row.common.loketCode },
    { label: "Nama Loket", getValue: (row) => row.common.loketName },
    { label: "Username", getValue: (row) => row.common.username },
    { label: "Kode Produk", getValue: (row) => row.common.productCode },
    { label: "Nama Produk", getValue: (row) => row.common.productLabel },
    { label: "ID Pelanggan", getValue: (row) => row.common.customerId },
    { label: "Nama Pelanggan", getValue: (row) => row.common.customerName },
    { label: "Periode", getValue: (row) => row.common.periodLabel },
    { label: "Tagihan", getValue: (row) => row.common.amount },
    { label: "Admin", getValue: (row) => row.common.adminFee },
    { label: "Total Bayar", getValue: (row) => row.common.total },
  ];

  const orderedSheets = ["Postpaid", "Prepaid", "BPJS", "Telkom", "Pulsa", "Paket Data", "PDAM Lunasin", "Lainnya"];
  const sheets: WorkbookSheet<NormalizedExportRow>[] = orderedSheets
    .filter((sheetName) => grouped.has(sheetName))
    .map((sheetName) => {
      const sheetRows = grouped.get(sheetName) || [];
      return {
        name: sheetName,
        columns: [
          ...commonColumns,
          ...detailColumns(sheetRows, LUNASIN_DETAIL_LABELS, SHEET_DETAIL_ORDER[sheetName] || SHEET_DETAIL_ORDER.Lainnya),
        ],
        rows: sheetRows,
      };
    });

  if (sheets.length === 0) {
    sheets.push({
      name: "Lainnya",
      columns: commonColumns,
      rows: [],
    });
  }

  return buildExcelWorkbookXml(sheets);
}

export async function getReconciliationPreview(options: ReconciliationQueryOptions) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(options.limit) || 20));
  const { where, params, canSeeAll } = buildScopedFilter(options);
  const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;

  const [countRows, summaryRows, previewRows, loketList] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) as total ${baseFrom} ${where}`, params).then(([rows]) => rows),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(i.amount), 0) as totalTagihan,
              COALESCE(SUM(i.admin_fee), 0) as totalAdmin,
              COALESCE(SUM(i.total), 0) as totalNominal
         ${baseFrom}
         ${where}`,
      params,
    ).then(([rows]) => rows),
    fetchTransactionRows(options, { limit, offset: (page - 1) * limit }),
    fetchLoketList(canSeeAll, options.userLoketCode),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const summary = {
    totalTransaksi: total,
    totalTagihan: Number(summaryRows[0]?.totalTagihan ?? 0),
    totalAdmin: Number(summaryRows[0]?.totalAdmin ?? 0),
    totalNominal: Number(summaryRows[0]?.totalNominal ?? 0),
  };

  return {
    provider: options.provider,
    summary,
    total,
    page,
    totalPages,
    loketList,
    rows: options.provider === "pdam"
      ? previewRows.map(mapPdamPreviewRow)
      : previewRows.map(mapLunasinPreviewRow),
  };
}

export async function buildReconciliationExport(options: ReconciliationQueryOptions) {
  const rows = await fetchTransactionRows(options);
  const today = new Date().toISOString().slice(0, 10);
  const providerLabel = options.provider === "pdam" ? "pdam_native" : "lunasin";
  const buffer = options.provider === "pdam"
    ? buildPdamWorkbook(rows)
    : buildLunasinWorkbook(rows);

  return {
    filename: `rekonsiliasi_${providerLabel}_${today}.xls`,
    contentType: "application/vnd.ms-excel; charset=utf-8",
    buffer,
  };
}

export async function importProviderReconciliationFile(params: {
  provider: ReconciliationProvider;
  startDate: string;
  endDate: string;
  loketCode?: string | null;
  filename?: string | null;
  buffer: Buffer;
  importedBy?: string | null;
}) {
  const parsedRows = parseProviderImportWorkbook(params.buffer);
  const validRows = parsedRows.filter((row) => !row.errorMessage);
  const totalProvider = validRows.reduce((sum, row) => sum + row.providerTotal, 0);
  const loketCode = params.loketCode && params.loketCode !== "semua" ? params.loketCode : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [importRes] = await connection.execute<ResultSetHeader>(
      `INSERT INTO reconciliation_provider_imports
       (provider, start_date, end_date, loket_code, original_filename, total_rows, valid_rows, invalid_rows,
        total_provider, imported_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [params.provider, params.startDate, params.endDate, loketCode, params.filename || null, parsedRows.length, validRows.length, parsedRows.length - validRows.length, totalProvider, params.importedBy || null],
    );
    const importId = Number(importRes.insertId);

    for (const row of parsedRows) {
      await connection.execute(
        `INSERT INTO reconciliation_provider_import_rows
         (import_id, excel_row_number, transaction_code, customer_id, customer_name, product_code, period_label, loket_code,
          provider_reference, provider_status, provider_amount, provider_admin, provider_total, raw_json, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          importId,
          row.rowNumber,
          row.transactionCode,
          row.customerId,
          row.customerName,
          row.productCode,
          row.periodLabel,
          row.loketCode,
          row.providerReference,
          row.providerStatus,
          row.providerAmount,
          row.providerAdmin,
          row.providerTotal,
          JSON.stringify(row.raw),
          row.errorMessage,
        ],
      );
    }

    await connection.commit();
    return {
      importId,
      totalRows: parsedRows.length,
      validRows: validRows.length,
      invalidRows: parsedRows.length - validRows.length,
      totalProvider,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listReconciliationProviderImports(params: { provider?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 10)));
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (params.provider && params.provider !== "ALL") {
    where.push("provider = ?");
    values.push(params.provider);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM reconciliation_provider_imports ${whereSql}`, values);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM reconciliation_provider_imports ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );
  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      provider: String(row.provider),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      loketCode: row.loket_code ? String(row.loket_code) : null,
      originalFilename: row.original_filename ? String(row.original_filename) : null,
      totalRows: Number(row.total_rows || 0),
      validRows: Number(row.valid_rows || 0),
      invalidRows: Number(row.invalid_rows || 0),
      totalProvider: Number(row.total_provider || 0),
      importedBy: row.imported_by ? String(row.imported_by) : null,
      createdAt: String(row.created_at),
    })),
    totalItems: Number(countRows[0]?.total || 0),
    page,
    pageSize,
  };
}

async function fetchProviderImportRows(providerImportId: number, provider: ReconciliationProvider) {
  const [importRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM reconciliation_provider_imports WHERE id = ? AND provider = ? LIMIT 1`,
    [providerImportId, provider],
  );
  if (!importRows[0]) throw new Error("Import provider tidak ditemukan untuk provider aktif");

  const [rows] = await pool.query<ProviderImportDbRow[]>(
    `SELECT * FROM reconciliation_provider_import_rows
      WHERE import_id = ? AND error_message IS NULL AND provider_total > 0
      ORDER BY excel_row_number ASC`,
    [providerImportId],
  );
  return { importRow: importRows[0], rows };
}

function findProviderRowForTransaction(row: BaseTransactionRow, matchMap: Map<string, ProviderImportDbRow[]>, usedProviderRowIds: Set<number>) {
  for (const key of buildTransactionMatchKeys(row)) {
    const candidates = (matchMap.get(key) || []).filter((candidate) => !usedProviderRowIds.has(Number(candidate.id)));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

export async function generateReconciliationBatch(options: ReconciliationQueryOptions & { providerImportId?: number; createdBy?: string | null }) {
  if (!options.startDate || !options.endDate) throw new Error("Tanggal mulai dan akhir wajib diisi");
  if (!options.providerImportId) throw new Error("Import Excel provider wajib dipilih sebelum generate batch");
  const rows = await fetchTransactionRows(options);
  const { rows: providerRows } = await fetchProviderImportRows(options.providerImportId, options.provider);
  const createdBy = options.createdBy || "SYSTEM";
  const loketCode = options.loketCode && options.loketCode !== "semua" ? options.loketCode : null;

  const providerMatchMap = new Map<string, ProviderImportDbRow[]>();
  for (const providerRow of providerRows) {
    for (const key of buildProviderMatchKeys(providerRow)) {
      pushMapValue(providerMatchMap, key, providerRow);
    }
  }

  const usedProviderRowIds = new Set<number>();
  const prepared = rows.map((row) => {
    const providerRow = findProviderRowForTransaction(row, providerMatchMap, usedProviderRowIds);
    const internalTotal = getNumeric(row.total);
    if (!providerRow) {
      return { row, providerRow: null, providerTotal: 0, difference: internalTotal, status: "TIDAK_ADA_DI_PROVIDER" as ReconciliationItemStatus };
    }
    usedProviderRowIds.add(Number(providerRow.id));
    const providerTotal = getNumeric(providerRow.provider_total);
    const difference = internalTotal - providerTotal;
    return {
      row,
      providerRow,
      providerTotal,
      difference,
      status: difference === 0 ? "MATCH" as ReconciliationItemStatus : "SELISIH_NOMINAL" as ReconciliationItemStatus,
    };
  });

  const unmatchedProviderRows = providerRows.filter((row) => !usedProviderRowIds.has(Number(row.id)));
  const totalInternal = prepared.reduce((sum, item) => sum + getNumeric(item.row.total), 0);
  const totalProvider = providerRows.reduce((sum, row) => sum + getNumeric(row.provider_total), 0);
  const matchCount = prepared.filter((item) => item.status === "MATCH").length;
  const exceptionCount = prepared.length - matchCount + unmatchedProviderRows.length;
  const totalItems = prepared.length + unmatchedProviderRows.length;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [batchRes] = await connection.execute<ResultSetHeader>(
      `INSERT INTO reconciliation_batches
       (provider, start_date, end_date, loket_code, provider_import_id, status, total_items, match_count, exception_count,
        total_internal, total_provider, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [options.provider, options.startDate, options.endDate, loketCode, options.providerImportId, totalItems, matchCount, exceptionCount, totalInternal, totalProvider, createdBy]
    );
    const batchId = Number(batchRes.insertId);

    for (const item of prepared) {
      const row = item.row;
      await connection.execute(
        `INSERT INTO reconciliation_items
         (batch_id, multi_payment_item_id, provider_import_row_id, transaction_code, customer_id, customer_name, product_code, period_label,
          loket_code, loket_name, internal_amount, internal_admin, internal_total, provider_total,
          difference_amount, match_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          batchId,
          Number(row.id),
          item.providerRow ? Number(item.providerRow.id) : null,
          row.transactionCode || null,
          row.customerId || null,
          row.customerName || null,
          row.productCode || null,
          row.periodLabel || null,
          row.loketCode || null,
          row.loketName || null,
          getNumeric(row.amount),
          getNumeric(row.adminFee),
          getNumeric(row.total),
          item.providerTotal,
          item.difference,
          item.status,
        ]
      );
    }

    for (const providerRow of unmatchedProviderRows) {
      const providerTotal = getNumeric(providerRow.provider_total);
      await connection.execute(
        `INSERT INTO reconciliation_items
         (batch_id, multi_payment_item_id, provider_import_row_id, transaction_code, customer_id, customer_name, product_code, period_label,
          loket_code, loket_name, internal_amount, internal_admin, internal_total, provider_total,
          difference_amount, match_status, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, ?, ?, 'TIDAK_ADA_DI_INTERNAL', NOW(), NOW())`,
        [
          batchId,
          Number(providerRow.id),
          providerRow.transaction_code || null,
          providerRow.customer_id || null,
          providerRow.customer_name || null,
          providerRow.product_code || null,
          providerRow.period_label || null,
          providerRow.loket_code || null,
          providerTotal,
          0 - providerTotal,
        ]
      );
    }

    await connection.commit();
    return { batchId, totalItems, matchCount, exceptionCount, totalInternal, totalProvider };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listReconciliationBatches(params: { provider?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 10)));
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (params.provider && params.provider !== "ALL") {
    where.push("provider = ?");
    values.push(params.provider);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM reconciliation_batches ${whereSql}`, values);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM reconciliation_batches ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );
  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      provider: String(row.provider),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      loketCode: row.loket_code ? String(row.loket_code) : null,
      providerImportId: row.provider_import_id ? Number(row.provider_import_id) : null,
      status: String(row.status),
      totalItems: Number(row.total_items || 0),
      matchCount: Number(row.match_count || 0),
      exceptionCount: Number(row.exception_count || 0),
      totalInternal: Number(row.total_internal || 0),
      totalProvider: Number(row.total_provider || 0),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
    })),
    totalItems: Number(countRows[0]?.total || 0),
    page,
    pageSize,
  };
}

export async function getReconciliationBatch(batchId: number, status = "EXCEPTION") {
  const [batchRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM reconciliation_batches WHERE id = ? LIMIT 1`, [batchId]);
  if (!batchRows[0]) return null;
  const whereStatus = status === "ALL" ? "" : status === "EXCEPTION" ? "AND match_status IN ('SELISIH_NOMINAL','NEED_REVIEW','TIDAK_ADA_DI_PROVIDER','TIDAK_ADA_DI_INTERNAL')" : "AND match_status = ?";
  const params: Array<string | number> = status === "ALL" || status === "EXCEPTION" ? [batchId] : [batchId, status];
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM reconciliation_items WHERE batch_id = ? ${whereStatus} ORDER BY FIELD(match_status, 'SELISIH_NOMINAL','TIDAK_ADA_DI_PROVIDER','TIDAK_ADA_DI_INTERNAL','NEED_REVIEW','RESOLVED','IGNORED','MATCH'), id ASC LIMIT 500`,
    params
  );
  const row = batchRows[0];
  return {
    batch: {
      id: Number(row.id),
      provider: String(row.provider),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      loketCode: row.loket_code ? String(row.loket_code) : null,
      providerImportId: row.provider_import_id ? Number(row.provider_import_id) : null,
      status: String(row.status),
      totalItems: Number(row.total_items || 0),
      matchCount: Number(row.match_count || 0),
      exceptionCount: Number(row.exception_count || 0),
      totalInternal: Number(row.total_internal || 0),
      totalProvider: Number(row.total_provider || 0),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
    },
    items: itemRows.map((item) => ({
      id: Number(item.id),
      transactionCode: item.transaction_code ? String(item.transaction_code) : null,
      customerId: item.customer_id ? String(item.customer_id) : null,
      customerName: item.customer_name ? String(item.customer_name) : null,
      productCode: item.product_code ? String(item.product_code) : null,
      periodLabel: item.period_label ? String(item.period_label) : null,
      loketCode: item.loket_code ? String(item.loket_code) : null,
      loketName: item.loket_name ? String(item.loket_name) : null,
      internalTotal: Number(item.internal_total || 0),
      providerTotal: Number(item.provider_total || 0),
      differenceAmount: Number(item.difference_amount || 0),
      matchStatus: String(item.match_status),
      note: item.note ? String(item.note) : null,
      resolvedBy: item.resolved_by ? String(item.resolved_by) : null,
      resolvedAt: item.resolved_at ? String(item.resolved_at) : null,
    })),
  };
}

export async function updateReconciliationItem(params: {
  batchId: number;
  itemId: number;
  status: ReconciliationItemStatus;
  note?: string | null;
  actorUsername: string;
  actorRole?: string | null;
  actorIp?: string | null;
}) {
  const resolved = params.status === "RESOLVED" || params.status === "IGNORED";
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE reconciliation_items
        SET match_status = ?,
            note = COALESCE(?, note),
            resolved_by = CASE WHEN ? THEN ? ELSE resolved_by END,
            resolved_at = CASE WHEN ? THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
      WHERE id = ? AND batch_id = ?`,
    [params.status, params.note || null, resolved ? 1 : 0, params.actorUsername, resolved ? 1 : 0, params.itemId, params.batchId]
  );
  if (result.affectedRows === 0) throw new Error("Item rekonsiliasi tidak ditemukan pada batch ini");

  await auditLog({
    actorType: "user",
    actorUsername: params.actorUsername,
    actorRole: params.actorRole || null,
    actorIp: params.actorIp || null,
    action: "RECONCILIATION_ITEM_UPDATE",
    entityType: "reconciliation_item",
    entityId: params.itemId,
    after: { status: params.status, note: params.note || null },
  });
}
