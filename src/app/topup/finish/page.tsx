"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function TopupFinishPage() {
  const params = useSearchParams();

  const orderId = params.get("order_id") ?? "";
  const transactionStatus = params.get("transaction_status") ?? "";

  const isSuccess =
    transactionStatus === "settlement" ||
    transactionStatus === "capture";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {isSuccess ? (
          /* SUCCESS */
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-10">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-5xl text-white">check_circle</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white">Pembayaran Berhasil!</h1>
              <p className="text-emerald-100 mt-1 text-sm">
                Saldo telah dikreditkan ke loket kamu
              </p>
            </div>
            <div className="p-6 space-y-4">
              {orderId && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-sm text-left">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Order ID</p>
                  <p className="font-mono text-xs text-slate-500 break-all">{orderId}</p>
                </div>
              )}
              <p className="text-xs text-slate-400">
                Tutup halaman ini untuk kembali ke aplikasi.
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
          /* PENDING */
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
              <p className="text-xs text-slate-400">
                Tutup halaman ini untuk kembali ke aplikasi.
              </p>
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
