import { ACCOUNT } from "./accounts";
import {
  hasJournalForSource,
  postJournalSafe,
  type PostJournalResult,
} from "./journal";

export interface PostPaymentSuccessInput {
  /** Unique key transaksi — dipakai sebagai source_id untuk idempotensi posting */
  idempotencyKey: string;
  provider: string;
  serviceType?: string | null;
  loketCode: string;
  /** Nilai pokok tagihan (yang dipotong dari saldo provider) */
  amount: number;
  /** Biaya admin loket (pendapatan untuk loket) */
  adminFee: number;
  /** Total bayar pelanggan = amount + adminFee */
  total: number;
  customerName?: string | null;
  customerId?: string | null;
  productCode?: string | null;
  username?: string | null;
  paidAt?: Date | string | null;
}

/**
 * Posting jurnal saat pembayaran tagihan SUKSES.
 *
 * Konsep akuntansi:
 *   Pelanggan bayar cash ke kasir (uang fisik masuk ke loket).
 *   Saldo deposit loket di provider dipotong sebesar amount.
 *   Biaya admin = pendapatan loket.
 *
 * Jurnal:
 *   Dr Kas Loket                       (total)
 *      Cr Saldo Deposit Provider              (amount)
 *      Cr Pendapatan Biaya Admin              (adminFee)
 */
export async function postPaymentSuccess(
  input: PostPaymentSuccessInput
): Promise<PostJournalResult | null> {
  if (input.total <= 0) return null;

  // Idempotensi: skip jika sudah ada jurnal aktif untuk transaksi ini
  if (await hasJournalForSource("PAYMENT", input.idempotencyKey)) {
    return null;
  }

  const dims = {
    dimLoket: input.loketCode,
    dimProvider: input.provider,
    dimService: input.serviceType ?? null,
    dimProduct: input.productCode ?? null,
  };

  const memo = [input.customerName, input.customerId].filter(Boolean).join(" | ") || null;

  const lines = [
    {
      accountCode: ACCOUNT.KAS_LOKET,
      debit: input.total,
      memo,
      ...dims,
    },
  ];

  if (input.amount > 0) {
    lines.push({
      accountCode: ACCOUNT.SALDO_PROVIDER,
      credit: input.amount,
      memo,
      ...dims,
    } as never);
  }

  if (input.adminFee > 0) {
    lines.push({
      accountCode: ACCOUNT.PENDAPATAN_ADMIN,
      credit: input.adminFee,
      memo,
      ...dims,
    } as never);
  }

  return postJournalSafe({
    entryDate: input.paidAt ?? new Date(),
    description: `Pembayaran ${input.provider}${
      input.serviceType ? "/" + input.serviceType : ""
    } — ${input.customerName ?? input.customerId ?? input.idempotencyKey}`,
    sourceType: "PAYMENT",
    sourceId: input.idempotencyKey,
    referenceNo: input.idempotencyKey,
    loketCode: input.loketCode,
    provider: input.provider,
    serviceType: input.serviceType ?? null,
    createdBy: input.username ?? null,
    lines,
  });
}

export interface PostSaldoMutationInput {
  /** Unique request_code dari tabel request_saldo */
  requestCode: string;
  loketCode: string;
  /** Nilai positif = top-up; negatif = pengurangan */
  nominal: number;
  description?: string | null;
  username?: string | null;
  at?: Date | string | null;
}

/**
 * Posting jurnal saat saldo loket di-top-up (atau dikurangi) oleh admin.
 *
 * Top-up (nominal > 0): Dr Saldo Deposit Provider, Cr Modal Disetor
 * Pengurangan (nominal < 0): kebalikan
 */
export async function postSaldoMutation(
  input: PostSaldoMutationInput
): Promise<PostJournalResult | null> {
  if (!input.nominal) return null;
  if (await hasJournalForSource("TOPUP", input.requestCode)) return null;

  const absNominal = Math.abs(input.nominal);
  const isTopUp = input.nominal > 0;

  const debitAccount = isTopUp ? ACCOUNT.SALDO_PROVIDER : ACCOUNT.MODAL_DISETOR;
  const creditAccount = isTopUp ? ACCOUNT.MODAL_DISETOR : ACCOUNT.SALDO_PROVIDER;

  return postJournalSafe({
    entryDate: input.at ?? new Date(),
    description: `${isTopUp ? "Top-up" : "Pengurangan"} saldo loket ${input.loketCode} — ${
      input.description ?? input.requestCode
    }`,
    sourceType: "TOPUP",
    sourceId: input.requestCode,
    referenceNo: input.requestCode,
    loketCode: input.loketCode,
    createdBy: input.username ?? null,
    lines: [
      { accountCode: debitAccount, debit: absNominal, dimLoket: input.loketCode },
      { accountCode: creditAccount, credit: absNominal, dimLoket: input.loketCode },
    ],
  });
}

export interface PostSettlementApprovalInput {
  batchCode: string;
  loketCode: string;
  /** Net payable = total uang yang harus disetor loket ke pusat */
  netPayable: number;
  username?: string | null;
  at?: Date | string | null;
}

/**
 * Posting jurnal saat settlement batch DIAPPROVE.
 *
 * Jurnal:
 *   Dr Hutang Settlement ke Loket (2101)    netPayable
 *      Cr Kas Loket (1101)                          netPayable
 *
 * Hutang ke loket berkurang karena kas loket akan dipindah ke kas pusat
 * (saat PAID, posting tambahan: Dr Kas Pusat, Cr Hutang Settlement — opsional).
 */
export async function postSettlementApproval(
  input: PostSettlementApprovalInput
): Promise<PostJournalResult | null> {
  if (input.netPayable <= 0) return null;
  if (await hasJournalForSource("SETTLEMENT", input.batchCode)) return null;

  return postJournalSafe({
    entryDate: input.at ?? new Date(),
    description: `Settlement batch ${input.batchCode} disetujui — loket ${input.loketCode}`,
    sourceType: "SETTLEMENT",
    sourceId: input.batchCode,
    referenceNo: input.batchCode,
    loketCode: input.loketCode,
    createdBy: input.username ?? null,
    lines: [
      {
        accountCode: ACCOUNT.HUTANG_SETTLEMENT,
        debit: input.netPayable,
        dimLoket: input.loketCode,
      },
      {
        accountCode: ACCOUNT.KAS_LOKET,
        credit: input.netPayable,
        dimLoket: input.loketCode,
      },
    ],
  });
}
