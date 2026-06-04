import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { pdamInquiry, parsePdamNumber } from "@/lib/pdam-api";
import { lunasinInquiry } from "@/lib/lunasin-api";
import { DATA_PACKAGES, PULSA_NOMINALS } from "@/data/lunasin-products";
import type { PaymentLinkItemInput } from "./types";

export type SelfServiceCode =
  | "pdam-native"
  | "pln-postpaid"
  | "pln-prepaid"
  | "pln-nonrek"
  | "bpjs-kesehatan"
  | "telkom-telepon"
  | "pdam-kota-banjarmasin"
  | "pulsa"
  | "paket-data";

export const SELF_SERVICE_PRODUCTS: Array<{ code: SelfServiceCode; label: string; providerLabel: string }> = [
  { code: "pdam-native", label: "PDAM", providerLabel: "PDAM" },
  { code: "pln-postpaid", label: "PLN Pascabayar", providerLabel: "Lunasin" },
  { code: "pln-prepaid", label: "PLN Token", providerLabel: "Lunasin" },
  { code: "pln-nonrek", label: "PLN Non-Rekening", providerLabel: "Lunasin" },
  { code: "bpjs-kesehatan", label: "BPJS Kesehatan", providerLabel: "Lunasin" },
  { code: "telkom-telepon", label: "Telkom", providerLabel: "Lunasin" },
  { code: "pdam-kota-banjarmasin", label: "PDAM Banjarmasin", providerLabel: "Lunasin" },
  { code: "pulsa", label: "Pulsa", providerLabel: "Lunasin" },
  { code: "paket-data", label: "Paket Data", providerLabel: "Lunasin" },
];

export interface SelfServiceProductOptions {
  operator?: string;
  nominal?: number;
  packageCode?: string;
}

export interface SelfServiceLoket {
  loketCode: string;
  loketName: string;
  biayaAdmin: number;
  plnAdminTier: number;
  maxPdamTagihan: number | null;
}

export interface SelfServiceInquiryResult {
  service: SelfServiceCode;
  serviceLabel: string;
  customerId: string;
  customerName: string;
  loket: SelfServiceLoket;
  totalAmount: number;
  totalAdmin: number;
  grandTotal: number;
  items: PaymentLinkItemInput[];
}

function assertService(service: string): asserts service is SelfServiceCode {
  if (!SELF_SERVICE_PRODUCTS.some((product) => product.code === service)) {
    throw new Error("Layanan self-service tidak tersedia");
  }
}

function getServiceLabel(service: SelfServiceCode) {
  return SELF_SERVICE_PRODUCTS.find((product) => product.code === service)?.label || service;
}

