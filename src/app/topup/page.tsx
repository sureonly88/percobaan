"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Breadcrumb } from "@/ui";

const NOMINAL_OPTIONS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

interface TopupRecord {
  requestCode: string;
  orderId: string;
  loketCode: string;
  username: string;
  nominal: number;
  fee: number;
  totalBayar: number;
  status: string;
  paymentMethod: string | null;
  snapUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface ActiveTopup {
  orderId: string;
  nominal: number;
  status: string;
  snapToken: string;
  snapUrl: string;
  expiresAt: string;
  midtransClientKey: string;
}

export default function TopupPage() {
  const [nominal, setNominal] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Active pending topup
  const [active, setActive] = useState<ActiveTopup | null>(null);

  // History
  const [history, setHistory] = useState<TopupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = useCallback(async (p = 1) => {
    try {
      const res = await fetch(`/api/topup?page=${p}&pageSize=10`);
      if (res.ok) {
        const data = await res.json();
        const topups: TopupRecord[] = data.topups || [];
        setHistory(topups);
        setTotalPages(data.pagination?.totalPages || 1);
        setPage(p);

        // Auto-restore active banner if there's a pending topup and no active set yet
        if (p === 1) {
          const pending = topups.find(t => t.status === "PENDING" && t.snapUrl);
          if (pending) {
            setActive(prev => prev ? prev : {
              orderId: pending.orderId,
              nominal: pending.nominal,
              status: "PENDING",
              snapToken: "",
              snapUrl: pending.snapUrl!,
              expiresAt: pending.expiresAt ?? "",
              midtransClientKey: "",
            });
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  async function handleCreate() {
    if (!nominal) {
      setError("Pilih nominal top-up terlebih dahulu");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/topup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominal }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal membuat top-up");
        return;
      }

      // Open Midtrans Snap in new tab
      if (data.snapUrl) {
        window.open(data.snapUrl, "_blank", "noopener");
      }

      // Set active topup for polling
      setActive({
        orderId: data.orderId,
        nominal: data.nominal,
        status: "PENDING",
        snapToken: data.snapToken,
        snapUrl: data.snapUrl,
        expiresAt: data.expiresAt,
        midtransClientKey: "",
      });

      setNominal(0);
      fetchHistory();
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setSubmitting(false);
    }
  }

  // Poll active topup status
  useEffect(() => {
    if (!active || active.status !== "PENDING") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/topup?code=${encodeURIComponent(active.orderId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== "PENDING") {
            setActive(prev => prev ? { ...prev, status: data.status } : null);
            fetchHistory();
            clearInterval(interval);
          }
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [active, fetchHistory]);

  function dismissActive() {
    setActive(null);
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      SUCCESS: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Berhasil" },
      PENDING: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Menunggu" },
      FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Gagal" },
      EXPIRED: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500", label: "Kedaluwarsa" },
    };
    const s = map[status] || map.PENDING;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {s.label}
      </span>
    );
  };

  return (
    <>
      <div className="mb-8">
        <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Top-up Saldo" }]} />
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Top-up Saldo</h1>
          <p className="text-slate-500 mt-1">Tambah saldo loket secara mandiri via pembayaran online.</p>
        </div>
      </div>

      {/* Active pending payment banner */}
      {active && (
        <div className={`mb-6 rounded-xl border-2 p-5 ${
          active.status === "SUCCESS"
            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700"
            : active.status === "PENDING"
            ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700"
            : "border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700"
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined text-2xl ${
                active.status === "SUCCESS" ? "text-emerald-600" : active.status === "PENDING" ? "text-amber-600 animate-pulse" : "text-red-600"
              }`}>
                {active.status === "SUCCESS" ? "check_circle" : active.status === "PENDING" ? "hourglass_top" : "cancel"}
              </span>
              <div>
                <p className="font-bold text-sm">
                  {active.status === "SUCCESS"
                    ? "Top-up Berhasil!"
                    : active.status === "PENDING"
                    ? "Menunggu Pembayaran..."
                    : "Pembayaran Gagal"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatRupiah(active.nominal)} — {active.orderId}
                </p>
                {active.status === "PENDING" && active.snapUrl && (
                  <a
                    href={active.snapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    Buka Halaman Pembayaran
                  </a>
                )}
              </div>
            </div>
            {active.status !== "PENDING" && (
              <button onClick={dismissActive} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Nominal selection + create */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_card</span>
                Pilih Nominal
              </h3>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">error</span>
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {NOMINAL_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => { setNominal(n); setError(""); }}
                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${
                      nominal === n
                        ? "border-primary bg-primary/5 text-primary shadow-sm"
                        : "border-slate-200 dark:border-slate-700 hover:border-primary/40 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {formatRupiah(n)}
                  </button>
                ))}
              </div>

              {nominal > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Nominal</span>
                    <span className="font-bold">{formatRupiah(nominal)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">Biaya Layanan</span>
                    <span className="font-bold text-emerald-600">Gratis</span>
                  </div>
                  <hr className="my-2 border-slate-200 dark:border-slate-700" />
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">Total Bayar</span>
                    <span className="font-black text-primary">{formatRupiah(nominal)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={!nominal || submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    Memproses...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">payment</span>
                    Bayar Sekarang
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                Pembayaran diproses melalui Midtrans. Mendukung VA Bank, QRIS, e-Wallet, dan metode lainnya.
              </p>
            </div>
          </div>
        </div>

        {/* Right: History */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">history</span>
                Riwayat Top-up
              </h3>
              <button
                onClick={() => fetchHistory(page)}
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
                Memuat riwayat...
              </div>
            ) : history.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl block mb-2">receipt_long</span>
                Belum ada riwayat top-up
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map(h => (
                    <div key={h.requestCode} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        h.status === "SUCCESS"
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                          : h.status === "PENDING"
                          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      }`}>
                        <span className="material-symbols-outlined text-xl">
                          {h.status === "SUCCESS" ? "check_circle" : h.status === "PENDING" ? "hourglass_top" : "cancel"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">Top-up {formatRupiah(h.nominal)}</p>
                          {statusBadge(h.status)}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {h.username} · {h.loketCode}
                          {h.paymentMethod && ` · ${h.paymentMethod}`}
                        </p>
                        {h.status === "PENDING" && h.snapUrl && (
                          <a
                            href={h.snapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            Lanjutkan Pembayaran
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black ${h.status === "SUCCESS" ? "text-emerald-600" : "text-slate-400"}`}>
                          {h.status === "SUCCESS" ? "+" : ""}{formatRupiah(h.nominal)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(h.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2">
                    <button
                      onClick={() => fetchHistory(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-400">
                      Halaman {page} dari {totalPages}
                    </span>
                    <button
                      onClick={() => fetchHistory(page + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Berikutnya
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
