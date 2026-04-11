"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function TopupErrorPage() {
  const params = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const statusCode = params.get("status_code") ?? "";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
          <div className="bg-gradient-to-br from-red-500 to-red-600 p-10">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-5xl text-white">error</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">Pembayaran Gagal</h1>
            <p className="text-red-100 mt-1 text-sm">
              Terjadi kesalahan saat memproses pembayaran
            </p>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Transaksi gagal diproses. Saldo tidak berkurang.
              Silakan coba kembali atau hubungi administrator jika masalah berlanjut.
            </p>
            {(orderId || statusCode) && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-left space-y-1.5">
                {orderId && (
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">Order ID</p>
                    <p className="text-xs font-mono text-red-600 dark:text-red-400 break-all">{orderId}</p>
                  </div>
                )}
                {statusCode && (
                  <div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">Kode Error</p>
                    <p className="text-xs font-mono text-red-600 dark:text-red-400">{statusCode}</p>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/topup"
                className="block text-center px-4 py-3 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Coba Lagi
              </Link>
              <Link
                href="/"
                className="block text-center px-4 py-3 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
