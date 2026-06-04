"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/ui";

type RiskSeverity = "critical" | "high" | "medium" | "low";

interface RiskSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  score: number;
  pendingStale: number;
  paymentLinkIssues: number;
  providerIssues: number;
  loketIssues: number;
  settlementIssues: number;
  jobIssues: number;
}

interface RiskItem {
  id: string;
  type: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  metric: string;
  href: string;
  createdAt: string | null;
}

interface RiskResponse {
  generatedAt: string;
  summary: RiskSummary;
  priorityItems: RiskItem[];
}

function severityStyle(severity: RiskSeverity) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    case "high":
      return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
    case "medium":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
    case "low":
      return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  }
}

function riskTone(score: number) {
  if (score >= 75) return { label: "Kritis", color: "text-red-600", bar: "bg-red-500", bg: "from-red-50 to-orange-50 dark:from-red-950/30 dark:to-slate-900" };
  if (score >= 45) return { label: "Tinggi", color: "text-orange-600", bar: "bg-orange-500", bg: "from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-slate-900" };
  if (score >= 20) return { label: "Waspada", color: "text-amber-600", bar: "bg-amber-500", bg: "from-amber-50 to-sky-50 dark:from-amber-950/20 dark:to-slate-900" };
  return { label: "Normal", color: "text-emerald-600", bar: "bg-emerald-500", bg: "from-emerald-50 to-sky-50 dark:from-emerald-950/20 dark:to-slate-900" };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

const QUICK_ACTIONS = [
  { href: "/pending-transaksi", icon: "pending_actions", label: "Resolve Pending", tone: "text-amber-700 bg-amber-50 border-amber-100" },
  { href: "/payment-links", icon: "link", label: "Cek Payment Link", tone: "text-indigo-700 bg-indigo-50 border-indigo-100" },
  { href: "/monitoring/provider-health", icon: "monitor_heart", label: "Provider Health", tone: "text-cyan-700 bg-cyan-50 border-cyan-100" },
  { href: "/rekonsiliasi", icon: "table_view", label: "Rekonsiliasi", tone: "text-emerald-700 bg-emerald-50 border-emerald-100" },
  { href: "/settlement", icon: "handshake", label: "Settlement", tone: "text-violet-700 bg-violet-50 border-violet-100" },
];

export default function RiskDashboardPage() {
  const [data, setData] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | RiskSeverity>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/monitoring/risiko", { cache: "no-store" });
      const json = (await res.json()) as RiskResponse & { error?: string };
      if (!res.ok) {
        setError(json.error || "Gagal mengambil data risiko");
        return;
      }
      setData(json);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const summary = data?.summary;
  const tone = riskTone(summary?.score ?? 0);
  const filteredItems = useMemo(() => {
    const items = data?.priorityItems ?? [];
    if (severityFilter === "all") return items;
    return items.filter((item) => item.severity === severityFilter);
  }, [data?.priorityItems, severityFilter]);

  return (
    <div className="space-y-6">
      <section className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br ${tone.bg} p-6 sm:p-7 shadow-sm`}>
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Monitoring", href: "/monitoring" },
            { label: "Risiko Transaksi" },
          ]}
        />
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_260px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-900/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 shadow-sm">
              <span className="material-symbols-outlined text-sm text-red-500">crisis_alert</span>
              Command Center
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Dashboard Risiko Transaksi
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Satu layar untuk melihat transaksi pending lama, payment link bermasalah, provider tidak sehat, saldo/loket berisiko, settlement tertahan, dan background job yang gagal.
            </p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-white/70 dark:border-slate-800 p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Risk Score</p>
                <p className={`mt-1 text-4xl font-black ${tone.color}`}>{summary?.score ?? 0}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${tone.color} bg-slate-50 dark:bg-slate-800`}>{tone.label}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, summary?.score ?? 0)}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Auto-refresh tiap 30 detik · {data ? formatDate(data.generatedAt) : "memuat"}</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <SummaryCard icon="priority_high" label="Kritis" value={summary?.critical ?? 0} tone="text-red-600 bg-red-50 dark:bg-red-900/20" />
        <SummaryCard icon="warning" label="Tinggi" value={summary?.high ?? 0} tone="text-orange-600 bg-orange-50 dark:bg-orange-900/20" />
        <SummaryCard icon="schedule" label="Pending Lama" value={summary?.pendingStale ?? 0} tone="text-amber-600 bg-amber-50 dark:bg-amber-900/20" />
        <SummaryCard icon="link_off" label="Payment Link" value={summary?.paymentLinkIssues ?? 0} tone="text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" />
        <SummaryCard icon="monitor_heart" label="Provider" value={summary?.providerIssues ?? 0} tone="text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20" />
        <SummaryCard icon="storefront" label="Loket" value={summary?.loketIssues ?? 0} tone="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" />
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black">Aksi Cepat</h2>
            <p className="text-sm text-slate-500">Lompat ke halaman sumber untuk menindaklanjuti risiko.</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            <span className={`material-symbols-outlined text-base ${loading ? "animate-spin" : ""}`}>{loading ? "progress_activity" : "refresh"}</span>
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${action.tone}`}>
              <span className="material-symbols-outlined text-2xl">{action.icon}</span>
              <p className="mt-2 text-sm font-black">{action.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black">Prioritas Tindakan</h2>
            <p className="text-sm text-slate-500">Diurutkan dari risiko tertinggi.</p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
            {(["all", "critical", "high", "medium"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setSeverityFilter(value)}
                className={`rounded-lg px-3 py-2 capitalize ${severityFilter === value ? "bg-white text-primary shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
              >
                {value === "all" ? "Semua" : value}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined animate-spin text-4xl block mb-2">progress_activity</span>
            Memuat risiko transaksi...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3 text-emerald-500">verified</span>
            <p className="font-bold text-slate-600 dark:text-slate-300">Tidak ada risiko pada filter ini.</p>
            <p className="text-sm mt-1">Tetap pantau provider health dan pending transaksi secara berkala.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((item) => (
              <Link key={item.id} href={item.href} className="group grid gap-3 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 md:grid-cols-[160px_1fr_140px_36px] md:items-center">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${severityStyle(item.severity)}`}>{item.severity}</span>
                  <span className="text-xs font-bold text-slate-400">{item.type}</span>
                </div>
                <div>
                  <p className="font-black text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-black text-slate-800 dark:text-white">{item.metric}</p>
                  <p className="text-[11px] text-slate-400">{formatDate(item.createdAt)}</p>
                </div>
                <span className="material-symbols-outlined text-slate-300 transition group-hover:translate-x-1 group-hover:text-primary">arrow_forward</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">{value.toLocaleString("id-ID")}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
