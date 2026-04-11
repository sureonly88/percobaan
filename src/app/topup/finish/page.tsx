"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

interface TopupStatus {
  requestCode: string;
  orderId: string;
  nominal: number;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
}

export default function TopupFinishPage() {
  const params = useSearchParams();
  const router = useRouter();

  const orderId = params.get("order_id") ?? "";
  const transactionStatus = params.get("transaction_status") ?? "";

  const [topup, setTopup] = useState<TopupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    fetch(`/api/topup?code=${encodeURIComponent(orderId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) setTopup(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  // Auto-redirect to topup after 5s if success
  useEffect(() => {
    if (topup?.status === "SUCCESS") {
      const t = setTimeout(() => router.push("/topup"), 5000);
      return () => clearTimeout(t);
    }
  }, [topup?.status, router]);

  const isSuccess = topup?.status === "SUCCESS" ||
    transactionStatus === "settlement" ||
    transactionStatus === "capture";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {loading ? (
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 animate-spin block mb-4">
              progress_activity
            </span>
            <p className="text-slate-500">Memuat detail pembayaran...</p>
          </div>
        ) : isSuccess ? (
          /* SUCCESS */
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-10">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-5xl text-white">check_circle</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white">Pembayaran Berhasil!</h1>
              {topup && (
                <p className="text-emerald-100 mt-1 text-sm">
                  Top-up {formatRupiah(topup.nominal)} telah dikreditkan ke saldo loket
                </p>
              )}
            </div>
            <div className="p-6 space-y-4">
              {topup && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-sm space-y-2 text-left">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal</span>
                    <span className="font-bold text-emerald-600">{formatRupiah(topup.nominal)}</span>
                  </div>
                  {topup.paymentMethod && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Metode</span>
                      <span className="font-semibold capitalize">{topup.paymentMethod.replace(/_/g, " ")}</span>
                    </div>
                  )}
                  {topup.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Waktu</span>
                      <span className="font-semibold">
                        {new Date(topup.paidAt).toLocaleString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order ID</span>
                    <span className="font-mono text-xs text-slate-400 truncate max-w-[180px]">{topup.requestCode}</span>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400">
                Akan diarahkan ke halaman Top-up dalam 5 detik...
              </p>
              <Link
                href="/topup"
                className="block w-full text-center px-4 py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                Kembali ke Top-up
              </Link>
            </div>
          </div>
        ) : (
          /* PENDING — payment done but waiting confirmation */
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
            <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-10">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-5xl text-white">hourglass_top</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white">Menunggu Konfirmasi</h1>
              <p className="text-amber-100 mt-1 text-sm">
                Pembayaran sedang diverifikasi oleh bank
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Saldo akan otomatis ditambahkan setelah pembayaran dikonfirmasi.
                Proses ini biasanya memakan waktu beberapa menit.
              </p>
              {orderId && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-400 font-mono break-all">
                  {orderId}
                </div>
              )}
              <Link
                href="/topup"
                className="block w-full text-center px-4 py-3 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                Lihat Riwayat Top-up
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
