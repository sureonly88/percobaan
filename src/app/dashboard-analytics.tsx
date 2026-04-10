"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, Cell,
} from "recharts";

/* ━━ Types ━━ */
interface MonthlyTrend {
  bulan: string;
  label: string;
  pdamTrx: number;
  pdamNominal: number;
  plnTrx: number;
  plnNominal: number;
  bpjsTrx: number;
  bpjsNominal: number;
  telkomTrx: number;
  telkomNominal: number;
  pulsaTrx: number;
  pulsaNominal: number;
  paketdataTrx: number;
  paketdataNominal: number;
  pdamLunasinTrx: number;
  pdamLunasinNominal: number;
  totalTrx: number;
  totalNominal: number;
}

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface LoketRank {
  loketCode: string;
  loketName: string;
  trx: number;
  nominal: number;
  growth: number;
}

interface PeriodComparison {
  current: { trx: number; nominal: number };
  mom: { trx: number; nominal: number; trxGrowth: number; nominalGrowth: number };
  yoy: { trx: number; nominal: number; trxGrowth: number; nominalGrowth: number };
}

interface AnalyticsData {
  monthlyTrend: MonthlyTrend[];
  heatmap: HeatmapCell[];
  loketRanking: LoketRank[];
  periodComparison: PeriodComparison;
}

