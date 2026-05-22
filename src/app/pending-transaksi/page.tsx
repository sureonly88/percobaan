"use client";

import React, { useState, useCallback, useRef } from "react";
import { Breadcrumb } from "@/ui";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StaleItem {
  id: number;
  itemCode: string;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
  transactionCode: string | null;
  adviceAttempts: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  multiPaymentCode: string;
  loketCode: string;
  loketName: string | null;
  username: string | null;
  idempotencyKey: string;
  staleMinutes: number;
}

type ActionResult = {
  transactionCode: string;
  success: boolean;
  message: string;
};

type ProviderFilter = "ALL" | "PDAM" | "LUNASIN";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRupiah(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
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

function staleBadge(minutes: number) {
  if (minutes >= 60) return { label: `${Math.floor(minutes / 60)}j ${minutes % 60}m`, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  if (minutes >= 30) return { label: `${minutes}m`, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
  return { label: `${minutes}m`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
}

function providerBadge(provider: string) {
  if (provider === "PDAM") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (provider === "LUNASIN") return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
  return "bg-slate-100 text-slate-700";
}

// Group items by transactionCode
function groupByTransaction(items: StaleItem[]): Map<string, StaleItem[]> {
  const map = new Map<string, StaleItem[]>();
  for (const item of items) {
    const key = item.transactionCode || item.itemCode;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PendingTransaksiPage() {
  const [items, setItems] = useState<StaleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetched, setFetched] = useState(false);

  const [staleMinutes, setStaleMinutes] = useState(10);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("ALL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionResults, setActionResults] = useState<ActionResult[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (opts?: { stale?: number; prov?: ProviderFilter; q?: string }) => {
    const stale = opts?.stale ?? staleMinutes;
    const prov  = opts?.prov  ?? providerFilter;
    const q     = opts?.q     ?? search;

    setLoading(true);
    setError("");
    setFetched(true);

    const params = new URLSearchParams({
      staleMinutes: String(stale),
      provider: prov,
      ...(q ? { search: q } : {}),
    });

    try {
      const res  = await fetch(`/api/pembayaran/stale-pending?${params}`);
      const json = await res.json() as { items?: StaleItem[]; total?: number; error?: string };
      if (!res.ok) {
        setError(json.error || "Gagal mengambil data");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, [staleMinutes, providerFilter, search]);

  async function handleAction(transactionCode: string, action: "promote" | "cancel") {
    const label = action === "promote" ? "Promosikan ke PENDING_ADVICE" : "Batalkan transaksi";
    if (!confirm(`${label} untuk transaksi ${transactionCode}?`)) return;

    setActionLoading((prev) => ({ ...prev, [transactionCode]: true }));
    try {
      const res = await fetch("/api/pembayaran/stale-pending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionCode, action }),
      });
      const json = await res.json() as { success?: boolean; message?: string; error?: string };
      setActionResults((prev) => [
        { transactionCode, success: res.ok, message: json.message || json.error || "Selesai" },
        ...prev.slice(0, 9),
      ]);
      if (res.ok) {
        // Hapus item yang sudah diperbarui dari daftar
        setItems((prev) => prev.filter((item) => item.transactionCode !== transactionCode));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } catch {
      setActionResults((prev) => [
        { transactionCode, success: false, message: "Gagal menghubungi server" },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setActionLoading((prev) => ({ ...prev, [transactionCode]: false }));
    }
  }

  const grouped = groupByTransaction(items);
  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-amber-50/50 to-orange-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 sm:p-7 shadow-sm">
        <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Transaksi Tergantung" }]} />
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wide mb-3">
              <span className="material-symbols-outlined text-sm">pending_actions</span>
              Transaksi Tergantung
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">
              Stale Pending — Transaksi Terhenti
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Daftar item pembayaran yang tersimpan sebagai <code className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1 rounded text-xs font-mono">PENDING</code> lebih
              dari batas waktu yang ditentukan — kemungkinan proses server mati mendadak.
              Admin dapat mempromosikannya ke <code className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 rounded text-xs font-mono">PENDING_ADVICE</code> agar
              bisa diproses via menu Advice, atau membatalkan (FAILED) jika dipastikan tidak terproses.
            </p>
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap gap-3 items-end">
          {/* Stale threshold */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Terhenti lebih dari</label>
            <select
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              value={staleMinutes}
              onChange={(e) => setStaleMinutes(Number(e.target.value))}
            >
              <option value={5}>5 menit</option>
              <option value={10}>10 menit</option>
              <option value={15}>15 menit</option>
              <option value={30}>30 menit</option>
              <option value={60}>1 jam</option>
            </select>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Provider</label>
            <select
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
            >
              <option value="ALL">Semua</option>
              <option value="PDAM">PDAM</option>
              <option value="LUNASIN">Lunasin</option>
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Cari (idpel / kode)</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input
                ref={searchRef}
                type="text"
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="ID pelanggan, kode transaksi..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearch(searchInput);
                    void fetchData({ q: searchInput });
                  }
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch(searchInput);
              void fetchData({ q: searchInput });
            }}
            disabled={loading}
            className="h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base">refresh</span>
            )}
            Muat Ulang
          </button>
        </div>
      </section>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
          <span className="material-symbols-outlined text-lg shrink-0">error</span>
          <p>{error}</p>
        </div>
      )}

      {/* ── Action results ─────────────────────────────────────────────────── */}
      {actionResults.length > 0 && (
        <div className="space-y-2">
          {actionResults.map((r, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 flex items-start gap-3 text-sm ${
                r.success
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                  : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
              }`}
            >
              <span className="material-symbols-outlined text-lg shrink-0">{r.success ? "check_circle" : "error"}</span>
              <div>
                <span className="font-mono text-xs mr-2">{r.transactionCode}</span>
                {r.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {fetched && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Item</p>
            <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">{total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Grup Transaksi</p>
            <p className="mt-1 text-2xl font-black text-slate-800 dark:text-white">{grouped.size}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Nilai</p>
            <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{formatRupiah(grandTotal)}</p>
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {fetched && !loading && items.length === 0 && !error && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-5xl text-emerald-400 mb-3 block">task_alt</span>
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            Tidak ada transaksi tergantung
            {staleMinutes > 0 ? ` lebih dari ${staleMinutes} menit` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Semua pembayaran sudah terselesaikan dengan baik.
          </p>
        </div>
      )}

      {/* ── Initial state ───────────────────────────────────────────────────── */}
      {!fetched && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">pending_actions</span>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Klik <strong>Muat Ulang</strong> untuk memeriksa transaksi tergantung.
          </p>
        </div>
      )}

      {/* ── Transaction groups ──────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([txCode, txItems]) => {
            const first      = txItems[0];
            const txTotal    = txItems.reduce((s, i) => s + i.total, 0);
            const maxStale   = Math.max(...txItems.map((i) => i.staleMinutes));
            const stale      = staleBadge(maxStale);
            const isActing   = actionLoading[txCode] ?? false;

            return (
              <div
                key={txCode}
                className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
              >
                {/* Group header */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${providerBadge(first.provider)}`}>
                        {first.provider}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${stale.cls}`}>
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        {stale.label} yang lalu
                      </span>
                      <span className="text-xs text-slate-400">{txItems.length} item</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                      Trx: <span className="text-slate-700 dark:text-slate-200">{txCode}</span>
                      <span className="ml-3">MPay: {first.multiPaymentCode}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Loket: <span className="font-medium">{first.loketCode}{first.loketName ? ` — ${first.loketName}` : ""}</span>
                      {first.username && <span className="ml-2">• Kasir: <span className="font-medium">{first.username}</span></span>}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1">
                    <p className="text-sm font-black text-slate-800 dark:text-white">{formatRupiah(txTotal)}</p>
                    <p className="text-xs text-slate-400">{formatTanggal(first.createdAt)}</p>
                  </div>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="text-left px-4 py-2 font-semibold">ID Pelanggan</th>
                        <th className="text-left px-4 py-2 font-semibold">Nama</th>
                        <th className="text-left px-4 py-2 font-semibold">Periode</th>
                        <th className="text-right px-4 py-2 font-semibold">Total</th>
                        <th className="text-center px-4 py-2 font-semibold">Retry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txItems.map((item) => (
                        <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                          <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{item.customerId}</td>
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{item.customerName || "-"}</td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.periodLabel || "-"}</td>
                          <td className="px-4 py-2 text-right font-medium text-slate-800 dark:text-white">{formatRupiah(item.total)}</td>
                          <td className="px-4 py-2 text-center text-xs text-slate-400">{item.retryCount}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>
                      <strong>Promote</strong> → masuk menu Advice Manual (disarankan jika PDAM sempat menerima request).
                      <strong className="ml-1">Batalkan</strong> → tandai FAILED (jika yakin tidak terproses).
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => void handleAction(txCode, "promote")}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                    >
                      {isActing ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">upgrade</span>
                      )}
                      Promote ke Advice
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => void handleAction(txCode, "cancel")}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">cancel</span>
                      Batalkan
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
