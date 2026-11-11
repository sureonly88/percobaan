"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { MOBILE_PRODUCTS, formatRp } from "@/lib/mobile/products";

interface SaldoInfo {
  saldo: number;
  tertahan: number;
  tertahanCount: number;
}

interface DashboardData {
  hariIni: { totalTrx: number; totalNominal: number; sukses: number; gagal: number };
  transaksiTerakhir: Array<{
    jenis: string;
    idPelanggan: string;
    namaPelanggan: string;
    nominal: number;
    status: string;
    tanggal: string;
  }>;
}

export default function MobileBerandaPage() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; loketCode?: string; loketName?: string } | undefined;
  const [saldo, setSaldo] = useState<SaldoInfo | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideSaldo, setHideSaldo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [saldoRes, dashRes] = await Promise.all([
        fetch("/api/saldo").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const loket = (saldoRes?.lokets ?? []).find((l: { loketCode: string }) => l.loketCode === user?.loketCode);
      if (loket) {
        setSaldo({
          saldo: Number(loket.pulsa || 0),
          tertahan: Number(loket.saldoTertahan || 0),
          tertahanCount: Number(loket.transaksiTertahan || 0),
        });
      }
      if (dashRes?.hariIni) setDash(dashRes);
    } finally {
      setLoading(false);
    }
  }, [user?.loketCode]);

  useEffect(() => {
    if (user?.loketCode !== undefined) load();
  }, [load, user?.loketCode]);

  useEffect(() => {
    try {
      setHideSaldo(localStorage.getItem("m_hide_saldo") === "1");
    } catch {
      /* abaikan */
    }
  }, []);

  function toggleHide() {
    setHideSaldo((v) => {
      try {
        localStorage.setItem("m_hide_saldo", v ? "0" : "1");
      } catch {
        /* abaikan */
      }
      return !v;
    });
  }

  const firstName = (user?.name || "").split(" ")[0] || "Agen";

  return (
    <div>
      <section className="bg-primary text-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16 rounded-b-3xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-white/80 text-sm">Halo, {firstName}</p>
            <p className="font-semibold truncate">{user?.loketName || user?.loketCode || "Loket belum diatur"}</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25"
            aria-label="Muat ulang"
          >
            <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        </div>
      </section>

      <div className="px-4 -mt-12 space-y-4">
        {/* Kartu saldo */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-lg shadow-slate-900/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Saldo loket</p>
            <button type="button" onClick={toggleHide} className="text-slate-400 p-1" aria-label={hideSaldo ? "Tampilkan saldo" : "Sembunyikan saldo"}>
              <span className="material-symbols-outlined text-xl">{hideSaldo ? "visibility_off" : "visibility"}</span>
            </button>
          </div>
          <p className={`text-3xl font-bold mt-1 ${saldo && saldo.saldo < 100000 ? "text-red-600" : ""}`}>
            {saldo === null ? (loading ? "…" : "-") : hideSaldo ? "Rp ••••••" : formatRp(saldo.saldo)}
          </p>
          {saldo && saldo.tertahan > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
              <span className="material-symbols-outlined text-sm">hourglass_empty</span>
              <span>
                {hideSaldo ? "Sebagian saldo" : formatRp(saldo.tertahan)} ditahan untuk {saldo.tertahanCount} transaksi yang
                menunggu konfirmasi provider. Kembali otomatis jika provider memastikan gagal.
              </span>
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/m/bayar" className="h-11 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-1.5 active:opacity-90">
              <span className="material-symbols-outlined text-xl">point_of_sale</span> Bayar
            </Link>
            <Link href="/m/topup" className="h-11 rounded-xl bg-primary/10 text-primary font-semibold flex items-center justify-center gap-1.5 active:bg-primary/20">
              <span className="material-symbols-outlined text-xl">add_card</span> Top-up
            </Link>
          </div>
        </div>

        {/* Produk */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <h2 className="font-semibold mb-3">Bayar tagihan</h2>
          <div className="grid grid-cols-4 gap-y-4 gap-x-2">
            {MOBILE_PRODUCTS.slice(0, 8).map((p) => (
              <Link key={p.slug} href={`/m/bayar/${p.slug}`} className="flex flex-col items-center gap-1.5 text-center active:opacity-70">
                <span className={`h-12 w-12 rounded-2xl flex items-center justify-center ${p.tone}`}>
                  <span className="material-symbols-outlined">{p.icon}</span>
                </span>
                <span className="text-[11px] leading-tight font-medium">{p.shortLabel}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Ringkasan hari ini */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <h2 className="font-semibold mb-3">Hari ini</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Transaksi" value={dash ? String(dash.hariIni.totalTrx) : "-"} />
            <Stat label="Sukses" value={dash ? String(dash.hariIni.sukses) : "-"} tone="text-emerald-600" />
            <Stat label="Gagal" value={dash ? String(dash.hariIni.gagal) : "-"} tone="text-red-600" />
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5 flex items-center justify-between">
            <span className="text-sm text-slate-500">Total nominal sukses</span>
            <span className="font-bold">{dash ? formatRp(dash.hariIni.totalNominal) : "-"}</span>
          </div>
        </section>

        {/* Transaksi terakhir */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 mb-4">
          <h2 className="font-semibold mb-2">Transaksi terakhir</h2>
          {!dash || dash.transaksiTerakhir.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">{loading ? "Memuat…" : "Belum ada transaksi 7 hari terakhir"}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {dash.transaksiTerakhir.slice(0, 5).map((t, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.namaPelanggan !== "-" ? t.namaPelanggan : t.idPelanggan}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {t.jenis} · {t.idPelanggan} · {new Date(t.tanggal).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">{formatRp(t.nominal)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 py-2.5">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
