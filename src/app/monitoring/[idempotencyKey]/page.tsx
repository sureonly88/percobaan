"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/ui";
import { formatRupiah } from "@/data/mock";

type DetailData = {
  transaction: {
    id: number;
    idempotencyKey: string;
    status: "PENDING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
    provider: string;
    loketCode: string;
    username: string;
    errorCode: string | null;
    errorMessage: string | null;
    errorCategory: string;
    createdAt: string;
    updatedAt: string;
    durationSeconds: number;
    attempts: number | null;
    lastEventType: string | null;
    lastEventMessage: string | null;
    transactionCodes: string[];
    billCount: number;
    successBills: number;
    failedBills: number;
    totalNominal: number;
  };
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  reconciliation: {
    localStatus: string;
    providerStatus: string;
    finalizationStatus: string;
    manuallyResolved: boolean;
  };
  events: Array<{
    id: number;
    eventType: string;
    severity: "INFO" | "WARN" | "ERROR";
    provider?: string;
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    message?: string | null;
    payload?: unknown;
    createdAt: string;
    transactionCode?: string | null;
    custId?: string | null;
  }>;
  inquiryEvents: Array<{
    id: number;
    eventType: string;
    severity: "INFO" | "WARN" | "ERROR";
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    message?: string | null;
    payload?: unknown;
    createdAt: string;
    custId?: string | null;
  }>;
  rawInquiryResponses: Array<{
    eventType: string;
    createdAt: string;
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    custId?: string | null;
    rawResponse: unknown;
  }>;
  rawPaymentResponses: Array<{
    eventType: string;
    createdAt: string;
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    rawResponse: unknown;
  }>;
  bills: Array<{
    id: number;
    provider?: string;
    transactionCode: string;
    transactionDate: string;
    custId: string;
    nama: string;
    alamat: string;
    blth: string;
    periode?: string;
    kodeProduk?: string;
    total: number;
    subTotal: number;
    admin: number;
    flagTransaksi: string;
    processingStatus: string;
    providerErrorCode?: string | null;
    providerErrorMessage?: string | null;
    paidAt?: string | null;
    failedAt?: string | null;
    adviceAttempts?: number;
    refnumLunasin?: string | null;
  }>;
};

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  PARTIAL_SUCCESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const ERROR_STYLE: Record<string, string> = {
  PROVIDER: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  NETWORK: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  DB: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  MANUAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  INQUIRY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  APPLICATION: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "-": "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "<1 dtk";
  if (seconds < 60) return `${seconds} dtk`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
  return `${Math.floor(seconds / 3600)} jam ${Math.floor((seconds % 3600) / 60)} mnt`;
}

type Props = {
  params: {
    idempotencyKey: string;
  };
};

