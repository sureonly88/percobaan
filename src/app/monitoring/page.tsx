"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/ui";
import { formatRupiah } from "@/data/mock";
import InquiryMonitoringTab from "./InquiryMonitoringTab";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

interface TransactionSummary {
  count: number;
  billCount: number;
}

interface MonitoringTransaction {
  id: number;
  idempotencyKey: string;
  transactionCode?: string | null;
  status: "PENDING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  provider: string;
  loketCode: string;
  username: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorCategory?: string;
  lastEventType?: string | null;
  lastEventSeverity?: "INFO" | "WARN" | "ERROR" | null;
  lastEventMessage?: string | null;
  attempts?: number | null;
  createdAt: string;
  updatedAt: string;
  durationSeconds: number;
  isStuck: boolean;
  billCount: number;
  successBills: number;
  failedBills: number;
  totalNominal: number;
}

interface MonitoringData {
  summary: Record<string, TransactionSummary>;
  metrics: {
    successRate: number;
    failureRate: number;
    avgDurationSeconds: number;
    topError: { code: string; count: number } | null;
    totalRetries: number;
    providerFailures: number;
    dbFailures: number;
    networkFailures: number;
  };
  alerts: Array<{
    level: "WARN" | "ERROR";
    title: string;
    message: string;
  }>;
  dailyTrends: Array<{
    date: string;
    label: string;
    total: number;
    success: number;
    failed: number;
    pending: number;
    partialSuccess: number;
  }>;
  errorCategorySummary: Array<{
    category: string;
    count: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
  stuckCount: number;
  transactions: MonitoringTransaction[];
}

interface LogEntry {
  id: number;
  eventType?: string;
  severity?: "INFO" | "WARN" | "ERROR";
  provider?: string;
  httpStatus?: number | null;
  providerErrorCode?: string | null;
  message?: string | null;
  payload?: unknown;
  idempotencyKey?: string | null;
  transactionCode?: string | null;
  custId?: string | null;
  username?: string | null;
  loketCode?: string | null;
  jenis?: string;
  log?: Record<string, unknown> | string;
  createdAt: string;
  userLogin?: string;
}

type StatusFilter = "ALL" | "PENDING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "STUCK";
type ErrorCategoryFilter = "ALL" | "DB" | "NETWORK" | "PROVIDER" | "MANUAL" | "APPLICATION";
type MonitoringViewTab = "transaction" | "inquiry";
type ProviderFilter = "ALL" | "PDAM" | "LUNASIN";

const STATUS_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string; dot: string }> = {
  PENDING: {
    label: "Pending",
    icon: "hourglass_top",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-700 dark:text-yellow-400",
    dot: "bg-yellow-500",
  },
  SUCCESS: {
    label: "Sukses",
    icon: "check_circle",
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-400",
    dot: "bg-green-500",
  },
  PARTIAL_SUCCESS: {
    label: "Sebagian Sukses",
    icon: "warning",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  FAILED: {
    label: "Gagal",
    icon: "cancel",
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
};

const ERROR_CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  DB: { label: "DB", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  NETWORK: { label: "Network", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  PROVIDER: { label: "Provider", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  MANUAL: { label: "Manual", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  APPLICATION: { label: "App", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  "-": { label: "-", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MonitoringViewTab>("transaction");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [errorCategoryFilter, setErrorCategoryFilter] = useState<ErrorCategoryFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logs, setLogs] = useState<Record<number, LogEntry[]>>({});
  const [logsLoading, setLogsLoading] = useState<number | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (errorCategoryFilter !== "ALL") params.set("errorCategory", errorCategoryFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (userFilter.trim()) params.set("username", userFilter.trim());
      if (search.trim()) params.set("search", search.trim());
      if (providerFilter !== "ALL") params.set("provider", providerFilter);

      const res = await fetch(`/api/monitoring?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* ignore fetch errors for polling */
    } finally {
      setLoading(false);
    }
  }, [statusFilter, errorCategoryFilter, page, pageSize, startDate, endDate, search, userFilter, providerFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, errorCategoryFilter, startDate, endDate, search, userFilter, providerFilter, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh: adaptive interval (15s if pending/stuck, 60s otherwise)
  useEffect(() => {
    if (!autoRefresh) return;
    const hasPending = (data?.summary?.PENDING?.count ?? 0) > 0;
    const hasStuck = (data?.stuckCount ?? 0) > 0;
    const interval = (hasPending || hasStuck) ? 15000 : 60000;
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData, data?.summary?.PENDING?.count, data?.stuckCount]);

  async function handleResolveStuck(id: number) {
    if (!confirm("Yakin ingin meresolve transaksi gantung ini sebagai GAGAL?")) return;
    setResolving(id);
    try {
      const res = await fetch("/api/monitoring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "resolve_stuck" }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal meresolve transaksi");
      }
    } catch {
      alert("Gagal menghubungi server");
    } finally {
      setResolving(null);
    }
  }

  async function fetchLogs(txn: MonitoringTransaction) {
    if (logs[txn.id]) return; // already loaded
    setLogsLoading(txn.id);
    try {
      const params = new URLSearchParams({
        idempotencyKey: txn.idempotencyKey,
      });
      const res = await fetch(`/api/monitoring/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs((prev) => ({ ...prev, [txn.id]: data.logs || [] }));
      }
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(null);
    }
  }

  function handleExpand(txn: MonitoringTransaction) {
    if (expandedId === txn.id) {
      setExpandedId(null);
    } else {
      setExpandedId(txn.id);
      fetchLogs(txn);
    }
  }

  async function handleCopyLog(entry: LogEntry) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry.payload ?? entry.log ?? entry, null, 2));
      setCopiedLogId(entry.id);
      window.setTimeout(() => setCopiedLogId((current) => (current === entry.id ? null : current)), 1500);
    } catch {
      alert("Gagal menyalin log");
    }
  }

  function handleExportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    if (!data) return;
    const header = [
      "id",
      "idempotencyKey",
      "transactionCode",
        "provider",
      "status",
      "errorCategory",
      "errorCode",
      "username",
      "loketCode",
      "attempts",
      "createdAt",
      "updatedAt",
      "totalNominal",
    ];

    const rows = data.transactions.map((txn) => [
      txn.id,
      txn.idempotencyKey,
      txn.transactionCode || "",
      txn.provider,
      txn.status,
      txn.errorCategory || "",
      txn.errorCode || "",
      txn.username,
      txn.loketCode,
      txn.attempts ?? "",
      txn.createdAt,
      txn.updatedAt,
      txn.totalNominal,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDuration(seconds: number): string {
    if (seconds < 1) return "<1 dtk";
    if (seconds < 60) return `${seconds} dtk`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
    return `${Math.floor(seconds / 3600)} jam ${Math.floor((seconds % 3600) / 60)} mnt`;
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function timeSince(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff} detik lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
  }

  const totalAll = data
    ? Object.values(data.summary).reduce((sum, s) => sum + s.count, 0)
    : 0;

  const FILTER_TABS: { key: StatusFilter; label: string; icon: string; count: number; alertClass?: string }[] = [
    { key: "ALL", label: "Semua", icon: "list", count: totalAll },
    { key: "PENDING", label: "Pending", icon: "hourglass_top", count: data?.summary.PENDING?.count ?? 0 },
    { key: "STUCK", label: "Gantung", icon: "error", count: data?.stuckCount ?? 0, alertClass: "text-red-600" },
    { key: "SUCCESS", label: "Sukses", icon: "check_circle", count: data?.summary.SUCCESS?.count ?? 0 },
    { key: "PARTIAL_SUCCESS", label: "Sebagian", icon: "warning", count: data?.summary.PARTIAL_SUCCESS?.count ?? 0 },
    { key: "FAILED", label: "Gagal", icon: "cancel", count: data?.summary.FAILED?.count ?? 0 },
  ];

  const ERROR_FILTER_TABS: Array<{ key: ErrorCategoryFilter; label: string }> = [
    { key: "ALL", label: "Semua Error" },
    { key: "PROVIDER", label: "Provider" },
    { key: "NETWORK", label: "Network" },
    { key: "DB", label: "DB" },
    { key: "MANUAL", label: "Manual" },
    { key: "APPLICATION", label: "App" },
  ];

  const PROVIDER_FILTER_TABS: Array<{ key: ProviderFilter; label: string }> = [
    { key: "ALL", label: "Semua Provider" },
    { key: "PDAM", label: "PDAM" },
    { key: "LUNASIN", label: "Lunasin" },
  ];

  const visiblePages = (() => {
    const totalPages = data?.pagination.totalPages ?? 1;
    const currentPage = data?.pagination.page ?? 1;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    const result: number[] = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  })();

  return (
    <>
      <div className="mb-8">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Monitoring Transaksi" },
          ]}
        />
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {activeTab === "transaction" ? "Monitoring Transaksi" : "Monitoring Inquiry"}
            </h1>
            <p className="text-slate-500 mt-1">
              {activeTab === "transaction"
                ? "Pantau status transaksi pembayaran secara real-time."
                : "Pantau riwayat inquiry tagihan provider yang sukses maupun gagal."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300"
              />
              Auto-refresh
            </label>
            {activeTab === "transaction" && (
              <>
                <button
                  onClick={handleExportJson}
                  disabled={!data}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  JSON
                </button>
                <button
                  onClick={handleExportCsv}
                  disabled={!data}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">table_view</span>
                  CSV
                </button>
                <button
                  onClick={fetchData}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  <span className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}>refresh</span>
                  Refresh
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 mb-6 inline-flex gap-2">
        <button
          onClick={() => {
            setActiveTab("transaction");
            setExpandedId(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeTab === "transaction"
              ? "bg-primary text-white"
              : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Monitoring Transaksi
        </button>
        <button
          onClick={() => {
            setActiveTab("inquiry");
            setExpandedId(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeTab === "inquiry"
              ? "bg-primary text-white"
              : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Monitoring Inquiry
        </button>
      </div>

      {activeTab === "transaction" ? (
      <>
      {/* Observability Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Success Rate</p>
          <p className="text-2xl font-black text-green-600 mt-2">{data?.metrics.successRate ?? 0}%</p>
          <p className="text-xs text-slate-500 mt-1">Failure rate {data?.metrics.failureRate ?? 0}%</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Rata-rata Durasi</p>
          <p className="text-2xl font-black mt-2">{formatDuration(Math.round(data?.metrics.avgDurationSeconds ?? 0))}</p>
          <p className="text-xs text-slate-500 mt-1">Transaksi non-pending</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Top Error Code</p>
          <p className="text-lg font-black text-red-600 mt-2 break-all">{data?.metrics.topError?.code || "-"}</p>
          <p className="text-xs text-slate-500 mt-1">{data?.metrics.topError?.count ?? 0} kejadian</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Retry</p>
          <p className="text-2xl font-black text-primary mt-2">{data?.metrics.totalRetries ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">
            Provider {data?.metrics.providerFailures ?? 0} · DB {data?.metrics.dbFailures ?? 0} · Network {data?.metrics.networkFailures ?? 0}
          </p>
        </div>
      </div>

      {(data?.alerts?.length ?? 0) > 0 && (
        <div className="space-y-3 mb-6">
          {data?.alerts.map((alert, index) => (
            <div
              key={`${alert.title}-${index}`}
              className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                alert.level === "ERROR"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              }`}
            >
              <span className={`material-symbols-outlined ${alert.level === "ERROR" ? "text-red-600" : "text-amber-600"}`}>
                {alert.level === "ERROR" ? "error" : "warning"}
              </span>
              <div>
                <p className={`text-sm font-bold ${alert.level === "ERROR" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {alert.title}
                </p>
                <p className={`text-xs mt-1 ${alert.level === "ERROR" ? "text-red-600/80 dark:text-red-300/80" : "text-amber-600/80 dark:text-amber-300/80"}`}>
                  {alert.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg">Tren Transaksi 7 Hari</h3>
              <p className="text-xs text-slate-500">Perbandingan total, sukses, dan gagal per hari</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.dailyTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33415522" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#137fec" strokeWidth={2} name="Total" />
                <Line type="monotone" dataKey="success" stroke="#16a34a" strokeWidth={2} name="Sukses" />
                <Line type="monotone" dataKey="failed" stroke="#dc2626" strokeWidth={2} name="Gagal" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg">Distribusi Kategori Error</h3>
              <p className="text-xs text-slate-500">Kategori error paling dominan pada request gagal</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.errorCategorySummary || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33415522" />
                <XAxis dataKey="category" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Jumlah" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Stuck Alert Card */}
        {(data?.stuckCount ?? 0) > 0 && (
          <div className="col-span-full bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800 rounded-xl p-4 flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-xl">
              <span className="material-symbols-outlined text-3xl text-red-600 animate-pulse">notification_important</span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-red-700 dark:text-red-400 text-lg">{data?.stuckCount} Transaksi Gantung</p>
              <p className="text-sm text-red-600/80 dark:text-red-400/80">Transaksi PENDING lebih dari 5 menit. Kemungkinan proses terhenti.</p>
            </div>
            <button
              onClick={() => setStatusFilter("STUCK")}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-colors"
            >
              Lihat Detail
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="material-symbols-outlined text-blue-600 text-xl">receipt_long</span>
            </div>
            <div>
              <p className="text-2xl font-black">{totalAll}</p>
              <p className="text-xs text-slate-400 font-medium">Total Request</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <span className="material-symbols-outlined text-green-600 text-xl">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-black text-green-600">{data?.summary.SUCCESS?.count ?? 0}</p>
              <p className="text-xs text-slate-400 font-medium">Sukses</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <span className="material-symbols-outlined text-amber-600 text-xl">warning</span>
            </div>
            <div>
              <p className="text-2xl font-black text-amber-600">{(data?.summary.PARTIAL_SUCCESS?.count ?? 0) + (data?.summary.PENDING?.count ?? 0)}</p>
              <p className="text-xs text-slate-400 font-medium">Perlu Perhatian</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <span className="material-symbols-outlined text-red-600 text-xl">cancel</span>
            </div>
            <div>
              <p className="text-2xl font-black text-red-600">{data?.summary.FAILED?.count ?? 0}</p>
              <p className="text-xs text-slate-400 font-medium">Gagal</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Filter — Separate Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === tab.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span className={`material-symbols-outlined text-base ${tab.alertClass && statusFilter !== tab.key ? tab.alertClass : ""}`}>
                {tab.icon}
              </span>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === tab.key
                  ? "bg-white/20"
                  : "bg-slate-100 dark:bg-slate-800"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
        <div className="flex gap-1 flex-wrap">
          {ERROR_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setErrorCategoryFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                errorCategoryFilter === tab.key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
        <div className="flex gap-1 flex-wrap">
          {PROVIDER_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setProviderFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                providerFilter === tab.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search, Loket & Date Filter — Below Status */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari idempotency key atau loket..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div className="relative min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">person</span>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="Filter user / kasir"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">calendar_today</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2 text-sm focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <span className="text-slate-400 text-sm">—</span>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">calendar_today</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2 text-sm focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg">Daftar Transaksi</h3>
          <span className="text-xs text-slate-400">
            {data?.transactions.length ?? 0} transaksi ditampilkan · total {data?.pagination.totalItems ?? 0}
          </span>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat data monitoring...
          </div>
        ) : data?.transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl block mb-2">inbox</span>
            Tidak ada transaksi ditemukan
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.transactions.map((txn) => {
              const cfg = STATUS_CONFIG[txn.status] || STATUS_CONFIG.PENDING;
              const isExpanded = expandedId === txn.id;
              const errorCategory = ERROR_CATEGORY_CONFIG[txn.errorCategory || "-"] || ERROR_CATEGORY_CONFIG["-"];

              return (
                <div key={txn.id}>
                  {/* Row */}
                  <div
                    className={`px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      txn.isStuck ? "bg-red-50/50 dark:bg-red-900/10" : ""
                    }`}
                    onClick={() => handleExpand(txn)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Status indicator */}
                      <div className={`p-2 rounded-lg ${cfg.bg} shrink-0`}>
                        <span className={`material-symbols-outlined text-xl ${cfg.text} ${
                          txn.isStuck ? "animate-pulse" : ""
                        }`}>
                          {txn.isStuck ? "error" : cfg.icon}
                        </span>
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text}`}>
                            {txn.isStuck ? "GANTUNG" : cfg.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${txn.provider === "LUNASIN" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                            {txn.provider}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${errorCategory.className}`}>
                            {errorCategory.label}
                          </span>
                          <span className="text-xs text-slate-400 font-mono truncate">{txn.idempotencyKey}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">person</span>
                            {txn.username}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">store</span>
                            {txn.loketCode}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {timeSince(txn.createdAt)}
                          </span>
                          {txn.durationSeconds > 0 && txn.status !== "PENDING" && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">timer</span>
                              {formatDuration(txn.durationSeconds)}
                            </span>
                          )}
                          {txn.attempts && txn.attempts > 1 && (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <span className="material-symbols-outlined text-sm">sync_problem</span>
                              {txn.attempts}x attempt
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bills summary */}
                      <div className="text-right shrink-0">
                        <p className="font-bold">{formatRupiah(txn.totalNominal)}</p>
                        <div className="flex items-center gap-1.5 justify-end mt-0.5">
                          {txn.billCount > 0 && (
                            <span className="text-xs text-slate-400">{txn.billCount} tagihan</span>
                          )}
                          {txn.successBills > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-bold">{txn.successBills} OK</span>
                          )}
                          {txn.failedBills > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-bold">{txn.failedBills} Gagal</span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/monitoring/${encodeURIComponent(txn.idempotencyKey)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                      >
                        Detail
                      </Link>

                      {/* Expand arrow */}
                      <span className={`material-symbols-outlined text-slate-400 text-xl transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">ID</span>
                            <span className="font-mono font-semibold">#{txn.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Dibuat</span>
                            <span className="font-semibold">{formatTime(txn.createdAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Diperbarui</span>
                            <span className="font-semibold">{formatTime(txn.updatedAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Provider</span>
                            <span className="font-semibold">{txn.provider}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Transaction Code</span>
                            <span className="font-mono text-right text-xs break-all">{txn.transactionCode || "-"}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Durasi Proses</span>
                            <span className="font-semibold">{txn.status === "PENDING" ? "-" : formatDuration(txn.durationSeconds)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total Tagihan</span>
                            <span className="font-bold text-primary">{formatRupiah(txn.totalNominal)}</span>
                          </div>
                          {txn.errorCode && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Error Code</span>
                              <span className="font-mono text-red-600 font-semibold">{txn.errorCode}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Kategori Error</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${errorCategory.className}`}>
                              {errorCategory.label}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Last Event</span>
                            <span className="text-right text-xs font-semibold">{txn.lastEventType ? txn.lastEventType.replace(/_/g, " ") : "-"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Attempts</span>
                            <span className="font-semibold">{txn.attempts ?? "-"}</span>
                          </div>
                          {txn.errorMessage && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Error</span>
                              <span className="text-red-600 text-right max-w-xs">{txn.errorMessage}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Event Timeline */}
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">timeline</span>
                          Timeline Event
                        </h4>
                        {logsLoading === txn.id ? (
                          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                            Memuat timeline...
                          </div>
                        ) : (logs[txn.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400">Timeline belum tersedia untuk transaksi ini.</p>
                        ) : (
                          <div className="space-y-3">
                            {(logs[txn.id] ?? []).map((entry) => {
                              const eventType = entry.eventType || entry.jenis || "LOG";
                              const severity = entry.severity || (eventType.includes("FAILED") ? "ERROR" : eventType.includes("SUCCESS") ? "INFO" : "WARN");
                              const dotClass =
                                severity === "ERROR"
                                  ? "bg-red-500"
                                  : severity === "WARN"
                                    ? "bg-amber-500"
                                    : "bg-green-500";

                              return (
                                <div key={`timeline-${entry.id}`} className="flex gap-3">
                                  <div className="flex flex-col items-center pt-1">
                                    <div className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                                    <div className="flex-1 w-px bg-slate-200 dark:bg-slate-700 mt-1" />
                                  </div>
                                  <div className="flex-1 pb-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-semibold">{eventType.replace(/_/g, " ")}</p>
                                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatTime(entry.createdAt)}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                      {entry.message || txn.lastEventMessage || "Event tercatat tanpa pesan tambahan"}
                                    </p>
                                    {(entry.providerErrorCode || entry.transactionCode || entry.custId) && (
                                      <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                                        {entry.providerErrorCode && (
                                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-mono">
                                            {entry.providerErrorCode}
                                          </span>
                                        )}
                                        {entry.transactionCode && (
                                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono">
                                            {entry.transactionCode}
                                          </span>
                                        )}
                                        {entry.custId && (
                                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-mono">
                                            {entry.custId}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Response Logs (Inquiry & Payment) */}
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">description</span>
                          Event & Response Logs
                        </h4>
                        {logsLoading === txn.id ? (
                          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                            Memuat log...
                          </div>
                        ) : (logs[txn.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400">Tidak ada log ditemukan untuk transaksi ini.</p>
                        ) : (
                          <div className="space-y-3">
                            {(logs[txn.id] ?? []).map((entry) => {
                              const eventType = entry.eventType || entry.jenis || "LOG";
                              const severity = entry.severity || (eventType.includes("FAILED") ? "ERROR" : eventType.includes("SUCCESS") ? "INFO" : "WARN");
                              const payload = entry.payload ?? entry.log ?? null;
                              const isInquiry = eventType.includes("INQUIRY");
                              const isSuccess = severity === "INFO" && eventType.includes("SUCCESS");
                              const isFailed = severity === "ERROR";
                              const isWarn = severity === "WARN";

                              const labelColor = isInquiry ? "text-blue-600" : isSuccess ? "text-green-600" : isFailed ? "text-red-600" : isWarn ? "text-amber-600" : "text-slate-600";
                              const labelIcon = isInquiry ? "search" : isSuccess ? "check_circle" : isFailed ? "cancel" : isWarn ? "warning" : "info";

                              return (
                                <div
                                  key={entry.id}
                                  className={`rounded-lg border p-3 ${
                                    isInquiry
                                      ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
                                      : isSuccess
                                        ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                                        : isFailed
                                          ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`material-symbols-outlined text-sm ${labelColor}`}>
                                        {labelIcon}
                                      </span>
                                      <span className={`text-xs font-bold uppercase ${labelColor}`}>
                                        {eventType.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => void handleCopyLog(entry)}
                                        className="text-[10px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                                      >
                                        {copiedLogId === entry.id ? "Copied" : "Copy JSON"}
                                      </button>
                                      <span className="text-[10px] text-slate-400">{formatTime(entry.createdAt)}</span>
                                    </div>
                                  </div>

                                  {(entry.message || entry.providerErrorCode || entry.httpStatus) && (
                                    <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
                                      {entry.message && (
                                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                          {entry.message}
                                        </span>
                                      )}
                                      {entry.providerErrorCode && (
                                        <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-mono">
                                          {entry.providerErrorCode}
                                        </span>
                                      )}
                                      {entry.httpStatus && (
                                        <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">
                                          HTTP {entry.httpStatus}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {payload && (
                                    <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 dark:bg-slate-950 rounded p-3 overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
                                      {JSON.stringify(payload, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Actions for stuck transactions */}
                      {txn.isStuck && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <span className="material-symbols-outlined text-red-500">warning</span>
                            <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                              Transaksi ini sudah PENDING selama {timeSince(txn.createdAt)}. Kemungkinan proses server terhenti.
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResolveStuck(txn.id); }}
                              disabled={resolving === txn.id}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {resolving === txn.id ? "Memproses..." : "Resolve sebagai Gagal"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!!data && data.pagination.totalItems > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>
                Halaman <strong>{data.pagination.page}</strong> dari <strong>{data.pagination.totalPages}</strong>
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
              >
                <option value={10}>10 / halaman</option>
                <option value={20}>20 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
              </select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!data.pagination.hasPrev}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Sebelumnya
              </button>

              {visiblePages[0] && visiblePages[0] > 1 && (
                <>
                  <button
                    onClick={() => setPage(1)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    1
                  </button>
                  {visiblePages[0] > 2 && <span className="px-1 text-slate-400">…</span>}
                </>
              )}

              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    pageNumber === data.pagination.page
                      ? "bg-primary text-white border-primary"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}

              {visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < data.pagination.totalPages && (
                <>
                  {visiblePages[visiblePages.length - 1] < data.pagination.totalPages - 1 && (
                    <span className="px-1 text-slate-400">…</span>
                  )}
                  <button
                    onClick={() => setPage(data.pagination.totalPages)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {data.pagination.totalPages}
                  </button>
                </>
              )}

              <button
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!data.pagination.hasNext}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      ) : (
        <InquiryMonitoringTab autoRefresh={autoRefresh} />
      )}

      <footer className="mt-12 py-10 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-slate-400 text-sm">
          © 2023 Pedami Payment. Layanan Pembayaran Terpadu Indonesia.
        </p>
      </footer>
    </>
  );
}
