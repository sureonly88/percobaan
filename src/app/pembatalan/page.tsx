"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb } from "@/ui";

type VoidStatus = "PENDING" | "APPROVED" | "REJECTED";

interface TransactionVoid {
  id: number;
  transactionCode: string;
  provider: string;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  itemIds: number[];
  totalAmount: number;
  refundAmount: number;
  refundBasis: "LEDGER" | "ITEM_TOTAL" | "NONE";
  reason: string;
  providerReference: string | null;
  status: VoidStatus;
  warnings: string[];
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  glReversalEntryIds: number[];
}

const STATUS_TABS: Array<{ key: VoidStatus; label: string }> = [
  { key: "PENDING", label: "Menunggu" },
  { key: "APPROVED", label: "Disetujui" },
  { key: "REJECTED", label: "Ditolak" },
];

const STATUS_STYLE: Record<VoidStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJECTED: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const REFUND_BASIS_LABEL: Record<TransactionVoid["refundBasis"], string> = {
  LEDGER: "sesuai mutasi saldo tercatat",
  ITEM_TOTAL: "dari total item (data sebelum ledger)",
  NONE: "tidak ada pengembalian",
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount || 0).toLocaleString("id-ID");
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PembatalanPage() {
  const { data: session } = useSession();
  const currentUser = String((session?.user as { username?: string } | undefined)?.username || "");

  const [status, setStatus] = useState<VoidStatus>("PENDING");
  const [rows, setRows] = useState<TransactionVoid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<{ item: TransactionVoid; action: "approve" | "reject" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/transaksi/pembatalan?status=${status}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data");
      setRows(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openReview = (item: TransactionVoid, action: "approve" | "reject") => {
    setReview({ item, action });
    setReviewNote("");
    setReviewError("");
  };

  const submitReview = async () => {
    if (!review) return;
    if (review.action === "reject" && !reviewNote.trim()) {
      setReviewError("Catatan penolakan wajib diisi");
      return;
    }
    setReviewLoading(true);
    setReviewError("");
    try {
      const res = await fetch("/api/transaksi/pembatalan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.item.id, action: review.action, note: reviewNote.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setReviewError(json.error || "Gagal memproses pengajuan");
        return;
      }
      setNotice(`${json.message} — ${review.item.transactionCode}`);
      setReview(null);
      fetchRows();
    } catch {
      setReviewError("Gagal memproses pengajuan");
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Pembatalan Transaksi" }]} />

      <header>
        <h1 className="text-2xl font-bold">Pembatalan Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Transaksi tidak dihapus permanen. Pembatalan yang disetujui mengubah status menjadi VOID, mengembalikan saldo
          loket sesuai mutasi yang tercatat, membuat jurnal pembalik GL, dan membatalkan komisi. Pengajuan harus
          disetujui oleh user selain pengaju.
        </p>
      </header>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <span className="material-symbols-outlined text-lg">task_alt</span>
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice("")} title="Tutup">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              status === tab.key
                ? "bg-primary text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            Tidak ada pengajuan pada status ini.
          </div>
        ) : (
          rows.map((item) => {
            const isOwnRequest = item.requestedBy === currentUser;
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold">{item.transactionCode}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[item.status]}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.provider} · {item.loketCode || "-"} · {item.itemIds.length} item
                      </span>
                    </div>
                    <p className="text-sm">
                      <strong>{item.customerName || "-"}</strong> ({item.customerId || "-"})
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">Alasan:</span> {item.reason}
                    </p>
                    {item.providerReference && (
                      <p className="text-xs text-slate-500">Ref. reversal provider: {item.providerReference}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      Diajukan oleh {item.requestedBy} · {formatDateTime(item.requestedAt)}
                      {item.reviewedBy &&
                        ` · ${item.status === "APPROVED" ? "Disetujui" : "Ditolak"} oleh ${item.reviewedBy} · ${formatDateTime(item.reviewedAt)}`}
                    </p>
                    {item.reviewNote && <p className="text-xs text-slate-500">Catatan: {item.reviewNote}</p>}
                  </div>

                  <div className="shrink-0 space-y-1 text-left lg:text-right">
                    <p className="text-xs text-slate-500">Total transaksi</p>
                    <p className="font-bold">{formatRupiah(item.totalAmount)}</p>
                    <p className="text-xs text-slate-500">Saldo dikembalikan</p>
                    <p className="font-bold text-emerald-600">{formatRupiah(item.refundAmount)}</p>
                    <p className="text-[11px] text-slate-400">{REFUND_BASIS_LABEL[item.refundBasis]}</p>
                  </div>
                </div>

                {item.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    {item.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {item.status === "PENDING" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isOwnRequest ? (
                      <p className="text-xs text-slate-500">Pengajuan Anda — harus diproses oleh user lain.</p>
                    ) : (
                      <>
                        <button
                          onClick={() => openReview(item, "approve")}
                          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                        >
                          Setujui Pembatalan
                        </button>
                        <button
                          onClick={() => openReview(item, "reject")}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                        >
                          Tolak
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {review && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReview(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-2 text-lg font-bold">
              {review.action === "approve" ? "Setujui pembatalan?" : "Tolak pengajuan?"}
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              {review.action === "approve" ? (
                <>
                  Transaksi <strong>{review.item.transactionCode}</strong> akan berstatus VOID, saldo loket{" "}
                  {review.item.loketCode} bertambah <strong>{formatRupiah(review.item.refundAmount)}</strong>, dan jurnal
                  GL dibalik. Tindakan ini tidak bisa diurungkan.
                </>
              ) : (
                <>Transaksi {review.item.transactionCode} tetap berstatus sukses.</>
              )}
            </p>
            <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
              Catatan {review.action === "reject" ? "*" : "(opsional)"}
            </label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            {reviewError && <p className="mb-2 text-xs text-red-500">{reviewError}</p>}
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setReview(null)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                onClick={submitReview}
                disabled={reviewLoading}
                className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 ${
                  review.action === "approve" ? "bg-red-500 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-800"
                }`}
              >
                {reviewLoading ? "Memproses..." : review.action === "approve" ? "Setujui" : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
