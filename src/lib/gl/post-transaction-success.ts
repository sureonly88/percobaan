import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { postPaymentSuccess } from "@/lib/gl/posting-rules";
import { recordCommissionsForTransactionCode } from "@/lib/commission/record";

interface TransactionItemRow extends RowDataPacket {
  status: string;
  provider: string;
  service_type: string | null;
  product_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  amount: number;
  admin_fee: number;
  total: number;
  loket_code: string | null;
}

const UNRESOLVED_STATUSES = new Set(["PENDING", "PENDING_ADVICE", "PENDING_REVIEW"]);

export interface TransactionSuccessEffectsResult {
  /** Jumlah item SUCCESS pada transaksi */
  successItems: number;
  /** true bila jurnal GL ditunda karena masih ada item yang belum final */
  glDeferred: boolean;
}

/**
 * Posting jurnal GL & komisi untuk transaksi yang menjadi SUCCESS di luar alur pay
 * (mis. lewat advice). Best-effort dan idempoten — tidak pernah melempar error:
 * - Komisi dicatat per item SUCCESS (idempoten per item), jadi aman dipanggil berulang.
 * - Jurnal GL satu entri per transaction_code (source PAYMENT, sama seperti alur pay).
 *   Jurnal ditunda selama masih ada item PENDING / PENDING_ADVICE / PENDING_REVIEW, supaya
 *   totalnya mencakup semua periode yang akhirnya sukses — posting berikutnya untuk
 *   transaction_code yang sama di-skip oleh `hasJournalForSource`.
 */
export async function postTransactionSuccessEffects(
  transactionCode: string,
  actor: string,
  options: {
    /** Dimensi layanan jurnal; samakan dengan alur pay provider (mis. "PDAM_TAGIHAN"). */
    serviceType?: string;
    /** Pakai product_code item sebagai dimensi layanan (alur pay Lunasin memakai kode produk). */
    serviceTypeFromProductCode?: boolean;
    /**
     * Nominal otoritatif dari provider (mis. rp_total/rp_amount/rp_admin Lunasin). Nilai 0 atau
     * kosong jatuh ke nilai item, dengan aturan fallback yang sama seperti alur pay Lunasin.
     */
    providerAmounts?: { total?: number; amount?: number; adminFee?: number };
  } = {},
): Promise<TransactionSuccessEffectsResult> {
  let items: TransactionItemRow[] = [];
  try {
    const [rows] = await pool.query<TransactionItemRow[]>(
      `SELECT i.status, i.provider, i.service_type, i.product_code,
              i.customer_id, i.customer_name, i.amount, i.admin_fee, i.total,
              r.loket_code
         FROM multi_payment_items i
         JOIN multi_payment_requests r ON r.id = i.multi_payment_id
        WHERE i.transaction_code = ?
        ORDER BY i.id`,
      [transactionCode]
    );
    items = rows;
  } catch (err) {
    console.error("[post-transaction-success] Gagal memuat item transaksi:", err);
    return { successItems: 0, glDeferred: false };
  }

  const successItems = items.filter((i) => i.status === "SUCCESS");
  if (successItems.length === 0) return { successItems: 0, glDeferred: false };

  const glDeferred = items.some((i) => UNRESOLVED_STATUSES.has(i.status));
  if (!glDeferred) {
    const itemAmount = successItems.reduce((s, i) => s + Number(i.amount || 0), 0);
    const itemAdmin = successItems.reduce((s, i) => s + Number(i.admin_fee || 0), 0);
    const itemTotal = successItems.reduce((s, i) => s + Number(i.total || 0), 0);
    let amount = itemAmount;
    let adminFee = itemAdmin;
    let total = itemTotal;
    const p = options.providerAmounts;
    if (p) {
      total = (p.total ?? 0) > 0 ? Number(p.total) : itemTotal;
      amount = (p.amount ?? 0) > 0 ? Number(p.amount) : Math.max(0, total - itemAdmin);
      adminFee = (p.adminFee ?? 0) > 0 ? Number(p.adminFee) : Math.max(0, total - amount);
    }
    const serviceType = options.serviceType
      ?? (options.serviceTypeFromProductCode ? successItems[0].product_code : null)
      ?? successItems[0].service_type;
    try {
      await postPaymentSuccess({
        idempotencyKey: transactionCode,
        provider: successItems[0].provider,
        serviceType,
        productCode: successItems[0].product_code,
        loketCode: String(successItems[0].loket_code || ""),
        amount,
        adminFee,
        total,
        customerName: successItems[0].customer_name,
        customerId: successItems[0].customer_id,
        username: actor,
      });
    } catch (err) {
      console.error("[post-transaction-success] Posting GL gagal:", err);
    }
  }

  try {
    await recordCommissionsForTransactionCode(transactionCode);
  } catch (err) {
    console.error("[post-transaction-success] Pencatatan komisi gagal:", err);
  }

  return { successItems: successItems.length, glDeferred };
}
