import {
  PaymentProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionItem,
  ProviderExecutionResult,
} from "@/lib/multipay/types";

type LegacyLunasinBill = {
  idpel: string;
  nama: string;
  kodeProduk: string;
  idTrx: string;
  total: number;
  admin: number;
  rpAmount: number;
  periode?: string;
  tarif?: string;
  daya?: string;
  jumBill?: string;
  input2?: string;
  input3?: string;
};

function toLegacyLunasinBill(item: ProviderExecutionItem): LegacyLunasinBill | null {
  const metadata = item.metadata || {};
  const kodeProduk = String(item.productCode || metadata.kodeProduk || "");
  const idTrx = String(item.providerRef || metadata.idTrx || "");
  if (!kodeProduk || !idTrx) return null;

  return {
    idpel: item.customerId,
    nama: item.customerName || String(metadata.nama || ""),
    kodeProduk,
    idTrx,
    total: item.total,
    admin: item.adminFee,
    rpAmount: item.amount,
    periode: String(item.periodLabel || metadata.periode || ""),
    tarif: String(metadata.tarif || ""),
    daya: String(metadata.daya || ""),
    jumBill: String(metadata.jumBill || "1"),
    input2: String(metadata.input2 || ""),
    input3: String(metadata.input3 || ""),
  };
}

function buildHeaders(ctx: ProviderExecutionContext): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(ctx.cookieHeader ? { cookie: ctx.cookieHeader } : {}),
  };
}

function mapLunasinStatus(result: Record<string, unknown>) {
  const finalStatus = String(result.finalStatus || "").toUpperCase();
  const errorCode = String(result.errorCode || "");
  if (result.success) return "SUCCESS" as const;
  if (finalStatus === "PENDING" || errorCode === "LUNASIN_PENDING") return "PENDING_ADVICE" as const;
  return "FAILED" as const;
}

function mapLegacyResponseToResults(items: ProviderExecutionItem[], response: { results?: Array<Record<string, unknown>>; }) {
  const used = new Set<string>();
  const rawResults = response.results || [];

  return rawResults.map<ProviderExecutionResult>((result) => {
    const customerId = String(result.idpel || "");
    const kodeProduk = String(result.kodeProduk || "");
    const matched = items.find((item) => {
      if (used.has(item.itemCode)) return false;
      return item.customerId === customerId && String(item.productCode || "") === kodeProduk;
    });

    const itemCode = matched?.itemCode || `LUNASIN-${customerId}-${kodeProduk}`;
    used.add(itemCode);
    const status = mapLunasinStatus(result);

    return {
      itemCode,
      provider: "LUNASIN",
      serviceType: matched?.serviceType || "LUNASIN_SERVICE",
      customerId,
      customerName: String(result.nama || matched?.customerName || ""),
      success: Boolean(result.success),
      status,
      transactionCode: result.transactionCode ? String(result.transactionCode) : undefined,
      errorCode: result.errorCode ? String(result.errorCode) : undefined,
      error: result.error ? String(result.error) : undefined,
      providerData: (result.providerData as Record<string, unknown> | undefined) || {
        periode: result.periode,
        adviceAttempts: result.adviceAttempts,
        finalStatus: result.finalStatus,
      },
    };
  });
}

export class LunasinProviderAdapter implements PaymentProviderAdapter {
  readonly provider = "LUNASIN" as const;

  async pay(items: ProviderExecutionItem[], ctx: ProviderExecutionContext): Promise<ProviderExecutionResult[]> {
    const bills = items.map(toLegacyLunasinBill);
    if (bills.some((bill) => !bill)) {
      return items.map((item) => ({
        itemCode: item.itemCode,
        provider: this.provider,
        serviceType: item.serviceType,
        customerId: item.customerId,
        customerName: item.customerName,
        success: false,
        status: "FAILED",
        errorCode: "MULTIPAY_INVALID_LUNASIN_ITEM",
        error: "Data item Lunasin belum lengkap untuk diproses multipay",
      }));
    }

    const response = await fetch(`${ctx.baseUrl}/api/pembayaran/lunasin/pay`, {
      method: "POST",
      headers: buildHeaders(ctx),
      cache: "no-store",
      body: JSON.stringify({
        bills,
        loketCode: ctx.loketCode,
        loketName: ctx.loketName,
        biayaAdmin: 0,
        idempotencyKey: `${ctx.idempotencyKey}-LUNASIN`,
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
        errorCode: payload.errorCode || "MULTIPAY_LUNASIN_REQUEST_FAILED",
        error: payload.error || "Pembayaran Lunasin gagal diproses dari orchestrator multipay",
      }));
    }

    return mapLegacyResponseToResults(items, payload);
  }
}