export async function getSelfServiceLoket(): Promise<SelfServiceLoket> {
  const configuredCode = process.env.SELF_SERVICE_LOKET_CODE || process.env.PUBLIC_PAYMENT_LOKET_CODE || "";
  const where = configuredCode ? "WHERE loket_code = ?" : "WHERE status = 'aktif'";
  const params = configuredCode ? [configuredCode] : [];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT loket_code, nama, biaya_admin, pln_admin_tier, max_pdam_tagihan
       FROM lokets
       ${where}
       ORDER BY id ASC
       LIMIT 1`,
    params
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Loket self-service belum dikonfigurasi");
  }

  return {
    loketCode: String(row.loket_code),
    loketName: String(row.nama || row.loket_code),
    biayaAdmin: Number(row.biaya_admin || 0),
    plnAdminTier: Number(row.pln_admin_tier || 3000),
    maxPdamTagihan: row.max_pdam_tagihan == null ? null : Number(row.max_pdam_tagihan),
  };
}

function getLunasinServiceType(kodeProduk: string): string {
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

function resolveLunasinProduct(service: SelfServiceCode, loket: SelfServiceLoket, options: SelfServiceProductOptions) {
  if (service === "pln-postpaid" || service === "pln-prepaid" || service === "pln-nonrek") {
    const input2 = service === "pln-prepaid" ? String(resolveTokenNominal(options.nominal)) : "";
    return { kodeProduk: `${service}-${loket.plnAdminTier}`, input2 };
  }

  if (service === "pulsa") {
    const operator = String(options.operator || "").trim().toLowerCase();
    const nominal = Number(options.nominal || 0);
    if (!operator || !PULSA_NOMINALS[operator]) throw new Error("Operator pulsa tidak valid");
    if (!PULSA_NOMINALS[operator].includes(nominal)) throw new Error("Nominal pulsa tidak valid");
    return { kodeProduk: `pulsa-${operator}-${nominal}K`, input2: "" };
  }

  if (service === "paket-data") {
    const operator = String(options.operator || "").trim().toLowerCase();
    const packageCode = String(options.packageCode || "").trim();
    if (!operator || !DATA_PACKAGES[operator]) throw new Error("Operator paket data tidak valid");
    if (!DATA_PACKAGES[operator].some((item) => item.code === packageCode)) throw new Error("Paket data tidak valid");
    return { kodeProduk: packageCode, input2: "" };
  }

  return { kodeProduk: service, input2: "" };
}

function resolveTokenNominal(value: number | undefined): number {
  const nominal = Number(value || 0);
  const allowed = [20000, 50000, 100000, 200000, 500000, 1000000];
  if (!allowed.includes(nominal)) throw new Error("Nominal token PLN tidak valid");
  return nominal;
}

function getPeriodLabel(kodeProduk: string, data: Record<string, unknown>): string {
  if (kodeProduk.startsWith("bpjs")) return `${data.jum_bill || "1"} Bulan`;
  if (kodeProduk.startsWith("pulsa") || kodeProduk.startsWith("paketdata")) {
    return String(data.nama_produk || data.denom || kodeProduk);
  }
  return String(data.jenis_reg || data.periode || kodeProduk);
}

export async function inquirySelfService(
  serviceRaw: string,
  customerIdRaw: string,
  options: SelfServiceProductOptions = {}
): Promise<SelfServiceInquiryResult> {
  assertService(serviceRaw);
  const service = serviceRaw;
  const customerId = customerIdRaw.trim();
  if (!customerId) throw new Error("Nomor pelanggan wajib diisi");
  if (!/^[a-zA-Z0-9]+$/.test(customerId)) throw new Error("Nomor pelanggan tidak valid");

  const loket = await getSelfServiceLoket();
  const serviceLabel = getServiceLabel(service);

  if (service === "pdam-native") {
    const result = await pdamInquiry(customerId);
    if (loket.maxPdamTagihan !== null && result.items.length > loket.maxPdamTagihan) {
      throw new Error(`Tagihan pelanggan memiliki ${result.items.length} bulan tunggakan, melebihi batas ${loket.maxPdamTagihan} bulan`);
    }

    const items: PaymentLinkItemInput[] = result.items.map((item) => {
      const amount = parsePdamNumber(item.total);
      return {
        provider: "PDAM",
        serviceType: "PDAM_NATIVE",
        customerId,
        customerName: item.nama || customerId,
        productCode: "PDAM_NATIVE",
        periodLabel: item.thbln || "PDAM",
        amount,
        adminFee: loket.biayaAdmin,
        total: amount + loket.biayaAdmin,
        metadata: {
          nama: item.nama || "",
          alamat: item.alamat || "",
          blth: item.thbln || "",
          gol: item.gol || "",
          idgol: item.gol || "",
          harga: parsePdamNumber(item.harga),
          denda: parsePdamNumber(item.denda),
          materai: parsePdamNumber(item.materai),
          limbah: parsePdamNumber(item.limbah),
          retribusi: parsePdamNumber(item.retribusi),
          standLalu: parsePdamNumber(item.stand_l),
          standKini: parsePdamNumber(item.stand_i),
          subTotal: amount,
          biayaMeter: parsePdamNumber(item.biaya_meter),
          bebanTetap: parsePdamNumber(item.biaya_tetap),
          abodemen: parsePdamNumber(item.byadmin),
          total: amount,
          diskon: parsePdamNumber(item.diskon),
          pakai: parsePdamNumber(item.pakai),
        },
        inquirySnapshot: item as unknown as Record<string, unknown>,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const totalAdmin = items.reduce((sum, item) => sum + item.adminFee, 0);
    return {
      service,
      serviceLabel,
      customerId,
      customerName: items[0]?.customerName || customerId,
      loket,
      totalAmount,
      totalAdmin,
      grandTotal: totalAmount + totalAdmin,
      items,
    };
  }

  const { kodeProduk, input2 } = resolveLunasinProduct(service, loket, options);
  const result = await lunasinInquiry({ idpel: customerId, kodeProduk, input2 });
  const data = result.data;
  const amount = Number(data.rp_amount || 0);
  const adminFee = Number(data.rp_admin || 0);
  const total = Number(data.rp_total || amount + adminFee);
  const item: PaymentLinkItemInput = {
    provider: "LUNASIN",
    serviceType: getLunasinServiceType(kodeProduk),
    customerId: data.idpel || customerId,
    customerName: data.nama || customerId,
    productCode: kodeProduk,
    providerRef: result.idTrx,
    periodLabel: getPeriodLabel(kodeProduk, data),
    amount,
    adminFee,
    total,
    metadata: {
      nama: data.nama || "",
      kodeProduk,
      idTrx: result.idTrx,
      periode: data.periode || "",
      tarif: data.tarif || "",
      daya: data.daya || "",
      jumBill: data.jum_bill || "1",
      input2,
      detail: data.detail || [],
      standMeter: data.stand_meter || "",
      noreg: data.noreg || "",
      tgl_reg: data.tgl_reg || "",
      jenis_reg: data.jenis_reg || "",
      nova: data.nova || "",
      nova_kepala_keluarga: data.nova_kepala_keluarga || "",
      jum_peserta: data.jum_peserta || "",
      kode_cabang: data.kode_cabang || "",
      nama_cabang: data.nama_cabang || "",
      sisa: data.sisa || "",
      refnum: data.refnum || "",
      tgl_lunas: data.tgl_lunas || "",
      nomor: data.nomor || "",
      denom: data.denom || "",
      nama_produk: data.nama_produk || "",
      serial_number: data.serial_number || "",
      masa_berlaku: data.masa_berlaku || "",
    },
    inquirySnapshot: result.rawResponse as unknown as Record<string, unknown>,
  };

  return {
    service,
    serviceLabel,
    customerId: item.customerId,
    customerName: item.customerName || customerId,
    loket,
    totalAmount: amount,
    totalAdmin: adminFee,
    grandTotal: total,
    items: [item],
  };
}
