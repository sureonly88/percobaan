"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { printReceipt } from "@/lib/print-receipt";
import { Modal } from "@/ui";

interface RiwayatItem {
  id: number;
  jenis: string;
  transactionCode?: string | null;
  idPelanggan: string;
  nama: string;
  periode: string;
  tagihan: number;
  admin: number;
  total: number;
  loketName: string;
  loketCode?: string;
  username: string;
  tanggal: string;
  status: string;
  flagTransaksi?: string;
  processingStatus?: string | null;
  providerErrorCode?: string | null;
  providerErrorMessage?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  monitoringIdempotencyKey?: string | null;
}

interface Summary {
  totalTransaksi: number;
  pdamCount: number;
  plnCount: number;
  totalNominal: number;
  totalPdam: number;
  totalPln: number;
}

interface MultiPaymentListItem {
  multiPaymentCode: string;
  status: string;
  loketCode: string | null;
  loketName: string | null;
  username: string | null;
  totalItems: number;
  totalAmount: number;
  totalAdmin: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  paidAt: string | null;
  createdAt: string;
}

interface MultiPaymentPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface MultiPaymentDetailItem {
  itemCode: string;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
  transactionCode: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  retryCount: number;
  adviceAttempts: number;
  paidAt: string | null;
  failedAt: string | null;
}

