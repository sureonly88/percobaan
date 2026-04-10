"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";

const DashboardAnalytics = dynamic(() => import("./dashboard-analytics"), {
  ssr: false,
  loading: () => (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-48" />
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
      </div>
    </div>
  ),
});

/* ── Types ── */
interface KategoriSummary {
  nominal: number;
  growth: number;
}

interface KategoriHariIni {
  trx: number;
  nominal: number;
}

interface DashboardData {
  summary: {
    pdam: { nominal: number; growth: number };
    lunasin: Record<string, KategoriSummary>;
    totalTahun: number;
  };
  hariIni: {
    totalTrx: number;
    totalNominal: number;
    sukses: number;
    gagal: number;
    pdam: { trx: number; nominal: number };
    perKategori: Record<string, KategoriHariIni>;
  };
  saldoLoket: {
    id: number;
    nama: string;
    loketCode: string;
    alamat: string;
    jenis: string;
    pulsa: number;
    biayaAdmin: number;
    status: string;
  }[];
  transaksiTerakhir: {
    jenis: string;
    idPelanggan: string;
    namaPelanggan: string;
    nominal: number;
    biayaAdmin: number;
    status: string;
    loketName: string;
    tanggal: string;
  }[];
}

const KATEGORI_CONFIG: Record<string, { icon: string; color: string; bgIcon: string; bgBadge: string; textBadge: string }> = {
  PDAM: { icon: "water_drop", color: "text-blue-600", bgIcon: "bg-blue-50 dark:bg-blue-900/30", bgBadge: "bg-blue-50 dark:bg-blue-900/30", textBadge: "text-blue-600" },
  PLN: { icon: "bolt", color: "text-amber-600", bgIcon: "bg-amber-50 dark:bg-amber-900/30", bgBadge: "bg-amber-50 dark:bg-amber-900/30", textBadge: "text-amber-600" },
  BPJS: { icon: "health_and_safety", color: "text-green-600", bgIcon: "bg-green-50 dark:bg-green-900/30", bgBadge: "bg-green-50 dark:bg-green-900/30", textBadge: "text-green-600" },
  Telkom: { icon: "call", color: "text-red-600", bgIcon: "bg-red-50 dark:bg-red-900/30", bgBadge: "bg-red-50 dark:bg-red-900/30", textBadge: "text-red-600" },
  Pulsa: { icon: "smartphone", color: "text-purple-600", bgIcon: "bg-purple-50 dark:bg-purple-900/30", bgBadge: "bg-purple-50 dark:bg-purple-900/30", textBadge: "text-purple-600" },
  "Paket Data": { icon: "wifi", color: "text-cyan-600", bgIcon: "bg-cyan-50 dark:bg-cyan-900/30", bgBadge: "bg-cyan-50 dark:bg-cyan-900/30", textBadge: "text-cyan-600" },
  "PDAM Lunasin": { icon: "water_drop", color: "text-sky-600", bgIcon: "bg-sky-50 dark:bg-sky-900/30", bgBadge: "bg-sky-50 dark:bg-sky-900/30", textBadge: "text-sky-600" },
};

const LUNASIN_KATEGORI = ["PLN", "BPJS", "Telkom", "Pulsa", "Paket Data", "PDAM Lunasin"] as const;

const PIE_COLORS: Record<string, string> = {
  PDAM: "#3b82f6",
  PLN: "#d97706",
  BPJS: "#16a34a",
  Telkom: "#dc2626",
  Pulsa: "#9333ea",
  "Paket Data": "#0891b2",
  "PDAM Lunasin": "#0284c7",
};

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
    year: undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Proportion Donut ── */