function formatRupiah(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`;
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatFull(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

/* ━━ Custom Tooltip ━━ */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold">{formatFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. Monthly Trend Line Chart
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const TREND_LINES = [
  { key: "pdam", name: "PDAM", color: "#3b82f6" },
  { key: "pln", name: "PLN", color: "#d97706" },
  { key: "bpjs", name: "BPJS", color: "#16a34a" },
  { key: "telkom", name: "Telkom", color: "#dc2626" },
  { key: "pulsa", name: "Pulsa", color: "#9333ea" },
  { key: "paketdata", name: "Paket Data", color: "#0891b2" },
  { key: "pdamLunasin", name: "PDAM Lunasin", color: "#0284c7" },
] as const;

function MonthlyTrendChart({ data }: { data: MonthlyTrend[] }) {
  const [mode, setMode] = useState<"nominal" | "trx">("nominal");

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">show_chart</span>
          <h3 className="font-bold text-lg">Tren Bulanan Per Produk</h3>
        </div>
        <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setMode("nominal")}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${mode === "nominal" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"}`}
          >
            Nominal
          </button>
          <button
            onClick={() => setMode("trx")}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${mode === "trx" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"}`}
          >
            Transaksi
          </button>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid, #e2e8f0)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => mode === "nominal" ? formatRupiah(v) : String(v)}
              width={70}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {TREND_LINES.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={mode === "nominal" ? `${line.key}Nominal` : `${line.key}Trx`}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 3, fill: line.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. Transaction Heatmap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

function TransactionHeatmap({ data }: { data: HeatmapCell[] }) {
  const { grid, maxCount } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const cell of data) {
      const dayIdx = cell.day - 1; // DAYOFWEEK: 1=Sun → index 0
      g[dayIdx][cell.hour] = cell.count;
      if (cell.count > max) max = cell.count;
    }
    return { grid: g, maxCount: max };
  }, [data]);

  function getColor(count: number): string {
    if (maxCount === 0 || count === 0) return "bg-slate-50 dark:bg-slate-800/30";
    const ratio = count / maxCount;
    if (ratio < 0.2) return "bg-primary/10";
    if (ratio < 0.4) return "bg-primary/25";
    if (ratio < 0.6) return "bg-primary/40";
    if (ratio < 0.8) return "bg-primary/60";
    return "bg-primary/85";
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">grid_on</span>
        <h3 className="font-bold text-lg">Heatmap Transaksi</h3>
        <span className="text-xs text-slate-400 ml-1">(3 bulan terakhir)</span>
      </div>
      <div className="p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((h) => (
              <span key={h} className="text-[10px] text-slate-400 font-mono" style={{ width: `${(3 / 24) * 100}%` }}>
                {h.slice(0, 2)}
              </span>
            ))}
          </div>
          {/* Rows */}
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] text-slate-500 font-semibold w-8 text-right mr-1">
                {DAY_LABELS[dayIdx]}
              </span>
              <div className="flex-1 flex gap-px">
                {row.map((count, hourIdx) => (
                  <div
                    key={hourIdx}
                    className={`flex-1 aspect-square rounded-sm ${getColor(count)} transition-colors cursor-default`}
                    title={`${DAY_LABELS[dayIdx]} ${HOUR_LABELS[hourIdx]} — ${count} transaksi`}
                  />
                ))}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3 mr-0.5">
            <span className="text-[10px] text-slate-400">Sedikit</span>
            {["bg-slate-50 dark:bg-slate-800/30", "bg-primary/10", "bg-primary/25", "bg-primary/40", "bg-primary/60", "bg-primary/85"].map((c, i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-sm ${c}`} />
            ))}
            <span className="text-[10px] text-slate-400">Banyak</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. Loket Performance Ranking
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const BAR_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#f97316", "#ef4444"];

function LoketRankingChart({ data }: { data: LoketRank[] }) {
  const [view, setView] = useState<"best" | "worst">("best");

  const sorted = useMemo(() => {
    const s = [...data];
    return view === "best" ? s.slice(0, 8) : s.reverse().slice(0, 8);
  }, [data, view]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">leaderboard</span>
          <h3 className="font-bold text-lg">Ranking Performa Loket</h3>
          <span className="text-xs text-slate-400">(Bulan Ini)</span>
        </div>
        <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setView("best")}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${view === "best" ? "bg-white dark:bg-slate-700 shadow-sm text-emerald-600" : "text-slate-500"}`}
          >
            <span className="material-symbols-outlined text-sm mr-1 align-middle">trending_up</span>
            Terbaik
          </button>
          <button
            onClick={() => setView("worst")}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${view === "worst" ? "bg-white dark:bg-slate-700 shadow-sm text-red-500" : "text-slate-500"}`}
          >
            <span className="material-symbols-outlined text-sm mr-1 align-middle">trending_down</span>
            Terendah
          </button>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {sorted.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">Belum ada data transaksi bulan ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 48)}>
            <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--grid, #e2e8f0)" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatRupiah(v)} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="loketName"
                width={120}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip
                formatter={(value: any) => [formatFull(Number(value)), "Nominal"]}
                labelFormatter={(label: any) => `Loket: ${label}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="nominal" radius={[0, 6, 6, 0]} barSize={28}>
                {sorted.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {/* Table summary below chart */}
        {sorted.length > 0 && (
          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sorted.map((l, i) => (
                <div key={l.loketCode} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <span className="text-xs font-black text-slate-300 w-5 text-center">#{i + 1}</span>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{l.loketName}</p>
                    <p className="text-[10px] text-slate-400">{l.trx} trx</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold">{formatRupiah(l.nominal)}</p>
                    <p className={`text-[10px] font-bold ${l.growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {l.growth >= 0 ? "+" : ""}{l.growth}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. Period Comparison (MoM & YoY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function PeriodComparisonCard({ data }: { data: PeriodComparison }) {
  const bulanNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const now = new Date();
  const curMonthLabel = bulanNames[now.getMonth()];
  const prevMonthLabel = bulanNames[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

  const cards = [
    {
      title: "Bulan Ini",
      subtitle: curMonthLabel + " " + now.getFullYear(),
      trx: data.current.trx,
      nominal: data.current.nominal,
      icon: "calendar_today",
      color: "primary",
    },
    {
      title: "vs Bulan Lalu (MoM)",
      subtitle: prevMonthLabel,
      trx: data.mom.trx,
      nominal: data.mom.nominal,
      trxGrowth: data.mom.trxGrowth,
      nominalGrowth: data.mom.nominalGrowth,
      icon: "compare_arrows",
      color: "blue",
    },
    {
      title: "vs Tahun Lalu (YoY)",
      subtitle: `${curMonthLabel} ${now.getFullYear() - 1}`,
      trx: data.yoy.trx,
      nominal: data.yoy.nominal,
      trxGrowth: data.yoy.trxGrowth,
      nominalGrowth: data.yoy.nominalGrowth,
      icon: "date_range",
      color: "purple",
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">compare</span>
        <h3 className="font-bold text-lg">Perbandingan Periode</h3>
      </div>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <div
              key={i}
              className={`rounded-xl p-5 border ${
                i === 0
                  ? "bg-primary/5 border-primary/20"
                  : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`material-symbols-outlined text-lg ${i === 0 ? "text-primary" : "text-slate-400"}`}>{c.icon}</span>
                <div>
                  <p className="text-xs font-bold">{c.title}</p>
                  <p className="text-[10px] text-slate-400">{c.subtitle}</p>
                </div>
              </div>
              <p className="text-xl font-black">{formatFull(c.nominal)}</p>
              <p className="text-xs text-slate-500 mt-1">{c.trx.toLocaleString("id-ID")} transaksi</p>
              {"nominalGrowth" in c && c.nominalGrowth !== undefined && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Nominal</span>
                    <span className={`font-bold flex items-center gap-0.5 ${c.nominalGrowth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      <span className="material-symbols-outlined text-sm">
                        {c.nominalGrowth >= 0 ? "trending_up" : "trending_down"}
                      </span>
                      {c.nominalGrowth >= 0 ? "+" : ""}{c.nominalGrowth}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Transaksi</span>
                    <span className={`font-bold flex items-center gap-0.5 ${(c.trxGrowth ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      <span className="material-symbols-outlined text-sm">
                        {(c.trxGrowth ?? 0) >= 0 ? "trending_up" : "trending_down"}
                      </span>
                      {(c.trxGrowth ?? 0) >= 0 ? "+" : ""}{c.trxGrowth}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Analytics Dashboard Component
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function DashboardAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/analytics")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-48" />
              <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">error_outline</span>
        <p className="text-slate-500 text-sm">Gagal memuat data analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Comparison */}
      <PeriodComparisonCard data={data.periodComparison} />

      {/* Monthly Trend */}
      <MonthlyTrendChart data={data.monthlyTrend} />

      {/* Heatmap */}
      <TransactionHeatmap data={data.heatmap} />

      {/* Ranking Loket */}
      <LoketRankingChart data={data.loketRanking} />
    </div>
  );
}
