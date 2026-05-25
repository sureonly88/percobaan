"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";

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
  const [allPending, setAllPending]       = useState<PendingTransaction[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadError, setLoadError]         = useState("");
  const [runningIdpel, setRunningIdpel]   = useState<string | null>(null);
  const [results, setResults]             = useState<Record<string, { ok: boolean; msg: string; groupResults?: GroupResult[] }>>({});

  // ── filter state ──────────────────────────────────────────────────────────
  const [filterIdpel, setFilterIdpel]     = useState("");
  const [filterTanggal, setFilterTanggal] = useState("");  // YYYY-MM-DD

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res  = await fetch("/api/pembayaran/pdam/advice");
      const json = await res.json() as { transactions?: PendingTransaction[]; error?: string };
      if (!res.ok) { setLoadError(json.error || "Gagal memuat data"); return; }
      setAllPending(json.transactions ?? []);
    } catch {
      setLoadError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function handleAdvice(targetIdpel: string) {
    setRunningIdpel(targetIdpel);
    setResults((p) => ({ ...p, [targetIdpel]: { ok: false, msg: "" } }));
    try {
      const res  = await fetch("/api/pembayaran/pdam/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idpel: targetIdpel }),
      });
      const json = await res.json() as {
        success?: boolean; message?: string; totalFinalized?: number;
        groupResults?: GroupResult[]; error?: string;
      };
      if (!res.ok) {
        setResults((p) => ({ ...p, [targetIdpel]: { ok: false, msg: json.error || "Advice gagal" } }));
      } else {
        setResults((p) => ({
          ...p,
          [targetIdpel]: {
            ok: true,
            msg: json.message || `${json.totalFinalized ?? 0} tagihan selesai`,
            groupResults: json.groupResults,
          },
        }));
        await loadAll();
      }
    } catch {
      setResults((p) => ({ ...p, [targetIdpel]: { ok: false, msg: "Gagal menghubungi server" } }));
    } finally {
      setRunningIdpel(null);
    }
  }

  // ── filtered + grouped ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allPending;
    const q = filterIdpel.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.idpel.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q)
      );
    }
    if (filterTanggal) {
      list = list.filter((t) => t.createdAt.slice(0, 10) === filterTanggal);
    }
    return list;
  }, [allPending, filterIdpel, filterTanggal]);

  const groupedByIdpel = useMemo(() => {
    const map = new Map<string, {
      idpel: string; customerName: string;
      transactions: PendingTransaction[]; grandTotal: number;
    }>();
    for (const trx of filtered) {
      if (!map.has(trx.idpel)) {
        map.set(trx.idpel, { idpel: trx.idpel, customerName: trx.customerName, transactions: [], grandTotal: 0 });
      }
      const g = map.get(trx.idpel)!;
      g.transactions.push(trx);
      g.grandTotal += trx.grandTotal;
    }
    return Array.from(map.values());
  }, [filtered]);

  const totalGrand = allPending.reduce((s, t) => s + t.grandTotal, 0);
  const hasFilter  = !!filterIdpel.trim() || !!filterTanggal;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-blue-50/50 to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-3 py-1 text-xs font-bold uppercase tracking-wide mb-2">
              <span className="material-symbols-outlined text-sm">water_drop</span>
              Advice PDAM
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">
              Konfirmasi Pembayaran PDAM
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Transaksi PDAM yang timeout dan menunggu konfirmasi ke server PDAM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="shrink-0 self-start sm:self-auto inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <span className={`material-symbols-outlined text-base ${loading ? "animate-spin" : ""}`}>refresh</span>
            Refresh
          </button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-4 py-2">
            <span className="material-symbols-outlined text-amber-500 text-base">pending_actions</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">{loading ? "—" : allPending.length}</span>
            <span className="text-xs text-slate-400">transaksi pending</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-4 py-2">
            <span className="material-symbols-outlined text-blue-500 text-base">group</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">
              {loading ? "—" : new Set(allPending.map((t) => t.idpel)).size}
            </span>
            <span className="text-xs text-slate-400">pelanggan</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-4 py-2">
            <span className="material-symbols-outlined text-emerald-500 text-base">payments</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">{loading ? "—" : formatRupiah(totalGrand)}</span>
            <span className="text-xs text-slate-400">total nominal</span>
          </div>
        </div>
      </section>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input
            type="text"
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Cari nomor pelanggan atau nama..."
            value={filterIdpel}
            onChange={(e) => setFilterIdpel(e.target.value)}
          />
          {filterIdpel && (
            <button
              type="button"
              onClick={() => setFilterIdpel("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">calendar_today</span>
          <input
            type="date"
            className="h-10 pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full sm:w-44"
            value={filterTanggal}
            onChange={(e) => setFilterTanggal(e.target.value)}
          />
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setFilterIdpel(""); setFilterTanggal(""); }}
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            Hapus filter
          </button>
        )}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {loadError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
          <span className="material-symbols-outlined text-lg shrink-0">error</span>
          {loadError}
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
            Memuat data...
          </div>
        )}

        {!loading && groupedByIdpel.length === 0 && (
          <div className="py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-emerald-400 dark:text-emerald-600 block mb-3">task_alt</span>
            <p className="font-semibold text-slate-600 dark:text-slate-300">
              {hasFilter ? "Tidak ada hasil untuk filter ini" : "Tidak ada tagihan pending"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {hasFilter ? "Coba ubah kata kunci atau tanggal" : "Semua transaksi PDAM sudah terselesaikan"}
            </p>
          </div>
        )}

        {!loading && groupedByIdpel.length > 0 && (
          <>
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Pelanggan</span>
              <span className="text-right">Transaksi</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupedByIdpel.map((group) => {
                const res       = results[group.idpel];
                const isRunning = runningIdpel === group.idpel;
                const attempts  = group.transactions.reduce((s, t) => s + t.adviceAttempts, 0);

                return (
                  <div key={group.idpel}>
                    <div className="flex flex-wrap sm:grid sm:grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-5 py-4">
                      {/* Customer */}
                      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                        <span className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-500 shrink-0">
                          <span className="material-symbols-outlined text-base">person</span>
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 dark:text-white text-sm truncate">
                            {group.customerName || "-"}
                          </p>
                          <p className="font-mono text-xs text-slate-400">{group.idpel}</p>
                        </div>
                      </div>
                      {/* Count */}
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{group.transactions.length}</p>
                        <p className="text-xs text-slate-400">transaksi</p>
                      </div>
                      {/* Total */}
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800 dark:text-white">{formatRupiah(group.grandTotal)}</p>
                        {attempts > 0 && (
                          <p className="text-xs text-amber-500">{attempts}× dicoba</p>
                        )}
                      </div>
                      {/* Advice button */}
                      <div className="ml-auto sm:ml-0">
                        <button
                          type="button"
                          onClick={() => void handleAdvice(group.idpel)}
                          disabled={isRunning || !!runningIdpel}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                        >
                          {isRunning ? (
                            <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Proses...</>
                          ) : (
                            <><span className="material-symbols-outlined text-sm">sync</span>Advice</>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Transaction chips */}
                    <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                      {group.transactions.map((trx) => (
                        <span
                          key={trx.transactionCode}
                          title={`Dibuat: ${formatTanggal(trx.createdAt)}\nLoket: ${trx.loketName || trx.loketCode}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-default"
                        >
                          <span className="material-symbols-outlined text-amber-400 text-xs">hourglass_top</span>
                          {trx.transactionCode}
                          <span className="text-slate-300 dark:text-slate-600 mx-0.5">·</span>
                          {formatRupiah(trx.grandTotal)}
                          <span className="text-slate-300 dark:text-slate-600 mx-0.5">·</span>
                          {trx.createdAt.slice(0, 10)}
                        </span>
                      ))}
                    </div>

                    {/* Result message */}
                    {res?.msg && (
                      <div className={`mx-5 mb-3 rounded-lg px-3 py-2 text-xs font-medium flex items-start gap-2 ${
                        res.ok
                          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      }`}>
                        <span className="material-symbols-outlined text-sm shrink-0 mt-px">
                          {res.ok ? "check_circle" : "cancel"}
                        </span>
                        <div>
                          {res.msg}
                          {res.groupResults?.map((gr) => (
                            <p key={gr.transactionCode} className="opacity-80 mt-0.5">
                              {gr.transactionCode}:{" "}
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
                  </div>
                );
              })}
            </div>

            {hasFilter && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                Menampilkan {filtered.length} dari {allPending.length} transaksi
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
