"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/ui";

interface MultiPaymentDetailItem {
  itemCode: string;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
  transactionCode: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  retryCount: number;
  adviceAttempts: number;
  paidAt: string | null;
  failedAt: string | null;
}

interface MultiPaymentDetail {
  multiPayment: {
    multiPaymentCode: string;
    idempotencyKey: string;
    status: string;
    loketCode: string | null;
    loketName: string | null;
    username: string | null;
    totalItems: number;
    totalAmount: number;
    totalAdmin: number;
    grandTotal: number;
    paidAmount: number;
    changeAmount: number;
    errorCode: string | null;
    errorMessage: string | null;
    paidAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  items: MultiPaymentDetailItem[];
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatTanggal(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  params: {
    code: string;
  };
};

export default function MultiPaymentDetailPage({ params }: Props) {
  const code = decodeURIComponent(params.code);
  const [data, setData] = useState<MultiPaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(code)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal mengambil detail multipay");
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal mengambil detail multipay");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <>
      <div className="mb-8">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Riwayat", href: "/riwayat" },
            { label: "Detail Multi-Payment" },
          ]}
        />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Detail Multi-Payment</h1>
            <p className="text-slate-500 mt-1 font-mono break-all">{code}</p>
          </div>
          <Link
            href="/riwayat"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Kembali ke Riwayat
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
          Memuat detail multipay...
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
              <p className="mt-2 text-lg font-bold">{data.multiPayment.status}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Loket</p>
              <p className="mt-2 text-lg font-bold">{data.multiPayment.loketName || data.multiPayment.loketCode || "-"}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Grand Total</p>
              <p className="mt-2 text-lg font-bold text-primary">{formatRupiah(data.multiPayment.grandTotal)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Dibuat</p>
              <p className="mt-2 text-sm font-semibold">{formatTanggal(data.multiPayment.createdAt)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-lg font-bold mb-4">Item Multi-Payment</h3>
            <div className="space-y-3">
              {data.items.map((item) => (
                <div key={item.itemCode} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">{item.customerName || item.customerId}</p>
                      <p className="text-xs text-slate-500 font-mono">{item.customerId} · {item.provider} · {item.serviceType}</p>
                      <p className="text-xs text-slate-400 mt-1">{item.productCode || item.periodLabel || "-"}</p>
                      {item.transactionCode && <p className="text-xs text-emerald-600 mt-1 font-mono">{item.transactionCode}</p>}
                      {item.providerErrorMessage && <p className="text-xs text-red-600 mt-1">{item.providerErrorMessage}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold">{formatRupiah(item.total)}</p>
                      <p className="text-xs text-slate-400">Tagihan {formatRupiah(item.amount)} + Admin {formatRupiah(item.adminFee)}</p>
                      <p className="text-[11px] text-slate-400 mt-1">Retry {item.retryCount} · Advice {item.adviceAttempts}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}