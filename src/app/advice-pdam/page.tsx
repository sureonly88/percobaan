"use client";

import React, { useState } from "react";

// ── types ────────────────────────────────────────────────────────────────────
interface PendingItem {
  itemCode: string;
  periodLabel: string;
  amount: number;
  adminFee: number;
  total: number;
}

interface PendingTransaction {
  transactionCode: string;
  idpel: string;
  customerName: string;
  loketCode: string;
  loketName: string;
  createdAt: string;
  adviceTanggal: string;
  adviceAttempts: number;
  grandTotal: number;
  items: PendingItem[];
}

interface GroupResult {
  transactionCode: string;
  tanggal: string;
  finalizedCount: number;
  notFound: boolean;
  error?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function formatRupiah(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatTanggal(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function AdvicePdamPage() {
  const [idpel, setIdpel]             = useState("");
  const [inputIdpel, setInputIdpel]   = useState("");
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError]   = useState("");
  const [searched, setSearched]       = useState(false);

  const [running, setRunning]         = useState(false);
  const [runResult, setRunResult]     = useState<{
    success: boolean;
    message: string;
    totalFinalized: number;
    groupResults: GroupResult[];
    customerName: string;
  } | null>(null);
  const [runError, setRunError]       = useState("");

  async function handleFetch() {
    const val = inputIdpel.trim();
    if (!val) return;
    setFetchLoading(true);
    setFetchError("");
    setTransactions([]);
    setRunResult(null);
    setRunError("");
    setSearched(true);
    setIdpel(val);
    try {
      const res  = await fetch(`/api/pembayaran/pdam/advice?idpel=${encodeURIComponent(val)}`);
      const json = await res.json() as { transactions?: PendingTransaction[]; error?: string };
      if (!res.ok) {
        setFetchError(json.error || "Gagal mengambil data");
        return;
      }
      setTransactions(json.transactions ?? []);
    } catch {
      setFetchError("Gagal menghubungi server");
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleRunAdvice() {
    if (!idpel || transactions.length === 0) return;
    setRunning(true);
    setRunResult(null);
    setRunError("");
    try {
      const res  = await fetch("/api/pembayaran/pdam/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idpel }),
      });
      const json = await res.json() as {
        success?: boolean;
        message?: string;
        totalFinalized?: number;
        groupResults?: GroupResult[];
        customerName?: string;
        error?: string;
      };
      if (!res.ok) {
        setRunError(json.error || "Advice PDAM gagal");
        return;
      }
      setRunResult({
        success:        Boolean(json.success),
        message:        json.message || "",
        totalFinalized: json.totalFinalized ?? 0,
        groupResults:   json.groupResults ?? [],
        customerName:   json.customerName || "",
      });
      // Refresh list after success
      await handleFetch();
    } catch {
      setRunError("Gagal menghubungi server");
    } finally {
      setRunning(false);
    }
  }

  const totalTagihan = transactions.reduce((s, t) => s + t.grandTotal, 0);
  const maxAttempts  = transactions.reduce((m, t) => Math.max(m, t.adviceAttempts), 0);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-blue-50/50 to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-3 py-1 text-xs font-bold uppercase tracking-wide mb-3">
              <span className="material-symbols-outlined text-sm">water_drop</span>
              Advice PDAM
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">
              Konfirmasi Pembayaran PDAM
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Cek status pembayaran PDAM yang sempat timeout ke server PDAM. Masukkan nomor pelanggan
              untuk melihat transaksi yang perlu dikonfirmasi, lalu jalankan advice sekali untuk semua tagihan pending.
            </p>
          </div>
        </div>

        {/* ── Search bar ─────────────────────────────────────────────────── */}
        <div className="mt-5 flex flex-col sm:flex-row gap-3 max-w-lg">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              badge
            </span>
            <input
              type="text"
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Nomor Pelanggan PDAM (idpel)"
              value={inputIdpel}
              onChange={(e) => setInputIdpel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleFetch(); }}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleFetch()}
            disabled={fetchLoading || !inputIdpel.trim()}
            className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            {fetchLoading ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base">search</span>
            )}
            Cek Tagihan
          </button>
        </div>
      </section>

