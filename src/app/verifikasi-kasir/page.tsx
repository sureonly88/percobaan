"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";
import { normalizeRole } from "@/lib/rbac";

type ClosingStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "REJECTED";

interface ClosingItem {
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
  receivedAmount: number;
  receivedDifferenceAmount: number;
  discrepancyAmount: number;
  discrepancyReasonCode: string | null;
  cashierNote: string | null;
  discrepancyNote: string | null;
  proofReference: string | null;
  status: ClosingStatus;
  submittedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifierNote: string | null;
  reopenRequestedAt: string | null;
  reopenRequestedBy: string | null;
  reopenRequestNote: string | null;
  revisionCount: number;
  updatedAt: string | null;
}

interface ReviewState {
  open: boolean;
  closingId: number | null;
  action: "VERIFIED" | "REJECTED";
  title: string;
  description: string;
}

interface ReopenState {
  open: boolean;
  closingId: number | null;
  mode: "approve" | "force";
  title: string;
  description: string;
}

function getToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseNumber(value: string): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("id-ID");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusStyle(status: ClosingStatus): string {
  switch (status) {
    case "VERIFIED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

function getStatusLabel(status: ClosingStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Terverifikasi";
    case "SUBMITTED":
      return "Diajukan";
    case "REJECTED":
      return "Ditolak";
    default:
      return "Draft";
  }
}

export default function VerifikasiKasirPage() {
  const { data: session } = useSession();
  const userRole = normalizeRole((session?.user as { role?: string })?.role || "");
  const isAdmin = userRole === "admin";

  const [businessDate, setBusinessDate] = useState(getToday());
  const [appliedDate, setAppliedDate] = useState(getToday());
  const [statusFilter, setStatusFilter] = useState("SUBMITTED");
  const [appliedStatus, setAppliedStatus] = useState("SUBMITTED");

  const [items, setItems] = useState<ClosingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [reviewState, setReviewState] = useState<ReviewState>({
    open: false,
    closingId: null,
    action: "VERIFIED",
    title: "",
    description: "",
  });
  const [reviewNote, setReviewNote] = useState("");
  const [reviewReceivedAmount, setReviewReceivedAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [reopenState, setReopenState] = useState<ReopenState>({
    open: false,
    closingId: null,
    mode: "force",
    title: "",
    description: "",
  });
  const [reopenNote, setReopenNote] = useState("");
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        businessDate: appliedDate,
        status: appliedStatus,
      });
      const response = await fetch(`/api/verifikasi-kasir?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal mengambil data");
      setItems(json.items ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengambil data";
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [appliedDate, appliedStatus]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtersAreDirty = businessDate !== appliedDate || statusFilter !== appliedStatus;

  const handleApply = () => {
    setAppliedDate(businessDate);
    setAppliedStatus(statusFilter);
  };

  const openReviewModal = (item: ClosingItem, action: "VERIFIED" | "REJECTED") => {
    setReviewNote("");
    setReviewReceivedAmount(action === "VERIFIED" ? String(item.depositTotal) : "");
    setReviewState({
      open: true,
      closingId: item.id,
      action,
      title: action === "VERIFIED" ? "Terima & Verifikasi Setoran" : "Tolak Closing",
      description:
        action === "VERIFIED"
          ? `Input nominal uang yang diterima dari kasir ${item.username} (${item.loketCode}).`
          : `Berikan catatan penolakan closing kasir ${item.username} (${item.loketCode}).`,
    });
  };

  const handleReview = async () => {
    if (!reviewState.closingId) return;
    setReviewing(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/verifikasi-kasir", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingId: reviewState.closingId,
          status: reviewState.action,
          verifierNote: reviewNote,
          receivedAmount: reviewReceivedAmount.trim() === "" ? undefined : parseNumber(reviewReceivedAmount),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal memproses verifikasi");
      setSuccess(reviewState.action === "VERIFIED" ? "Closing berhasil diverifikasi." : "Closing berhasil ditolak.");
      setReviewState((prev) => ({ ...prev, open: false }));
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses verifikasi");
    } finally {
      setReviewing(false);
    }
  };

  const openReopenModal = (item: ClosingItem) => {
    const isRequest = !!item.reopenRequestedAt;
    setReopenNote("");
    setReopenState({
      open: true,
      closingId: item.id,
      mode: isRequest ? "approve" : "force",
      title: isRequest ? "Setujui Permintaan Reopen" : "Buka Kembali Closing",
      description: isRequest
        ? `Setujui permintaan reopen closing kasir ${item.username} (${item.loketCode}). Catatan kasir: ${item.reopenRequestNote || "-"}`
        : `Buka kembali closing kasir ${item.username} (${item.loketCode}) secara paksa. Closing akan kembali ke draft.`,
    });
  };

  const handleReopen = async () => {
    if (!reopenState.closingId) return;
    setReopenSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/verifikasi-kasir", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_reopen",
          closingId: reopenState.closingId,
          note: reopenNote,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal memproses reopen");
      setSuccess("Closing berhasil dibuka kembali.");
      setReopenState((prev) => ({ ...prev, open: false }));
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses reopen");
    } finally {
      setReopenSubmitting(false);
    }
  };

  const reviewItem = items.find((item) => item.id === reviewState.closingId) ?? null;
  const reviewExpectedDeposit = reviewItem?.depositTotal ?? 0;
  const reviewReceivedAmountValue = reviewReceivedAmount.trim() === "" ? null : parseNumber(reviewReceivedAmount);
  const reviewDifference = reviewReceivedAmountValue === null ? null : reviewReceivedAmountValue - reviewExpectedDeposit;
  const reviewConfirmDisabled = reviewing || (reviewState.action === "VERIFIED" && reviewReceivedAmountValue === null);

  const STATUS_OPTIONS = [
    { value: "SUBMITTED", label: "Menunggu Verifikasi" },
    { value: "VERIFIED", label: "Terverifikasi" },
    { value: "REJECTED", label: "Ditolak" },
    { value: "DRAFT", label: "Draft" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Verifikasi Kasir" },
        ]}
      />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verifikasi Kasir</h1>
          <p className="mt-1 text-sm text-slate-500">
            Verifikasi closing yang diajukan kasir: terima setoran, tolak, atau buka kembali closing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Muat Ulang
        </button>
      </header>

      {/* Filter */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Tanggal</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleApply}
              className={`h-11 w-full rounded-lg px-4 text-sm font-bold text-white transition ${filtersAreDirty ? "bg-amber-500 ring-2 ring-amber-300 hover:bg-amber-600" : "bg-primary hover:bg-primary/90"}`}
            >
              Terapkan Filter
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {success}
          </div>
        )}
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Daftar Closing</h2>
            <p className="text-sm text-slate-500">Closing kasir pada tanggal {appliedDate} dengan status {STATUS_OPTIONS.find(o => o.value === appliedStatus)?.label ?? appliedStatus}.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {loading ? "..." : `${formatNumber(items.length)} data`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Kasir / Loket</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Kas Sistem</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Kas Fisik</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Setoran</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Diterima</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Selisih</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Diajukan</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">Memuat data...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    Tidak ada data closing dengan status tersebut.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{item.username}</div>
                      <div className="text-xs text-slate-400">{item.loketName || item.loketCode} · {item.loketCode}</div>
                      {item.cashierNote && (
                        <div className="mt-1 max-w-xs truncate text-xs text-slate-400" title={item.cashierNote}>
                          {item.cashierNote}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.systemCashTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.countedCashTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.depositTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="font-semibold">{item.receivedAt ? formatRupiah(item.receivedAmount) : "-"}</div>
                      {item.receivedAt && (
                        <div className={`text-xs ${item.receivedDifferenceAmount < 0 ? "text-red-500" : item.receivedDifferenceAmount > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                          Δ {formatRupiah(item.receivedDifferenceAmount)}
                        </div>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${item.discrepancyAmount < 0 ? "text-red-500" : item.discrepancyAmount > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                      {formatRupiah(item.discrepancyAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                        {item.reopenRequestedAt && item.status !== "DRAFT" && (
                          <span className="inline-flex w-fit rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            Reopen diminta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDateTime(item.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {item.status === "SUBMITTED" && (
                          <>
                            <button
                              type="button"
                              onClick={() => openReviewModal(item, "VERIFIED")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                            >
                              Terima
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewModal(item, "REJECTED")}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                        {isAdmin && (item.reopenRequestedAt || item.status === "VERIFIED") && item.status !== "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => openReopenModal(item)}
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-700"
                          >
                            {item.reopenRequestedAt ? "Setujui Reopen" : "Buka Kembali"}
                          </button>
                        )}
                        {item.status !== "SUBMITTED" && !(isAdmin && (item.reopenRequestedAt || item.status === "VERIFIED") && item.status !== "DRAFT") && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Review Modal */}
      <Modal open={reviewState.open} onClose={() => setReviewState((prev) => ({ ...prev, open: false }))} title={reviewState.title}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{reviewState.description}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Setoran Kasir</p>
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{formatRupiah(reviewExpectedDeposit)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Nominal Diterima Admin</p>
              <input
                type="number"
                min="0"
                step="1000"
                value={reviewReceivedAmount}
                onChange={(e) => setReviewReceivedAmount(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900"
                placeholder={reviewState.action === "VERIFIED" ? "Wajib diisi" : "Opsional"}
              />
              {reviewDifference !== null && (
                <p className={`mt-2 text-xs font-semibold ${reviewDifference < 0 ? "text-red-500" : reviewDifference > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                  Selisih admin vs setoran: {formatRupiah(reviewDifference)}
                </p>
              )}
            </div>
          </div>
          {reviewItem?.discrepancyAmount !== 0 && reviewItem?.discrepancyNote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Catatan Selisih Kasir</p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{reviewItem.discrepancyNote}</p>
            </div>
          )}
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            placeholder={reviewState.action === "REJECTED" ? "Catatan penolakan (wajib)" : "Catatan verifikasi (opsional)"}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setReviewState((prev) => ({ ...prev, open: false }))}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleReview()}
              disabled={reviewConfirmDisabled}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition ${reviewState.action === "VERIFIED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {reviewing ? "Memproses..." : reviewState.action === "VERIFIED" ? "Konfirmasi Terima" : "Konfirmasi Tolak"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reopen Modal */}
      <Modal open={reopenState.open} onClose={() => setReopenState((prev) => ({ ...prev, open: false }))} title={reopenState.title}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{reopenState.description}</p>
          <textarea
            value={reopenNote}
            onChange={(e) => setReopenNote(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            placeholder="Catatan persetujuan reopen (opsional)"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setReopenState((prev) => ({ ...prev, open: false }))}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleReopen()}
              disabled={reopenSubmitting}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reopenSubmitting ? "Memproses..." : "Konfirmasi"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