function ProportionDonut({ summary, loading }: { summary: DashboardData["summary"] | undefined; loading: boolean }) {
  const pieData = useMemo(() => {
    if (!summary) return [];
    const items: { name: string; value: number }[] = [];
    if (summary.pdam.nominal > 0) items.push({ name: "PDAM", value: summary.pdam.nominal });
    for (const kat of LUNASIN_KATEGORI) {
      const nominal = summary.lunasin?.[kat]?.nominal ?? 0;
      if (nominal > 0) items.push({ name: kat, value: nominal });
    }
    return items.sort((a, b) => b.value - a.value);
  }, [summary]);

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">donut_large</span>
          <h3 className="font-bold text-lg">Distribusi Produk</h3>
        </div>
        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-wider">
          Bulan Ini
        </span>
      </div>
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Memuat data...</div>
      ) : pieData.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">Belum ada data transaksi bulan ini.</div>
      ) : (
        <div className="p-6 flex flex-col items-center gap-4">
          {/* Donut */}
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatRupiah(Number(value)), "Nominal"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="w-full space-y-1">
            {pieData.map((entry) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={entry.name} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[entry.name] ?? "#94a3b8" }} />
                  <span className="text-sm font-semibold flex-1">{entry.name}</span>
                  <span className="text-sm font-bold">{formatRupiah(entry.value)}</span>
                  <span className="text-xs font-bold text-slate-400 w-12 text-right">{pct}%</span>
                </div>
              );
            })}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-2 flex items-center gap-3 px-2.5">
              <div className="w-3" />
              <span className="text-sm font-bold text-slate-500 flex-1">Total</span>
              <span className="text-sm font-black">{formatRupiah(total)}</span>
              <span className="text-xs font-bold text-slate-400 w-12 text-right">100%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Component ── */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"overview" | "analytics">("overview");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const hariIni = data?.hariIni;
  const saldoLoket = data?.saldoLoket ?? [];
  const transaksiTerakhir = data?.transaksiTerakhir ?? [];
  return (
    <>
      {/* Title + View Toggle */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Ringkasan Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Pantau penggunaan dan pembayaran utilitas PDAM &amp; Lunasin Anda.
          </p>
        </div>
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveView("overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeView === "overview"
                ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="material-symbols-outlined text-lg">dashboard</span>
            Overview
          </button>
          <button
            onClick={() => setActiveView("analytics")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeView === "analytics"
                ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="material-symbols-outlined text-lg">analytics</span>
            Analytics
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {/* PDAM Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600">
                <span className="material-symbols-outlined">water_drop</span>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                Bulan Ini
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500">PDAM</p>
            <h3 className="text-xl font-black mt-0.5">
              {loading ? "..." : formatRupiah(summary?.pdam.nominal ?? 0)}
            </h3>
            <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold ${(summary?.pdam.growth ?? 0) >= 0 ? "text-green-600" : "text-red-500"}`}>
              <span className="material-symbols-outlined text-xs">
                {(summary?.pdam.growth ?? 0) >= 0 ? "trending_up" : "trending_down"}
              </span>
              <span>{(summary?.pdam.growth ?? 0) >= 0 ? "+" : ""}{summary?.pdam.growth ?? 0}%</span>
            </div>
          </div>
        </div>

        {/* Per-kategori Lunasin */}
        {LUNASIN_KATEGORI.map((kat) => {
          const cfg = KATEGORI_CONFIG[kat];
          const katData = summary?.lunasin?.[kat];
          const nominal = katData?.nominal ?? 0;
          const growth = katData?.growth ?? 0;
          return (
            <div key={kat} className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 ${cfg.bgIcon} rounded-lg ${cfg.color}`}>
                    <span className="material-symbols-outlined">{cfg.icon}</span>
                  </div>
                  <span className={`text-[10px] font-bold ${cfg.textBadge} ${cfg.bgBadge} px-2 py-0.5 rounded`}>
                    Bulan Ini
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-500">{kat}</p>
                <h3 className="text-xl font-black mt-0.5">
                  {loading ? "..." : formatRupiah(nominal)}
                </h3>
                <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold ${growth >= 0 ? "text-green-600" : "text-red-500"}`}>
                  <span className="material-symbols-outlined text-xs">
                    {growth >= 0 ? "trending_up" : "trending_down"}
                  </span>
                  <span>{growth >= 0 ? "+" : ""}{growth}%</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Total Card */}
        <div className="bg-primary p-5 rounded-xl shadow-lg shadow-primary/20 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <span className="material-symbols-outlined text-white">account_balance</span>
              </div>
            </div>
            <p className="text-xs font-medium text-white/80">Total Tahun {new Date().getFullYear()}</p>
            <h3 className="text-xl font-black mt-0.5">
              {loading ? "..." : formatRupiah(summary?.totalTahun ?? 0)}
            </h3>
            <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-white/90">
              <span className="material-symbols-outlined text-xs">calendar_today</span>
              <span>Akumulasi keseluruhan</span>
            </div>
          </div>
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12"></div>
        </div>
      </div>

      {/* Analytics View */}
      {activeView === "analytics" && <DashboardAnalytics />}

      {/* Overview View */}
      {activeView === "overview" && (<>
      {/* Main Content */}
      <div className="space-y-8">
          {/* Distribusi Produk + Ringkasan Hari Ini */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Distribusi Produk Donut Chart */}
          <ProportionDonut summary={summary} loading={loading} />

          {/* Ringkasan Hari Ini */}
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">today</span>
                <h3 className="font-bold text-lg">Ringkasan Hari Ini</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Memuat data...</div>
            ) : (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
                      <span className="material-symbols-outlined">receipt_long</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-500">Total Transaksi</p>
                      <p className="text-xs font-black">{hariIni?.totalTrx ?? 0} <span className="text-sm font-bold text-slate-400">trx</span></p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                      <span className="material-symbols-outlined">payments</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-500">Total Nominal</p>
                      <p className="text-xs font-black truncate">{formatRupiah(hariIni?.totalNominal ?? 0)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600">
                      <span className="material-symbols-outlined text-lg">water_drop</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-500">PDAM</p>
                      <p className="text-sm font-black truncate">{formatRupiah(hariIni?.pdam.nominal ?? 0)}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-400">{hariIni?.pdam.trx ?? 0}</span>
                  </div>

                  {LUNASIN_KATEGORI.map((kat) => {
                    const cfg = KATEGORI_CONFIG[kat];
                    const katData = hariIni?.perKategori?.[kat];
                    return (
                      <div key={kat} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className={`p-2 ${cfg.bgIcon} rounded-lg ${cfg.color}`}>
                          <span className="material-symbols-outlined text-lg">{cfg.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-500">{kat}</p>
                          <p className="text-sm font-black truncate">{formatRupiah(katData?.nominal ?? 0)}</p>
                        </div>
                        <span className="text-xs font-bold text-slate-400">{katData?.trx ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>{/* end grid */}

          {/* Ringkasan Transaksi Terakhir */}
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  history
                </span>
                <h3 className="font-bold text-lg">
                  Ringkasan Transaksi Terakhir
                </h3>
              </div>
              <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-wider">
                7 Hari Terakhir
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4">Jenis &amp; ID</th>
                    <th className="px-6 py-4">Loket</th>
                    <th className="px-6 py-4 text-right">Tagihan</th>
                    <th className="px-6 py-4 text-right">Biaya Admin</th>
                    <th className="px-6 py-4 text-right">Total Bayar</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400 text-sm">Memuat data...</td>
                    </tr>
                  ) : transaksiTerakhir.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400 text-sm">Belum ada data transaksi.</td>
                    </tr>
                  ) : transaksiTerakhir.map((item, i) => {
                    const tagihan = item.nominal - item.biayaAdmin;
                    return (
                    <tr
                      key={i}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-6 py-4 text-slate-500">
                        {formatTanggal(item.tanggal)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`material-symbols-outlined ${(KATEGORI_CONFIG[item.jenis] ?? KATEGORI_CONFIG["PDAM"]).color} text-base`}
                          >
                            {(KATEGORI_CONFIG[item.jenis] ?? KATEGORI_CONFIG["PDAM"]).icon}
                          </span>
                          <span className="font-medium">{item.jenis} - {item.idPelanggan}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {item.loketName}
                      </td>
                      <td className="px-6 py-4 text-right">{formatRupiah(tagihan)}</td>
                      <td className="px-6 py-4 text-right text-slate-500">{formatRupiah(item.biayaAdmin)}</td>
                      <td className="px-6 py-4 text-right font-bold">{formatRupiah(item.nominal)}</td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600"
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Penting */}
          <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex gap-4 items-start">
            <span className="material-symbols-outlined text-primary">info</span>
            <div>
              <h4 className="text-sm font-bold text-primary">Info Penting</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Pastikan Anda membayar tagihan sebelum tanggal 20 setiap
                bulannya untuk menghindari denda keterlambatan.
              </p>
            </div>
          </div>
      </div>
      </>)}

      {/* Footer */}
      <footer className="mt-12 py-10 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-slate-400 text-sm">
          © {new Date().getFullYear()} Pedami Payment. Layanan Pembayaran Terpadu Indonesia.
        </p>
      </footer>
    </>
  );
}
