"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type InquiryStatusFilter = "ALL" | "SUCCESS" | "FAILED";
type InquiryErrorCategoryFilter = "ALL" | "DB" | "NETWORK" | "PROVIDER" | "APPLICATION";
type InquiryProviderFilter = "ALL" | "PDAM" | "LUNASIN";

interface InquiryItem {
  id: number;
  status: "SUCCESS" | "FAILED";
  eventType: string;
  severity: "INFO" | "WARN" | "ERROR" | string;
  provider: string;
  httpStatus: number | null;
  providerErrorCode: string | null;
  errorCategory: string;
  message: string | null;
  createdAt: string;
  custId: string;
  username: string;
  loketCode: string;
  billCount: number;
  periods: string[];
  rawResponse: unknown;
  payload: Record<string, unknown> | null;
}

interface InquiryMonitoringData {
  summary: {
    total: number;
    success: number;
    failed: number;
  };
  metrics: {
    successRate: number;
    failureRate: number;
    topError: { code: string; count: number } | null;
    providerFailures: number;
    dbFailures: number;
    networkFailures: number;
    applicationFailures: number;
  };
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
  inquiries: InquiryItem[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: string }> = {
  SUCCESS: {
    label: "Sukses",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    icon: "check_circle",
  },
  FAILED: {
    label: "Gagal",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: "cancel",
  },
};

const ERROR_CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  DB: { label: "DB", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  NETWORK: { label: "Network", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  PROVIDER: { label: "Provider", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  APPLICATION: { label: "App", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  "-": { label: "-", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const STATUS_FILTER_TABS: Array<{ key: InquiryStatusFilter; label: string }> = [
  { key: "ALL", label: "Semua" },
  { key: "SUCCESS", label: "Sukses" },
  { key: "FAILED", label: "Gagal" },
];

const ERROR_FILTER_TABS: Array<{ key: InquiryErrorCategoryFilter; label: string }> = [
  { key: "ALL", label: "Semua Error" },
  { key: "PROVIDER", label: "Provider" },
  { key: "NETWORK", label: "Network" },
  { key: "DB", label: "DB" },
  { key: "APPLICATION", label: "App" },
];

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

export default function InquiryMonitoringTab({ autoRefresh }: { autoRefresh: boolean }) {
  const [data, setData] = useState<InquiryMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<InquiryStatusFilter>("ALL");
  const [errorCategoryFilter, setErrorCategoryFilter] = useState<InquiryErrorCategoryFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState<InquiryProviderFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

      const res = await fetch(`/api/monitoring/inquiry?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal mengambil monitoring inquiry");
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, errorCategoryFilter, page, pageSize, startDate, endDate, search, userFilter, providerFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, errorCategoryFilter, startDate, endDate, search, userFilter, providerFilter, pageSize]);

  const PROVIDER_FILTER_TABS: Array<{ key: InquiryProviderFilter; label: string }> = [
    { key: "ALL", label: "Semua Provider" },
    { key: "PDAM", label: "PDAM" },
    { key: "LUNASIN", label: "Lunasin" },
  ];

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const visiblePages = useMemo(() => {
    const totalPages = data?.pagination.totalPages ?? 1;
    const currentPage = data?.pagination.page ?? 1;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    const result: number[] = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }, [data?.pagination.page, data?.pagination.totalPages]);

  async function handleCopyJson(item: InquiryItem) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(item.rawResponse ?? item.payload ?? item, null, 2));
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1500);
    } catch {
      alert("Gagal menyalin JSON inquiry");
    }
  }

  function handleExportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-inquiry-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    if (!data) return;
    const header = [
      "id",
      "status",
      "errorCategory",
      "providerErrorCode",
      "custId",
      "username",
      "loketCode",
      "billCount",
      "createdAt",
      "message",
    ];

    const rows = data.inquiries.map((item) => [
      item.id,
      item.status,
      item.errorCategory,
      item.providerErrorCode || "",
      item.custId,
      item.username,
      item.loketCode,
      item.billCount,
      item.createdAt,
      item.message || "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-inquiry-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h3 className="font-bold text-lg">Monitoring Inquiry Provider</h3>
          <p className="text-sm text-slate-500">Daftar inquiry sukses/gagal dari PDAM dan Lunasin.</p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Inquiry</p>
          <p className="text-2xl font-black mt-2">{data?.summary.total ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Sukses {data?.summary.success ?? 0} · Gagal {data?.summary.failed ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Success Rate</p>
          <p className="text-2xl font-black text-green-600 mt-2">{data?.metrics.successRate ?? 0}%</p>
          <p className="text-xs text-slate-500 mt-1">Failure rate {data?.metrics.failureRate ?? 0}%</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Top Error Code</p>
          <p className="text-lg font-black text-red-600 mt-2 break-all">{data?.metrics.topError?.code || "-"}</p>
          <p className="text-xs text-slate-500 mt-1">{data?.metrics.topError?.count ?? 0} kejadian</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Breakdown Error</p>
          <p className="text-sm font-semibold mt-2">Provider {data?.metrics.providerFailures ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Network {data?.metrics.networkFailures ?? 0} · DB {data?.metrics.dbFailures ?? 0} · App {data?.metrics.applicationFailures ?? 0}</p>
        </div>
      </div>

      {(data?.errorCategorySummary.length ?? 0) > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {data?.errorCategorySummary.map((item) => {
              const config = ERROR_CATEGORY_CONFIG[item.category] || ERROR_CATEGORY_CONFIG["-"];
              return (
                <span
                  key={`${item.category}-${item.count}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase ${config.className}`}
                >
                  {config.label}
                  <span className="opacity-80">{item.count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === tab.key
                  ? "bg-primary text-white shadow-sm"
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

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID pelanggan, user, loket, error..."
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

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg">Daftar Inquiry</h3>
          <span className="text-xs text-slate-400">
            {data?.inquiries.length ?? 0} inquiry ditampilkan · total {data?.pagination.totalItems ?? 0}
          </span>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat data monitoring inquiry...
          </div>
        ) : data?.inquiries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl block mb-2">search_off</span>
            Tidak ada inquiry ditemukan
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.inquiries.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.FAILED;
              const errorCfg = ERROR_CATEGORY_CONFIG[item.errorCategory] || ERROR_CATEGORY_CONFIG["-"];
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id}>
                  <div
                    className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${statusCfg.className}`}>
                        <span className="material-symbols-outlined text-xl">{statusCfg.icon}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.provider === "LUNASIN" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                            {item.provider}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${errorCfg.className}`}>
                            {errorCfg.label}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">#{item.id}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">badge</span>
                            {item.custId}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">person</span>
                            {item.username}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">store</span>
                            {item.loketCode}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {timeSince(item.createdAt)}
                          </span>
                        </div>
                        {item.message && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{item.message}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold">{item.billCount} tagihan</p>
                        <div className="flex items-center justify-end gap-2 mt-1 text-[11px] text-slate-400 flex-wrap max-w-[220px]">
                          {item.periods.slice(0, 3).map((period) => (
                            <span key={`${item.id}-${period}`} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                              {period}
                            </span>
                          ))}
                          {item.periods.length > 3 && <span>+{item.periods.length - 3}</span>}
                        </div>
                      </div>

                      <span className={`material-symbols-outlined text-slate-400 text-xl transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Waktu Inquiry</span>
                            <span className="font-semibold text-right">{formatTime(item.createdAt)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Event Type</span>
                            <span className="font-semibold text-right">{item.eventType.replace(/_/g, " ")}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Provider</span>
                            <span className="font-semibold text-right">{item.provider}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">HTTP Status</span>
                            <span className="font-semibold text-right">{item.httpStatus ?? "-"}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Error Code</span>
                            <span className="font-mono text-right text-red-600 dark:text-red-400">{item.providerErrorCode || "-"}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Kategori Error</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${errorCfg.className}`}>
                              {errorCfg.label}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Severity</span>
                            <span className="font-semibold text-right">{item.severity}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Loket</span>
                            <span className="font-semibold text-right">{item.loketCode}</span>
                          </div>
                        </div>
                      </div>

                      {item.message && (
                        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                          <p className="text-xs text-slate-400 mb-1">Pesan</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{item.message}</p>
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                          {item.periods.map((period) => (
                            <span key={`period-expanded-${item.id}-${period}`} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                              {period}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyJson(item);
                          }}
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 transition-colors"
                        >
                          {copiedId === item.id ? "Copied" : "Copy JSON"}
                        </button>
                      </div>

                      <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold">
                          Raw Response Inquiry
                        </div>
                        <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 dark:bg-slate-950 p-3 overflow-x-auto max-h-96 whitespace-pre-wrap break-all">
                          {JSON.stringify(item.rawResponse ?? item.payload ?? {}, null, 2)}
                        </pre>
                      </div>
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
  );
}