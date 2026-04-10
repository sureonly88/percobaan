import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { normalizeRole } from "@/lib/rbac";
import { parsePdamNumber } from "@/lib/pdam-api";

type ReconciliationProvider = "pdam" | "lunasin";
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
    { label: "Tanggal Bayar", getValue: (row) => row.common.transactionDate },
    { label: "Kode Transaksi", getValue: (row) => row.common.transactionCode },
    { label: "Kode Loket", getValue: (row) => row.common.loketCode },
    { label: "Nama Loket", getValue: (row) => row.common.loketName },
    { label: "Username", getValue: (row) => row.common.username },
    { label: "ID Pelanggan", getValue: (row) => row.common.customerId },
    { label: "Nama Pelanggan", getValue: (row) => row.common.customerName },
    { label: "Periode", getValue: (row) => row.common.periodLabel },
    { label: "Tagihan", getValue: (row) => row.common.amount },
    { label: "Admin", getValue: (row) => row.common.adminFee },
    { label: "Total Bayar", getValue: (row) => row.common.total },
  ];

  return buildExcelWorkbookXml([
    {
      name: "PDAM Native",
      columns: [...commonColumns, ...detailColumns(exportRows, PDAM_DETAIL_LABELS, PDAM_DETAIL_ORDER)],
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