      {/* ── Fetch error ─────────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
          <span className="material-symbols-outlined text-lg shrink-0">error</span>
          <p>{fetchError}</p>
        </div>
      )}

      {/* ── Run result banner ─────────────────────────────────────────────── */}
      {runResult && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 text-sm ${
          runResult.totalFinalized > 0
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
            : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
        }`}>
          <span className="material-symbols-outlined text-lg shrink-0">
            {runResult.totalFinalized > 0 ? "check_circle" : "hourglass_top"}
          </span>
          <div>
            <p className="font-bold">{runResult.message}</p>
            {runResult.groupResults.map((gr) => (
              <p key={gr.transactionCode} className="text-xs mt-1 opacity-80">
                {gr.transactionCode} ({gr.tanggal}):{" "}
                {gr.error
                  ? `Gagal — ${gr.error}`
                  : gr.notFound
                  ? "Belum ada data di server PDAM"
                  : `${gr.finalizedCount} tagihan selesai`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Run error banner ──────────────────────────────────────────────── */}
      {runError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
          <span className="material-symbols-outlined text-lg shrink-0">cancel</span>
          <p>{runError}</p>
        </div>
      )}

      {/* ── No results ────────────────────────────────────────────────────── */}
      {searched && !fetchLoading && !fetchError && transactions.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 block mb-3">task_alt</span>
          <p className="font-semibold text-slate-600 dark:text-slate-300">Tidak ada tagihan pending</p>
          <p className="text-sm text-slate-400 mt-1">
            Pelanggan <span className="font-mono font-bold">{idpel}</span> tidak memiliki transaksi PDAM yang perlu dikonfirmasi.
          </p>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Nomor Pelanggan", value: idpel, icon: "badge" },
              { label: "Nama", value: transactions[0].customerName || "-", icon: "person" },
              { label: "Tagihan Pending", value: `${transactions.length} transaksi`, icon: "pending_actions" },
              { label: "Total Nominal", value: formatRupiah(totalTagihan), icon: "payments" },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-blue-500 text-base">{card.icon}</span>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{card.label}</p>
                </div>
                <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Transactions list */}
          <div className="space-y-3">
            {transactions.map((trx) => (
              <div
                key={trx.transactionCode}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
              >
                {/* Transaction header */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      <span className="material-symbols-outlined text-base">hourglass_top</span>
                    </span>
                    <div>
                      <p className="font-mono font-bold text-sm text-slate-800 dark:text-white">{trx.transactionCode}</p>
                      <p className="text-xs text-slate-400">
                        Loket: {trx.loketName || trx.loketCode} · Dibuat: {formatTanggal(trx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800 dark:text-white">{formatRupiah(trx.grandTotal)}</p>
                    <p className="text-xs text-slate-400">
                      Tgl advice: <span className="font-mono">{trx.adviceTanggal}</span>
                      {trx.adviceAttempts > 0 && (
                        <span className="ml-2 text-amber-500">· {trx.adviceAttempts}× dicoba</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Periods */}
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {trx.items.map((item) => (
                    <div key={item.itemCode} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-base">water_drop</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {item.periodLabel || item.itemCode}
                        </span>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <span>Tagihan {formatRupiah(item.amount)}</span>
                        <span className="mx-1">+</span>
                        <span>Admin {formatRupiah(item.adminFee)}</span>
                        <span className="ml-2 font-bold text-slate-600 dark:text-slate-300">{formatRupiah(item.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Action button ──────────────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-slate-800 dark:text-white">
                  Jalankan Advice untuk Pelanggan {idpel}
                </p>
                <p className="text-sm text-slate-400 mt-0.5">
                  Semua {transactions.length} transaksi pending akan dikonfirmasi ke server PDAM sekaligus.
                  {maxAttempts > 0 && <span className="text-amber-500 ml-1">(sudah {maxAttempts}× dicoba)</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunAdvice()}
                disabled={running}
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm disabled:opacity-50 transition-colors"
              >
                {running ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                    Memproses...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">sync</span>
                    Jalankan Advice PDAM
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