export default function MonitoringDetailPage({ params }: Props) {
  const idempotencyKey = decodeURIComponent(params.idempotencyKey);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/monitoring/${encodeURIComponent(idempotencyKey)}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Gagal mengambil detail transaksi");
        }
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal mengambil detail transaksi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [idempotencyKey]);

  async function copyJson(label: string, payload: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1500);
    } catch {
      alert("Gagal menyalin JSON");
    }
  }

  const groupedBills = useMemo(() => {
    const map = new Map<string, DetailData["bills"]>();
    for (const bill of data?.bills || []) {
      const current = map.get(bill.transactionCode) || [];
      current.push(bill);
      map.set(bill.transactionCode, current);
    }
    return Array.from(map.entries());
  }, [data?.bills]);

  const providerLabel = data?.transaction.provider || "Provider";
  const isLunasin = providerLabel === "LUNASIN";

  return (
    <>
      <div className="mb-8">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Monitoring", href: "/monitoring" },
            { label: "Detail Transaksi" },
          ]}
        />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Detail Transaksi Monitoring</h1>
            <p className="text-slate-500 mt-1 font-mono break-all">{idempotencyKey}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/monitoring"
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Kembali ke Monitoring
            </Link>
            {data && (
              <button
                onClick={() => void copyJson("detail", data)}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
              >
                {copied === "detail" ? "Copied" : "Copy Detail JSON"}
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
          Memuat detail transaksi...
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : !data ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
          Data transaksi tidak ditemukan.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-1 rounded text-xs font-bold ${STATUS_STYLE[data.transaction.status] || STATUS_STYLE.PENDING}`}>
                  {data.transaction.status}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${ERROR_STYLE[data.transaction.errorCategory] || ERROR_STYLE["-"]}`}>
                  {data.transaction.errorCategory}
                </span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Total Nominal</p>
              <p className="text-2xl font-black text-primary mt-2">{formatRupiah(data.transaction.totalNominal)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Tagihan</p>
              <p className="text-2xl font-black mt-2">{data.transaction.billCount}</p>
              <p className="text-xs text-slate-500 mt-1">
                {data.transaction.successBills} sukses · {data.transaction.failedBills} gagal
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Attempts</p>
              <p className="text-2xl font-black mt-2">{data.transaction.attempts ?? 1}</p>
              <p className="text-xs text-slate-500 mt-1">Durasi {formatDuration(data.transaction.durationSeconds)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-bold text-lg mb-4">Overview</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-slate-400">Provider</span><span className="font-semibold">{data.transaction.provider}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Loket</span><span className="font-semibold">{data.transaction.loketCode}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">User</span><span className="font-semibold">{data.transaction.username}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Dibuat</span><span className="font-semibold text-right">{formatDateTime(data.transaction.createdAt)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Diperbarui</span><span className="font-semibold text-right">{formatDateTime(data.transaction.updatedAt)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Last Event</span><span className="font-semibold text-right">{data.transaction.lastEventType?.replace(/_/g, " ") || "-"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Error Code</span><span className="font-mono text-right text-red-600">{data.transaction.errorCode || "-"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Error Message</span><span className="text-right max-w-sm">{data.transaction.errorMessage || data.transaction.lastEventMessage || "-"}</span></div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-bold text-lg mb-4">Rekonsiliasi</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-slate-400">Local Status</span><span className="font-semibold">{data.reconciliation.localStatus}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Provider Status</span><span className="font-semibold">{data.reconciliation.providerStatus}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Finalization</span><span className="font-semibold">{data.reconciliation.finalizationStatus}</span></div>
                <div className="flex justify-between gap-4"><span className="text-slate-400">Manual Resolve</span><span className="font-semibold">{data.reconciliation.manuallyResolved ? "Ya" : "Tidak"}</span></div>
                <div>
                  <p className="text-slate-400 mb-2">Transaction Codes</p>
                  <div className="flex flex-wrap gap-2">
                    {data.transaction.transactionCodes.length > 0 ? data.transaction.transactionCodes.map((code) => (
                      <span key={code} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono break-all">
                        {code}
                      </span>
                    )) : <span className="text-sm text-slate-500">-</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4 gap-4">
              <div>
                <h3 className="font-bold text-lg">Timeline Event</h3>
                <p className="text-xs text-slate-500">Urutan event transaksi berdasarkan transaction_events</p>
              </div>
              <button
                onClick={() => void copyJson("events", data.events)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copied === "events" ? "Copied" : "Copy Events"}
              </button>
            </div>
            <div className="space-y-4">
              {data.events.map((event) => {
                const color = event.severity === "ERROR" ? "bg-red-500" : event.severity === "WARN" ? "bg-amber-500" : "bg-green-500";
                return (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-sm">{event.eventType.replace(/_/g, " ")}</p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTime(event.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{event.message || "Tanpa pesan tambahan"}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                        {event.transactionCode && <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono">{event.transactionCode}</span>}
                        {event.custId && <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">{event.custId}</span>}
                        {event.providerErrorCode && <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-mono">{event.providerErrorCode}</span>}
                        {event.httpStatus != null && <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">HTTP {event.httpStatus}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-lg">Raw Response Inquiry {providerLabel}</h3>
                  <p className="text-xs text-slate-500">Hasil inquiry terkait pelanggan pada request ini</p>
                </div>
                <button
                  onClick={() => void copyJson("inquiry-raw", data.rawInquiryResponses)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied === "inquiry-raw" ? "Copied" : "Copy Inquiry Raw"}
                </button>
              </div>
              <div className="space-y-4 max-h-[34rem] overflow-y-auto">
                {data.rawInquiryResponses.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada raw inquiry response yang terhubung ke transaksi ini.</p>
                ) : data.rawInquiryResponses.map((entry, index) => (
                  <div key={`${entry.eventType}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-xs font-bold uppercase text-blue-600">{entry.eventType.replace(/_/g, " ")}</p>
                      <span className="text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2 text-[10px]">
                      {entry.custId && <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">{entry.custId}</span>}
                      {entry.providerErrorCode && <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-mono">{entry.providerErrorCode}</span>}
                      {entry.httpStatus != null && <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">HTTP {entry.httpStatus}</span>}
                    </div>
                    <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(entry.rawResponse, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-lg">Raw Response Payment {providerLabel}</h3>
                  <p className="text-xs text-slate-500">Response provider pada saat payment/advice dieksekusi</p>
                </div>
                <button
                  onClick={() => void copyJson("payment-raw", data.rawPaymentResponses)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied === "payment-raw" ? "Copied" : "Copy Payment Raw"}
                </button>
              </div>
              <div className="space-y-4 max-h-[34rem] overflow-y-auto">
                {data.rawPaymentResponses.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada raw payment response yang terhubung ke transaksi ini.</p>
                ) : data.rawPaymentResponses.map((entry, index) => (
                  <div key={`${entry.eventType}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-xs font-bold uppercase text-green-600">{entry.eventType.replace(/_/g, " ")}</p>
                      <span className="text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2 text-[10px]">
                      {entry.providerErrorCode && <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-mono">{entry.providerErrorCode}</span>}
                      {entry.httpStatus != null && <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">HTTP {entry.httpStatus}</span>}
                    </div>
                    <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(entry.rawResponse, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4 gap-4">
              <div>
                <h3 className="font-bold text-lg">Bill / Rekening Terkait</h3>
                  <p className="text-xs text-slate-500">Data lokal transaksi {providerLabel} yang terkait dengan transaction code transaksi ini</p>
              </div>
              <button
                onClick={() => void copyJson("bills", data.bills)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copied === "bills" ? "Copied" : "Copy Bills JSON"}
              </button>
            </div>

            <div className="space-y-5">
              {groupedBills.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada data rekening lokal yang terkait.</p>
              ) : groupedBills.map(([transactionCode, bills]) => (
                <div key={transactionCode} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-bold font-mono break-all">{transactionCode}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bills.map((bill) => (
                      <div key={bill.id} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-5 gap-3 text-sm">
                        <div className="lg:col-span-2">
                          <p className="font-semibold">{bill.nama}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {bill.custId} · {isLunasin ? (bill.periode || bill.blth || "-") : (bill.blth || "-")}
                          </p>
                          {isLunasin ? (
                            <p className="text-xs text-slate-500 mt-1">{bill.kodeProduk || "Produk Lunasin"}</p>
                          ) : (
                            <p className="text-xs text-slate-500 mt-1">{bill.alamat}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Status</p>
                          <p className="font-semibold">{bill.processingStatus || bill.flagTransaksi}</p>
                          {bill.providerErrorCode && <p className="text-xs text-red-600 mt-1 font-mono">{bill.providerErrorCode}</p>}
                          {isLunasin && bill.adviceAttempts !== undefined && (
                            <p className="text-xs text-slate-500 mt-1">Advice {bill.adviceAttempts}x</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Nominal</p>
                          <p className="font-bold text-primary">{formatRupiah(bill.total)}</p>
                          <p className="text-xs text-slate-500">Sub {formatRupiah(bill.subTotal)} · Admin {formatRupiah(bill.admin)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Waktu</p>
                          <p className="text-xs">{formatDateTime(bill.paidAt || bill.failedAt || bill.transactionDate)}</p>
                          {isLunasin && bill.refnumLunasin && (
                            <p className="text-xs text-slate-500 mt-1 font-mono">Ref: {bill.refnumLunasin}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-lg">Request Payload</h3>
                  <p className="text-xs text-slate-500">Payload yang dikirim dari aplikasi ke endpoint payment lokal</p>
                </div>
                <button
                  onClick={() => void copyJson("request", data.requestPayload)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied === "request" ? "Copied" : "Copy Request"}
                </button>
              </div>
              <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-[28rem] overflow-y-auto">
                {JSON.stringify(data.requestPayload, null, 2)}
              </pre>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <h3 className="font-bold text-lg">Response Payload Final</h3>
                  <p className="text-xs text-slate-500">Payload hasil akhir yang tersimpan di payment_requests</p>
                </div>
                <button
                  onClick={() => void copyJson("response", data.responsePayload)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied === "response" ? "Copied" : "Copy Response"}
                </button>
              </div>
              <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-[28rem] overflow-y-auto">
                {JSON.stringify(data.responsePayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}