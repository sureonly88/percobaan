"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Breadcrumb } from "@/ui";

interface ProviderHealth {
  providerName: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
  success24h: number;
  failure24h: number;
  total24h: number;
  successRate24h: number;
  avgLatencyMs24h: number;
  p95LatencyMs24h: number;
  rollupUpdatedAt: string | null;
}

interface TrendPoint {
  providerName: string;
  bucket: string;
  success: number;
  failure: number;
  avgLatencyMs: number;
}

interface JobStatus {
  jobName: string;
  isLocked: boolean;
  lockedAt: string | null;
  lastRunAt: string | null;
  lastRunMs: number | null;
  lastStatus: string | null;
  lastSummary: string | null;
  runCount: number;
  failCount: number;
}

interface ApiResp {
  providers: ProviderHealth[];
  trends: TrendPoint[];
  jobs: JobStatus[];
}

function stateBadge(state: ProviderHealth["state"]) {
  switch (state) {
    case "CLOSED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "HALF_OPEN":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "OPEN":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  }
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" });
}

export default function ProviderHealthPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/monitoring/provider-health", { cache: "no-store" });
      const json = (await res.json()) as ApiResp & { error?: string };
      if (!res.ok) {
        setError(json.error || "Gagal mengambil data");
      } else {
        setData(json);
      }
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-sky-50/40 to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 sm:p-7 shadow-sm">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Monitoring", href: "/monitoring" },
            { label: "Provider Health" },
          ]}
        />
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 px-3 py-1 text-xs font-bold uppercase tracking-wide mb-3">
              <span className="material-symbols-outlined text-sm">monitor_heart</span>
              Provider Health
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Kesehatan Provider 24 Jam
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Status circuit-breaker, success rate, latency rata-rata &amp; p95
              per provider eksternal (PDAM, Lunasin). Auto-refresh tiap 30
              detik.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white px-4 h-10 text-sm font-semibold hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Provider cards */}
      <section className="grid gap-4 md:grid-cols-2">
        {(data?.providers ?? []).map((p) => (
          <div
            key={p.providerName}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Provider
                </div>
                <div className="text-xl font-bold text-slate-800 dark:text-white">
                  {p.providerName}
                </div>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${stateBadge(p.state)}`}
              >
                {p.state}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Success rate (24h)" value={`${p.successRate24h}%`} />
              <Metric label="Total panggilan" value={p.total24h.toLocaleString("id-ID")} />
              <Metric label="Avg latency" value={`${p.avgLatencyMs24h} ms`} />
              <Metric label="p95 latency" value={`${p.p95LatencyMs24h} ms`} />
              <Metric label="Gagal beruntun" value={p.failureCount.toString()} />
              <Metric label="Sukses terakhir" value={fmtDate(p.lastSuccessAt)} />
            </div>

            {p.state === "OPEN" && (
              <div className="mt-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                Circuit OPEN sejak {fmtDate(p.openedAt)} — request ditolak
                sampai cooldown selesai.
              </div>
            )}
          </div>
        ))}

        {!loading && data && data.providers.length === 0 && (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            Belum ada data provider. Jalankan cron{" "}
            <code className="px-1 bg-slate-100 dark:bg-slate-800 rounded">
              /api/cron/provider-health-rollup
            </code>{" "}
            atau tunggu sample masuk.
          </div>
        )}
      </section>

      {/* Job status */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-3">
          Background Jobs
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr className="text-left">
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Terakhir Jalan</th>
                <th className="py-2 pr-4">Durasi</th>
                <th className="py-2 pr-4">Run / Fail</th>
                <th className="py-2 pr-4">Ringkasan</th>
              </tr>
            </thead>
            <tbody>
              {(data?.jobs ?? []).map((j) => (
                <tr
                  key={j.jobName}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-2 pr-4 font-mono text-xs">{j.jobName}</td>
                  <td className="py-2 pr-4">
                    {j.isLocked ? (
                      <span className="text-amber-600 dark:text-amber-300">
                        RUNNING
                      </span>
                    ) : j.lastStatus === "FAILED" ? (
                      <span className="text-red-600">FAILED</span>
                    ) : (
                      <span className="text-emerald-600">
                        {j.lastStatus ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{fmtDate(j.lastRunAt)}</td>
                  <td className="py-2 pr-4">
                    {j.lastRunMs == null ? "—" : `${j.lastRunMs} ms`}
                  </td>
                  <td className="py-2 pr-4">
                    {j.runCount} / {j.failCount}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-300">
                    {j.lastSummary ?? "—"}
                  </td>
                </tr>
              ))}
              {(!data || data.jobs.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Tidak ada job tercatat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </div>
      <div className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">
        {value}
      </div>
    </div>
  );
}
