// Data inbox persetujuan versi mobile (admin & supervisor). Hanya MEMBACA dan MEMANGGIL
// API persetujuan yang sudah ada — aturan maker-checker tetap di server:
//   - Review transaksi (/api/transaksi/review): SUCCESS langsung berlaku; FAILED (refund)
//     wajib disetujui user lain.
//   - Pembatalan (/api/transaksi/pembatalan): pengaju ≠ penyetuju.
//   - Setoran kasir (/api/verifikasi-kasir): terima / tolak / setujui buka ulang.
import { localYmd } from "./products";

export interface ReviewRequest {
  id: number;
  decision: "SUCCESS" | "FAILED";
  evidence: string;
  note: string | null;
  status: string;
  requestedBy: string;
  requestedAt: string;
}

export interface ReviewQueueItem {
  transactionCode: string;
  provider: string;
  serviceType: string | null;
  productCode: string | null;
  loketCode: string | null;
  loketName: string | null;
  username: string | null;
  customerId: string;
  customerName: string | null;
  periods: string[];
  itemCount: number;
  totalAmount: number;
  heldAmount: number;
  adviceAttempts: number;
  idTrx: string | null;
  createdAt: string;
  lastError: string | null;
  pendingRequest: ReviewRequest | null;
}

export interface VoidRequest {
  id: number;
  transactionCode: string;
  provider: string;
  loketCode: string | null;
  customerId: string;
  customerName: string | null;
  totalAmount: number;
  refundAmount: number;
  refundBasis: string;
  reason: string;
  providerReference: string | null;
  status: string;
  warnings: string[];
  requestedBy: string;
  requestedAt: string;
}

export interface CashierClosing {
  id: number;
  businessDate: string;
  loketCode: string;
  loketName: string | null;
  username: string;
  openingCash: number;
  systemCashTotal: number;
  countedCashTotal: number;
  retainedCash: number;
  depositTotal: number;
  discrepancyAmount: number;
  discrepancyReasonCode: string | null;
  cashierNote: string | null;
  discrepancyNote: string | null;
  proofReference: string | null;
  status: string;
  submittedAt: string | null;
  reopenRequestedAt: string | null;
  reopenRequestedBy: string | null;
  reopenRequestNote: string | null;
}

export interface OpenReport {
  id: number;
  multiPaymentCode: string;
  customerName: string | null;
  customerId: string | null;
  categoryLabel: string;
  status: string;
  awaiting: string;
  reportedBy: string;
  assignedTo: string | null;
  loketCode: string | null;
  totalAmount: number;
  lastMessageAt: string;
}

export interface ApprovalInbox {
  reports: OpenReport[]; // laporan masalah dari agen yang masih terbuka
  reviews: ReviewQueueItem[];
  voids: VoidRequest[];
  closings: CashierClosing[]; // setoran SUBMITTED + permintaan buka ulang
  dates: string[];
  errors: string[];
}

/** Tanggal setoran yang diperiksa: hari ini & kemarin (API verifikasi hanya per tanggal). */
export function closingDates(): string[] {
  const d = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return [localYmd(d), localYmd(y)];
}

async function getJson<T>(url: string, pick: (j: Record<string, unknown>) => T, errors: string[], label: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      errors.push(`${label}: ${j.error || `HTTP ${res.status}`}`);
      return null;
    }
    return pick(j);
  } catch {
    errors.push(`${label}: koneksi terputus`);
    return null;
  }
}

/** Ambil semua item inbox. Dipakai halaman inbox dan badge jumlah. */
export async function fetchApprovalInbox(): Promise<ApprovalInbox> {
  const errors: string[] = [];
  const dates = closingDates();
  // rbac-check: admin, supervisor
  const reviewP = getJson("/api/transaksi/review?view=queue", (j) => (j.data as ReviewQueueItem[]) || [], errors, "Review");
  // rbac-check: admin, supervisor
  const voidP = getJson("/api/transaksi/pembatalan?status=PENDING", (j) => (j.data as VoidRequest[]) || [], errors, "Pembatalan");
  const closingPs = dates.flatMap((date) =>
    ["SUBMITTED", "VERIFIED"].map((status) =>
      // rbac-check: admin, supervisor
      getJson(`/api/verifikasi-kasir?businessDate=${date}&status=${status}`, (j) => (j.items as CashierClosing[]) || [], errors, "Setoran")
    )
  );
  // rbac-check: admin, supervisor
  const reportP = getJson("/api/laporan-transaksi?status=OPEN", (j) => (j.reports as OpenReport[]) || [], errors, "Laporan");
  const [reports, reviews, voids, ...closingLists] = await Promise.all([reportP, reviewP, voidP, ...closingPs]);
  const closings = (closingLists.flat().filter(Boolean) as CashierClosing[]).filter(
    // SUBMITTED menunggu verifikasi; VERIFIED hanya bila ada permintaan buka ulang
    (c) => c.status === "SUBMITTED" || isReopenPending(c)
  );
  const seen = new Set<number>();
  return {
    reports: (reports as OpenReport[] | null) || [],
    reviews: (reviews as ReviewQueueItem[] | null) || [],
    voids: (voids as VoidRequest[] | null) || [],
    closings: closings.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))),
    dates,
    errors,
  };
}

export function isReopenPending(c: CashierClosing): boolean {
  return !!c.reopenRequestedAt && c.status !== "DRAFT";
}

/** Item yang bisa DITINDAKLANJUTI oleh `me` (pengajuan sendiri tidak dihitung). */
export function actionableCount(inbox: ApprovalInbox, me: string) {
  const review = inbox.reviews.filter((r) => !r.pendingRequest || r.pendingRequest.requestedBy !== me).length;
  const voids = inbox.voids.filter((v) => v.requestedBy !== me).length;
  const setoran = inbox.closings.filter((c) => c.username !== me).length;
  // Laporan: yang menunggu tanggapan admin/supervisor (bukan laporan buatan sendiri)
  const masalah = inbox.reports.filter((r) => r.awaiting === "HANDLER" && r.reportedBy !== me).length;
  return { review, voids, setoran, masalah, total: review + voids + setoran + masalah };
}
