import {
  PaymentProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionItem,
  ProviderExecutionResult,
} from "@/lib/multipay/types";

type LegacyPdamBill = {
  idpel: string;
  nama: string;
  alamat: string;
  blth: string;
  gol: string;
  harga: number;
  denda: number;
  materai: number;
  limbah: number;
  retribusi: number;
  standLalu: number;
  standKini: number;
  subTotal: number;
  biayaMeter: number;
  bebanTetap: number;
  abodemen: number;
  total: number;
  diskon: number;
};

function toLegacyPdamBill(item: ProviderExecutionItem): LegacyPdamBill | null {
  const metadata = item.metadata || {};
  const blth = String(metadata.blth || item.periodLabel || "");
  if (!blth) return null;

  return {
    idpel: item.customerId,
    nama: item.customerName || String(metadata.nama || ""),
    alamat: String(metadata.alamat || ""),
    blth,
    gol: String(metadata.gol || ""),
    harga: Number(metadata.harga || item.amount || 0),
    denda: Number(metadata.denda || 0),
    materai: Number(metadata.materai || 0),
    limbah: Number(metadata.limbah || 0),
    retribusi: Number(metadata.retribusi || 0),
    standLalu: Number(metadata.standLalu || 0),
    standKini: Number(metadata.standKini || 0),
    subTotal: Number(metadata.subTotal || item.amount || 0),
    biayaMeter: Number(metadata.biayaMeter || 0),
    bebanTetap: Number(metadata.bebanTetap || 0),
    abodemen: Number(metadata.abodemen || 0),
    total: Number(metadata.total || item.amount || 0),
    diskon: Number(metadata.diskon || 0),
  };
}

function buildHeaders(ctx: ProviderExecutionContext): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(ctx.cookieHeader ? { cookie: ctx.cookieHeader } : {}),
  };
}

function mapLegacyResponseToResults(items: ProviderExecutionItem[], response: { results?: Array<Record<string, unknown>>; error?: string; }) {
  const used = new Set<string>();
  const rawResults = response.results || [];

  return rawResults.map<ProviderExecutionResult>((result) => {
    const customerId = String(result.idpel || "");
    const blth = String(result.blth || "");
    const matched = items.find((item) => {
      if (used.has(item.itemCode)) return false;
      const itemBlth = String(item.metadata?.blth || item.periodLabel || "");
      return item.customerId === customerId && itemBlth === blth;
    });

    const itemCode = matched?.itemCode || `PDAM-${customerId}-${blth}`;
    used.add(itemCode);

    return {
      itemCode,
      provider: "PDAM",
      serviceType: matched?.serviceType || "PDAM_NATIVE",
      customerId,
      customerName: String(result.nama || matched?.customerName || ""),
      success: Boolean(result.success),
      status: result.success ? "SUCCESS" : "FAILED",
      transactionCode: result.transactionCode ? String(result.transactionCode) : undefined,
      errorCode: result.errorCode ? String(result.errorCode) : undefined,
      error: result.error ? String(result.error) : undefined,
      providerData: {
        blth,
        attempts: result.attempts,
      },
    };
  });
}

export class PdamProviderAdapter implements PaymentProviderAdapter {
  readonly provider = "PDAM" as const;

  async pay(items: ProviderExecutionItem[], ctx: ProviderExecutionContext): Promise<ProviderExecutionResult[]> {
    const bills = items.map(toLegacyPdamBill);
    if (bills.some((bill) => !bill)) {
      return items.map((item) => ({
        itemCode: item.itemCode,
        provider: this.provider,
        serviceType: item.serviceType,
        customerId: item.customerId,
        customerName: item.customerName,
        success: false,
        status: "FAILED",
        errorCode: "MULTIPAY_INVALID_PDAM_ITEM",
        error: "Data item PDAM belum lengkap untuk diproses multipay",
      }));
    }

    const response = await fetch(`${ctx.baseUrl}/api/pembayaran/pay`, {
      method: "POST",
      headers: buildHeaders(ctx),
      cache: "no-store",
      body: JSON.stringify({
        bills,
        loketCode: ctx.loketCode,
        loketName: ctx.loketName,
        biayaAdmin: items[0]?.adminFee || 0,
        idempotencyKey: `${ctx.idempotencyKey}-PDAM`,
        skipMultiPayment: true,
      }),
    });

    const payload = (await response.json()) as { results?: Array<Record<string, unknown>>; error?: string; errorCode?: string };
    if (!response.ok) {
      return items.map((item) => ({
        itemCode: item.itemCode,
        provider: this.provider,
        serviceType: item.serviceType,
        customerId: item.customerId,
        customerName: item.customerName,
        success: false,
        status: "FAILED",
        errorCode: payload.errorCode || "MULTIPAY_PDAM_REQUEST_FAILED",
        error: payload.error || "Pembayaran PDAM gagal diproses dari orchestrator multipay",
      }));
    }

    return mapLegacyResponseToResults(items, payload);
  }
}