interface MultiPaymentDetail {
  multiPayment: MultiPaymentListItem & {
    idempotencyKey: string;
    errorCode: string | null;
    errorMessage: string | null;
    updatedAt: string;
  };
  items: MultiPaymentDetailItem[];
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatTanggal(dateStr: string): string {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTanggalShort(dateStr: string): string {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusLabel(item: RiwayatItem): string {
  const status = (item.processingStatus || item.status || item.flagTransaksi || "").toString().toUpperCase();
  if (status === "SUCCESS" || status === "LUNAS" || status === "1") return "Lunas";
  if (status === "FAILED" || status === "GAGAL") return "Gagal";
  if (status === "PENDING") return "Pending";
  return item.status || "-";
}

function getStatusClass(item: RiwayatItem): string {
  const label = getStatusLabel(item);
  if (label === "Lunas") return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
  if (label === "Gagal") return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
  if (label === "Pending") return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  return "bg-slate-100 dark:bg-slate-800 text-slate-500";
}

function groupByDate(items: RiwayatItem[]): { date: string; label: string; items: RiwayatItem[] }[] {
  const map = new Map<string, RiwayatItem[]>();

  for (const item of items) {
    const d = new Date(item.tanggal);
    const key = isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  return Array.from(map.entries()).map(([date, groupedItems]) => ({
    date,
    label: date === "unknown" ? "Tanggal Tidak Diketahui" : formatTanggalShort(date),
    items: groupedItems,
  }));
}

export default function RiwayatPage() {
  const [idPelanggan, setIdPelanggan] = useState("");
  const [riwayat, setRiwayat] = useState<RiwayatItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filterJenis, setFilterJenis] = useState<"semua" | "PDAM" | "PLN">("semua");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | "lunas" | "gagal" | "pending">("semua");
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [reprintLoading, setReprintLoading] = useState<string | null>(null);
  const [multiPayments, setMultiPayments] = useState<MultiPaymentListItem[]>([]);
  const [multiPayLoading, setMultiPayLoading] = useState(true);
  const [multiPayDetail, setMultiPayDetail] = useState<MultiPaymentDetail | null>(null);
  const [multiPayDetailLoading, setMultiPayDetailLoading] = useState(false);
  const [multiPayActionLoading, setMultiPayActionLoading] = useState<string | null>(null);
  const [multiPayStatusFilter, setMultiPayStatusFilter] = useState("ALL");
  const [multiPaySearch, setMultiPaySearch] = useState("");
  const [multiPayStartDate, setMultiPayStartDate] = useState("");
  const [multiPayEndDate, setMultiPayEndDate] = useState("");
  const [multiPayPage, setMultiPayPage] = useState(1);
  const [multiPayPagination, setMultiPayPagination] = useState<MultiPaymentPagination | null>(null);
  const perPage = 15;

  const fetchLatestMultiPayments = useCallback(async () => {
    setMultiPayLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(multiPayPage),
        pageSize: "10",
      });
      if (multiPayStatusFilter !== "ALL") params.set("status", multiPayStatusFilter);
      if (multiPaySearch.trim()) params.set("search", multiPaySearch.trim());
      if (multiPayStartDate) params.set("startDate", multiPayStartDate);
      if (multiPayEndDate) params.set("endDate", multiPayEndDate);

      const res = await fetch(`/api/pembayaran/multipay?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setMultiPayments(json.items || []);
        setMultiPayPagination(json.pagination || null);
      }
    } catch {
      setMultiPayments([]);
      setMultiPayPagination(null);
    } finally {
      setMultiPayLoading(false);
    }
  }, [multiPayPage, multiPayStatusFilter, multiPaySearch, multiPayStartDate, multiPayEndDate]);

  useEffect(() => {
    void fetchLatestMultiPayments();
  }, [fetchLatestMultiPayments]);

  useEffect(() => {
    setMultiPayPage(1);
  }, [multiPayStatusFilter, multiPaySearch, multiPayStartDate, multiPayEndDate]);

  const fetchRiwayat = useCallback(async () => {
    if (!idPelanggan.trim()) return;

    setLoading(true);
    setSearched(true);
    setPage(1);
    setFilterJenis("semua");
    setExpandedKey(null);

    try {
      const params = new URLSearchParams({
        idPelanggan: idPelanggan.trim(),
      });

      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (statusFilter !== "semua") params.set("status", statusFilter);

      const res = await fetch(`/api/pelanggan/riwayat?${params.toString()}`);
      const json = await res.json();

      if (json.error) {
        setRiwayat([]);
        setSummary(null);
      } else {
        setRiwayat(json.riwayat ?? []);
        setSummary(json.summary ?? null);
      }
    } catch {
      setRiwayat([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [idPelanggan, startDate, endDate, statusFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") fetchRiwayat();
  };

  const filteredRiwayat = useMemo(
    () => (filterJenis === "semua" ? riwayat : riwayat.filter((item) => item.jenis === filterJenis)),
    [filterJenis, riwayat]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRiwayat.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedRiwayat = filteredRiwayat.slice((safePage - 1) * perPage, safePage * perPage);
  const grouped = groupByDate(paginatedRiwayat);
  const pelangganNama = riwayat.length > 0 ? riwayat[0].nama : null;

  function toggleExpanded(item: RiwayatItem) {
    const key = `${item.jenis}-${item.id}`;
    setExpandedKey((current) => (current === key ? null : key));
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Gagal menyalin teks");
    }
  }

  async function handleReprint(item: RiwayatItem) {
    if (item.jenis !== "PDAM" || !item.transactionCode) return;
    const key = `${item.jenis}-${item.id}`;
    setReprintLoading(key);
    try {
      const params = new URLSearchParams({ transactionCode: item.transactionCode });
      const res = await fetch(`/api/pembayaran/reprint?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Gagal mengambil data struk");
        return;
      }
      printReceipt({
        loketName: data.loketName,
        loketCode: data.loketCode,
        kasir: data.kasir,
        tanggal: data.tanggal,
        bills: data.bills,
        totalTagihan: data.totalTagihan,
        totalAdmin: data.totalAdmin,
        totalBayar: data.totalBayar,
        tunai: data.totalBayar,
        kembalian: 0,
      });
    } catch {
      alert("Gagal mencetak ulang struk");
    } finally {
      setReprintLoading(null);
    }
  }

  async function handleOpenMultiPayDetail(code: string) {
    setMultiPayDetailLoading(true);
    try {
      const res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Gagal mengambil detail multipay");
        return;
      }
      setMultiPayDetail(json);
    } catch {
      alert("Gagal mengambil detail multipay");
    } finally {
      setMultiPayDetailLoading(false);
    }
  }

