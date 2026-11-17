"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type ServerStatus = "CHECKING" | "SUCCESS" | "PENDING" | "FAILED" | "EXPIRED" | "UNKNOWN";

/**
 * Halaman tujuan setelah pembayaran Snap. Parameter URL dari Midtrans (transaction_status)
 * BUKAN bukti pembayaran (dokumentasi Midtrans) — status diambil dari server, yang
 * menanyakan langsung ke Midtrans (?sync=1) dan mengkredit saldo bila sudah lunas.
 */
function FinishContent() {
  const params = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const [status, setStatus] = useState<ServerStatus>(orderId ? "CHECKING" : "UNKNOWN");
  const [nominal, setNominal] = useState<number | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    let tries = 0;
    const check = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/topup?code=${encodeURIComponent(orderId)}&sync=1`, { cache: "no-store" });
        if (!res.ok) {
          if (alive) setStatus("UNKNOWN"); // belum login / bukan milik loket ini
          return;
        }
        const j = await res.json();
        if (!alive) return;
        setNominal(Number(j.nominal || 0) || null);
        const s = String(j.status || "PENDING") as ServerStatus;
        setStatus(["SUCCESS", "PENDING", "FAILED", "EXPIRED"].includes(s) ? s : "PENDING");
        // Masih menunggu: cek lagi beberapa kali (maks. ±2 menit)
        if (s === "PENDING" && tries < 8) setTimeout(check, 15_000);
      } catch {
        if (alive) setStatus("UNKNOWN");
      }
    };
    check();
    return () => {
      alive = false;
    };
  }, [orderId]);

  const view = {
    CHECKING: { tone: "from-slate-400 to-slate-500", icon: "progress_activity", title: "Memeriksa Pembayaran", sub: "Menanyakan status ke payment gateway…" },
    SUCCESS: { tone: "from-emerald-500 to-emerald-600", icon: "check_circle", title: "Pembayaran Berhasil!", sub: `Saldo${nominal ? ` Rp ${nominal.toLocaleString("id-ID")}` : ""} telah dikreditkan ke loket kamu` },
    PENDING: { tone: "from-amber-400 to-amber-500", icon: "hourglass_top", title: "Menunggu Konfirmasi", sub: "Pembayaran belum dikonfirmasi oleh bank/payment gateway" },
    FAILED: { tone: "from-red-500 to-red-600", icon: "cancel", title: "Pembayaran Gagal", sub: "Pembayaran ditolak atau dibatalkan. Saldo tidak bertambah." },
    EXPIRED: { tone: "from-slate-500 to-slate-600", icon: "timer_off", title: "Pembayaran Kedaluwarsa", sub: "Batas waktu pembayaran sudah lewat. Saldo tidak bertambah." },
    UNKNOWN: { tone: "from-amber-400 to-amber-500", icon: "hourglass_top", title: "Status Belum Diketahui", sub: "Buka menu Top-up untuk melihat status terbaru" },
  }[status];

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center">
          <div className={`bg-gradient-to-br ${view.tone} p-10`}>
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <span className={`material-symbols-outlined text-5xl text-white ${status === "CHECKING" ? "animate-spin" : ""}`}>{view.icon}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">{view.title}</h1>
            <p className="text-white/90 mt-1 text-sm">{view.sub}</p>
          </div>
          <div className="p-6 space-y-4">
            {status === "PENDING" && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Saldo otomatis ditambahkan setelah pembayaran dikonfirmasi — biasanya beberapa menit. Halaman ini memeriksa ulang secara berkala.
              </p>
            )}
            {orderId && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-sm text-left">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Order ID</p>
                <p className="font-mono text-xs text-slate-500 break-all">{orderId}</p>
              </div>
            )}
            <p className="text-xs text-slate-400">Tutup halaman ini untuk kembali ke aplikasi.</p>
            <Link
              href="/topup"
              className="block w-full text-center px-4 py-3 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors"
            >
              {status === "SUCCESS" ? "Kembali ke Top-up" : "Lihat Riwayat Top-up"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopupFinishPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <FinishContent />
    </Suspense>
  );
}
