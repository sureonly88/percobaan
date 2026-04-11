"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function TopupUnfinishPage() {
  const params = useSearchParams();
  const orderId = params.get("order_id") ?? "";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
          <div className="bg-gradient-to-br from-slate-400 to-slate-500 p-10">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-5xl text-white">pause_circle</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">Pembayaran Belum Selesai</h1>
            <p className="text-slate-200 mt-1 text-sm">
              Kamu menutup halaman sebelum menyelesaikan pembayaran
            </p>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Top-up belum berhasil. Transaksi ini akan otomatis kedaluwarsa dalam 24 jam.
              Kamu bisa membuat transaksi baru kapan saja.
            </p>
            {orderId && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-left space-y-1">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Order ID</p>
                <p className="text-xs font-mono text-slate-500 break-all">{orderId}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/topup"
                className="block text-center px-4 py-3 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors"
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