  async function handleRunMultiPayAdvice() {
    if (!multiPayDetail) return;
    const pendingItem = multiPayDetail.items.find(
      (item) => item.provider === "LUNASIN" && (item.status === "PENDING_ADVICE" || item.status === "FAILED")
    );

    if (!pendingItem) {
      alert("Tidak ada item Lunasin yang bisa dijalankan advice.");
      return;
    }

    setMultiPayActionLoading(pendingItem.itemCode);
    try {
      const res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(multiPayDetail.multiPayment.multiPaymentCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode: pendingItem.itemCode, action: "run_advice" }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Gagal menjalankan advice multipay");
        return;
      }

      await handleOpenMultiPayDetail(multiPayDetail.multiPayment.multiPaymentCode);
      await fetchLatestMultiPayments();
    } catch {
      alert("Gagal menjalankan advice multipay");
    } finally {
      setMultiPayActionLoading(null);
    }
  }

  async function handleRunPdamAdvice(item: MultiPaymentDetailItem) {
    if (!multiPayDetail) return;
    if (!item.transactionCode) {
      alert("Transaksi tidak memiliki kode untuk diproses advice.");
      return;
    }
    setMultiPayActionLoading(item.itemCode);
    try {
      const res = await fetch("/api/pembayaran/pdam/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionCode: item.transactionCode, idpel: item.customerId }),
      });
      const json = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        alert(json.error || "Advice PDAM gagal");
        return;
      }
      alert(json.message || "Advice PDAM berhasil!");
      await handleOpenMultiPayDetail(multiPayDetail.multiPayment.multiPaymentCode);
      await fetchLatestMultiPayments();
    } catch {
      alert("Advice PDAM gagal");
    } finally {
      setMultiPayActionLoading(null);
    }
  }

  return (
    <>
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold">Riwayat Pembayaran</h2>
          <p className="text-slate-500">Cari dan lihat seluruh histori transaksi PDAM &amp; PLN berdasarkan ID pelanggan.</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
          </button>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Data Real-time</span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase">Database MariaDB</span>
          </div>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary">person_search</span>
          <h3 className="text-lg font-bold">Cari Pelanggan</h3>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative md:col-span-2 xl:col-span-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">badge</span>
              <input
                type="text"
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                placeholder="Masukkan ID Pelanggan"
                value={idPelanggan}
                onChange={(e) => setIdPelanggan(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
            />

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
            >
              <option value="semua">Semua Status</option>
              <option value="lunas">Lunas</option>
              <option value="gagal">Gagal</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <button
            onClick={fetchRiwayat}
            disabled={!idPelanggan.trim() || loading}
            className="h-11 px-6 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">search</span>
            )}
            <span>Cari Riwayat</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold">Riwayat Multi-Payment Terbaru</h3>
            <p className="text-sm text-slate-500">Pantau transaksi parent multipay beserta status gabungannya.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchLatestMultiPayments()}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
          <input
            type="text"
            value={multiPaySearch}
            onChange={(e) => setMultiPaySearch(e.target.value)}
            placeholder="Cari code / loket / kasir"
            className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
          />
          <select
            value={multiPayStatusFilter}
            onChange={(e) => setMultiPayStatusFilter(e.target.value)}
            className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
          >
            <option value="ALL">Semua Status</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="PARTIAL_SUCCESS">PARTIAL_SUCCESS</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="FAILED">FAILED</option>
          </select>
          <input
            type="date"
            value={multiPayStartDate}
            onChange={(e) => setMultiPayStartDate(e.target.value)}
            className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
          />
          <input
            type="date"
            value={multiPayEndDate}
            onChange={(e) => setMultiPayEndDate(e.target.value)}
            className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setMultiPaySearch("");
              setMultiPayStatusFilter("ALL");
              setMultiPayStartDate("");
              setMultiPayEndDate("");
            }}
            className="h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Reset Filter
          </button>
        </div>

        {multiPayLoading ? (
          <div className="py-10 text-center text-slate-400">
            <span className="material-symbols-outlined animate-spin text-3xl block mb-2">progress_activity</span>
            Memuat data multipay...
          </div>
        ) : multiPayments.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <span className="material-symbols-outlined text-3xl block mb-2">receipt_long</span>
            Belum ada transaksi multipay.
          </div>
        ) : (
          <div className="space-y-3">
            {multiPayments.map((item) => (
              <div key={item.multiPaymentCode} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm font-mono">{item.multiPaymentCode}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        item.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : item.status === "PARTIAL_SUCCESS" || item.status === "PENDING_REVIEW"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Loket: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.loketName || item.loketCode || "-"}</span></span>
                      <span>Kasir: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.username || "-"}</span></span>
                      <span>Waktu: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatTanggal(item.createdAt)}</span></span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-primary">{formatRupiah(item.grandTotal)}</p>
                    <p className="text-xs text-slate-400">{item.totalItems} item · admin {formatRupiah(item.totalAdmin)}</p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleOpenMultiPayDetail(item.multiPaymentCode)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Lihat Detail
                  </button>
                  <Link
                    href={`/pembayaran/multipay/${encodeURIComponent(item.multiPaymentCode)}`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    Halaman Penuh
                  </Link>
                </div>
              </div>
            ))}

            {multiPayPagination && multiPayPagination.totalPages > 1 && (
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Halaman {multiPayPagination.page} dari {multiPayPagination.totalPages} · {multiPayPagination.totalItems} transaksi
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!multiPayPagination.hasPrev}
                    onClick={() => setMultiPayPage((prev) => Math.max(1, prev - 1))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!multiPayPagination.hasNext}
                    onClick={() => setMultiPayPage((prev) => prev + 1)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {searched && !loading && (
        <>
          {summary && summary.totalTransaksi > 0 ? (
            <>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-2xl">person</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold">{pelangganNama || idPelanggan}</h3>
                  <p className="text-sm text-slate-500">
                    ID Pelanggan: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{idPelanggan}</span>
                  </p>
                </div>
              </div>

              <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg">
                    <span className="material-symbols-outlined text-2xl">receipt_long</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Transaksi</p>
                    <p className="text-xl font-bold mt-0.5">{summary.totalTransaksi}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                  <div className="p-2.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 rounded-lg">
                    <span className="material-symbols-outlined text-2xl">water_drop</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Transaksi PDAM</p>
                    <p className="text-xl font-bold mt-0.5">{summary.pdamCount}</p>
                    <p className="text-[11px] text-cyan-600 font-semibold">{formatRupiah(summary.totalPdam)}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
                    <span className="material-symbols-outlined text-2xl">electric_bolt</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Transaksi PLN</p>
                    <p className="text-xl font-bold mt-0.5">{summary.plnCount}</p>
                    <p className="text-[11px] text-amber-600 font-semibold">{formatRupiah(summary.totalPln)}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg">
                    <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Nominal</p>
                    <p className="text-xl font-bold mt-0.5">{formatRupiah(summary.totalNominal)}</p>
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {(["semua", "PDAM", "PLN"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFilterJenis(f);
                      setPage(1);
                      setExpandedKey(null);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      filterJenis === f
                        ? "bg-primary text-white"
                        : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {f === "semua" ? "Semua" : f}
                    {f === "semua" && <span className="ml-1.5 text-xs opacity-75">({summary.totalTransaksi})</span>}
                    {f === "PDAM" && <span className="ml-1.5 text-xs opacity-75">({summary.pdamCount})</span>}
                    {f === "PLN" && <span className="ml-1.5 text-xs opacity-75">({summary.plnCount})</span>}
                  </button>
                ))}
              </div>

              <div className="space-y-8">
                {grouped.map((group) => (
                  <div key={group.date}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-base">calendar_today</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{group.label}</h4>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
                      <span className="text-xs text-slate-400">{group.items.length} transaksi</span>
                    </div>

                    <div className="ml-4 border-l-2 border-slate-200 dark:border-slate-800 pl-6 space-y-4">
                      {group.items.map((item) => {
                        const key = `${item.jenis}-${item.id}`;
                        const isExpanded = expandedKey === key;

                        return (
                          <div key={key}>
                            <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-primary/30 transition-colors">
                              <div className={`absolute -left-[33px] top-6 w-4 h-4 rounded-full border-2 border-white dark:border-slate-950 ${
                                item.jenis === "PDAM" ? "bg-cyan-500" : "bg-amber-500"
                              }`}></div>

                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                  <div className={`p-2 rounded-lg shrink-0 ${
                                    item.jenis === "PDAM"
                                      ? "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600"
                                      : "bg-amber-50 dark:bg-amber-900/20 text-amber-600"
                                  }`}>
                                    <span className="material-symbols-outlined text-xl">
                                      {item.jenis === "PDAM" ? "water_drop" : "electric_bolt"}
                                    </span>
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                        item.jenis === "PDAM"
                                          ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400"
                                          : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                      }`}>
                                        {item.jenis}
                                      </span>
                                      {item.transactionCode && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                                          {item.transactionCode}
                                        </span>
                                      )}
                                      <span className="text-xs text-slate-400">{formatTanggal(item.tanggal)}</span>
                                    </div>

                                    <p className="text-sm font-bold truncate">{item.nama}</p>

                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                                      <span>Periode: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.periode}</span></span>
                                      <span>Loket: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.loketName}</span></span>
                                      {item.loketCode && item.loketCode !== "-" && (
                                        <span>Kode Loket: <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{item.loketCode}</span></span>
                                      )}
                                      <span>Kasir: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.username}</span></span>
                                    </div>

                                    {(item.providerErrorCode || item.providerErrorMessage) && (
                                      <div className="mt-2 text-xs text-red-600 dark:text-red-400 space-y-1">
                                        {item.providerErrorCode && (
                                          <p>Kode Error: <span className="font-mono font-semibold">{item.providerErrorCode}</span></p>
                                        )}
                                        {item.providerErrorMessage && <p>{item.providerErrorMessage}</p>}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold">{formatRupiah(item.total)}</p>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    <span>Tagihan {formatRupiah(item.tagihan)}</span>
                                    <span className="mx-1">+</span>
                                    <span>Admin {formatRupiah(item.admin)}</span>
                                  </div>
                                  <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${getStatusClass(item)}`}>
                                    {getStatusLabel(item)}
                                  </span>
                                  {(item.paidAt || item.failedAt) && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                      {item.paidAt ? `Paid: ${formatTanggal(item.paidAt)}` : item.failedAt ? `Failed: ${formatTanggal(item.failedAt)}` : ""}
                                    </p>
                                  )}
                                  <button
                                    onClick={() => toggleExpanded(item)}
                                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
                                  >
                                    <span className="material-symbols-outlined text-sm">
                                      {isExpanded ? "expand_less" : "expand_more"}
                                    </span>
                                    {isExpanded ? "Tutup Detail" : "Lihat Detail"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 ml-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Transaction Code</p>
                                    <p className="font-mono break-all">{item.transactionCode || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Status Proses</p>
                                    <p className="font-semibold">{item.processingStatus || item.flagTransaksi || item.status || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Waktu Transaksi</p>
                                    <p className="font-semibold">{formatTanggal(item.tanggal)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Paid At</p>
                                    <p className="font-semibold">{formatTanggal(item.paidAt || "-")}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Failed At</p>
                                    <p className="font-semibold">{formatTanggal(item.failedAt || "-")}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-400 mb-1">Kode Loket</p>
                                    <p className="font-mono">{item.loketCode || "-"}</p>
                                  </div>
                                </div>

                                {(item.providerErrorCode || item.providerErrorMessage) && (
                                  <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm">
                                    <p className="font-bold text-red-700 dark:text-red-300 mb-1">Informasi Error Provider</p>
                                    {item.providerErrorCode && <p className="font-mono text-red-600 dark:text-red-300">{item.providerErrorCode}</p>}
                                    {item.providerErrorMessage && <p className="text-red-700 dark:text-red-300 mt-1">{item.providerErrorMessage}</p>}
                                  </div>
                                )}

                                <div className="mt-4 flex flex-wrap gap-3">
                                  {item.monitoringIdempotencyKey && (
                                    <Link
                                      href={`/monitoring/${encodeURIComponent(item.monitoringIdempotencyKey)}`}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"
                                    >
                                      <span className="material-symbols-outlined text-sm">monitoring</span>
                                      Buka Monitoring Detail
                                    </Link>
                                  )}
                                  {item.transactionCode && (
                                    <button
                                      onClick={() => void copyText(item.transactionCode || "")}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-white dark:hover:bg-slate-800"
                                    >
                                      <span className="material-symbols-outlined text-sm">content_copy</span>
                                      Copy Transaction Code
                                    </button>
                                  )}
                                  {item.jenis === "PDAM" && item.transactionCode && getStatusLabel(item) === "Lunas" && (
                                    <button
                                      onClick={() => void handleReprint(item)}
                                      disabled={reprintLoading === `${item.jenis}-${item.id}`}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50"
                                    >
                                      {reprintLoading === `${item.jenis}-${item.id}` ? (
                                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                      ) : (
                                        <span className="material-symbols-outlined text-sm">print</span>
                                      )}
                                      Cetak Ulang Struk
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center">
                  <span className="text-xs text-slate-400">
                    Menampilkan {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filteredRiwayat.length)} dari {filteredRiwayat.length} transaksi
                  </span>
                  <nav className="flex items-center gap-1">
                    <button
                      className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                      disabled={safePage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .map((pg, idx, arr) => (
                        <React.Fragment key={pg}>
                          {idx > 0 && arr[idx - 1] !== pg - 1 && <span className="text-xs text-slate-400">…</span>}
                          <button
                            onClick={() => setPage(pg)}
                            className={
                              safePage === pg
                                ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold"
                                : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                            }
                          >
                            {pg}
                          </button>
                        </React.Fragment>
                      ))}
                    <button
                      className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                      disabled={safePage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </nav>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-slate-400">search_off</span>
              </div>
              <h3 className="text-lg font-bold mb-1">Tidak Ditemukan</h3>
              <p className="text-sm text-slate-500">
                Tidak ada riwayat transaksi untuk ID Pelanggan <span className="font-mono font-semibold">&quot;{idPelanggan}&quot;</span>.
              </p>
              <p className="text-xs text-slate-400 mt-2">Pastikan ID pelanggan yang dimasukkan sudah benar.</p>
            </div>
          )}
        </>
      )}

      {!searched && !loading && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-primary">history</span>
          </div>
          <h3 className="text-lg font-bold mb-1">Cari Riwayat Pelanggan</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Masukkan ID pelanggan di atas untuk melihat seluruh riwayat pembayaran PDAM dan PLN dalam format timeline.
          </p>
        </div>
      )}

      {loading && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            <span className="text-sm font-medium">Mencari riwayat transaksi...</span>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(multiPayDetail) || multiPayDetailLoading}
        onClose={() => setMultiPayDetail(null)}
        title="Detail Multi-Payment"
      >
        {multiPayDetailLoading && !multiPayDetail ? (
          <div className="py-10 text-center text-slate-400">
            <span className="material-symbols-outlined animate-spin text-3xl block mb-2">progress_activity</span>
            Memuat detail multipay...
          </div>
        ) : multiPayDetail ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-mono font-bold text-sm">{multiPayDetail.multiPayment.multiPaymentCode}</p>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {multiPayDetail.multiPayment.status}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Loket</p>
                  <p className="font-semibold">{multiPayDetail.multiPayment.loketName || multiPayDetail.multiPayment.loketCode || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Kasir</p>
                  <p className="font-semibold">{multiPayDetail.multiPayment.username || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Grand Total</p>
                  <p className="font-semibold text-primary">{formatRupiah(multiPayDetail.multiPayment.grandTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Dibuat</p>
                  <p className="font-semibold">{formatTanggal(multiPayDetail.multiPayment.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {multiPayDetail.items.map((item) => (
                <div key={item.itemCode} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">{item.customerName || item.customerId}</p>
                      <p className="text-xs text-slate-500 font-mono">{item.customerId} · {item.provider} · {item.serviceType}</p>
                      <p className="text-xs text-slate-400 mt-1">{item.productCode || item.periodLabel || "-"}</p>
                      {item.transactionCode && <p className="text-xs text-emerald-600 mt-1 font-mono">{item.transactionCode}</p>}
                      {item.providerErrorMessage && <p className="text-xs text-red-600 mt-1">{item.providerErrorMessage}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold">{formatRupiah(item.total)}</p>
                      <p className="text-xs text-slate-400">Tagihan {formatRupiah(item.amount)} + Admin {formatRupiah(item.adminFee)}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {item.status}
                      </span>
                      {(item.adviceAttempts > 0 || item.retryCount > 0) && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Retry {item.retryCount} · Advice {item.adviceAttempts}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.provider === "PDAM" && item.status === "PENDING_ADVICE" && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => void handleRunPdamAdvice(item)}
                        disabled={Boolean(multiPayActionLoading)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {multiPayActionLoading === item.itemCode ? (
                          <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-sm">sync</span>
                        )}
                        Advice PDAM
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {multiPayDetail.items.some((item) => item.provider === "LUNASIN" && (item.status === "PENDING_ADVICE" || item.status === "FAILED")) && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void handleRunMultiPayAdvice()}
                  disabled={Boolean(multiPayActionLoading)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {multiPayActionLoading ? (
                    <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-base">restart_alt</span>
                  )}
                  Jalankan Advice Item Lunasin
                </button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}