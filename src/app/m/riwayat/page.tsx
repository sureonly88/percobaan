"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { TxStatusBadge } from "@/ui/mobile/ReceiptShareCard";
import { formatRp, localYmd, serviceVisual } from "@/lib/mobile/products";
import { serviceLabel } from "@/lib/mobile/receipt-share";

interface TxRow {
  multiPaymentCode: string;
  status: string;
  grandTotal: number;
  totalItems: number;
  createdAt: string;
  paidAt: string | null;
  username: string | null;
  firstCustomerId: string | null;
  firstCustomerName: string | null;
  firstServiceType: string | null;
}

type PeriodKey = "today" | "yesterday" | "7d" | "month" | "30d";
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hari ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "7d", label: "7 hari" },
  { key: "month", label: "Bulan ini" },
  { key: "30d", label: "30 hari" },
];

const STATUS_FILTERS: Array<{ key: string; label: string; value: string }> = [
  { key: "all", label: "Semua", value: "ALL" },
  { key: "ok", label: "Lunas", value: "SUCCESS,PARTIAL_SUCCESS" },
  { key: "pending", label: "Diproses", value: "PENDING,PENDING_REVIEW" },
  { key: "failed", label: "Gagal", value: "FAILED" },
];

function periodRange(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return localYmd(d);
  };
  switch (key) {
    case "today": return { startDate: day(0), endDate: day(0) };
    case "yesterday": return { startDate: day(1), endDate: day(1) };
    case "7d": return { startDate: day(6), endDate: day(0) };
    case "month": return { startDate: localYmd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: day(0) };
    case "30d": return { startDate: day(29), endDate: day(0) };
  }
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = localYmd(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const ymd = localYmd(d);
  if (ymd === today) return "Hari ini";
  if (ymd === localYmd(y)) return "Kemarin";
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
}

export default function MobileRiwayatPage() {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [statusKey, setStatusKey] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [rows, setRows] = useState<TxRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqId = useRef(0);

  // Filter awal dari tautan (mis. dari Laporan: ?periode=today&status=pending)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("periode");
    const st = q.get("status");
    if (p && PERIODS.some((x) => x.key === p)) setPeriod(p as PeriodKey);
    if (st && STATUS_FILTERS.some((x) => x.key === st)) setStatusKey(st);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (nextPage: number) => {
      const id = ++reqId.current;
      setLoading(true);
      setError("");
      const { startDate, endDate } = periodRange(period);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: "20",
        startDate,
        endDate,
        status: STATUS_FILTERS.find((s) => s.key === statusKey)?.value || "ALL",
      });
      if (debounced) params.set("search", debounced);
      try {
        // Server membatasi kasir ke transaksi loketnya sendiri
        const res = await fetch(`/api/pembayaran/multipay?${params.toString()}`);
        const data = await res.json();
        if (id !== reqId.current) return; // ada permintaan yang lebih baru
        if (!res.ok) {
          setError(data.error || "Gagal memuat riwayat");
          return;
        }
        const items: TxRow[] = data.items || [];
        setRows((prev) => (nextPage === 1 ? items : [...prev, ...items]));
        setPage(nextPage);
        setHasNext(Boolean(data.pagination?.hasNext));
        setTotal(Number(data.pagination?.totalItems || 0));
      } catch {
        if (id === reqId.current) setError("Gagal menghubungi server. Periksa koneksi.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [period, statusKey, debounced],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  // Kelompokkan per tanggal
  const groups: Array<{ heading: string; items: TxRow[] }> = [];
  for (const r of rows) {
    const h = dayHeading(r.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.heading === h) last.items.push(r);
    else groups.push({ heading: h, items: [r] });
  }
  const sumShown = rows.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + r.grandTotal, 0);

  return (
    <div>
      <MobileHeader
        title="Riwayat"
        subtitle={loading && rows.length === 0 ? "Memuat…" : `${total} transaksi`}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className="h-10 w-10 rounded-full flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
              aria-label="Cari"
            >
              <span className="material-symbols-outlined">{showSearch ? "search_off" : "search"}</span>
            </button>
            <button
              type="button"
              onClick={() => load(1)}
              className="h-10 w-10 rounded-full flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
              aria-label="Muat ulang"
            >
              <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
            </button>
          </div>
        }
      />

      <div className="px-4 pt-3 space-y-2">
        {showSearch && (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ID / nama pelanggan / no. ref"
            className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
          />
        )}
        <ChipRow>
          {PERIODS.map((p) => (
            <FilterChip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</FilterChip>
          ))}
        </ChipRow>
        <ChipRow>
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s.key} active={statusKey === s.key} onClick={() => setStatusKey(s.key)}>{s.label}</FilterChip>
          ))}
        </ChipRow>
        {statusKey !== "failed" && statusKey !== "pending" && rows.length > 0 && (
          <p className="text-xs text-slate-500">
            Total lunas (yang tampil): <b className="text-slate-700 dark:text-slate-200">{formatRp(sumShown)}</b>
          </p>
        )}
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl">receipt_long</span>
            <p className="mt-2 text-sm">Tidak ada transaksi pada filter ini</p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.heading}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.heading}</h2>
            <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {g.items.map((r) => {
                const v = serviceVisual(r.firstServiceType);
                return (
                  <li key={r.multiPaymentCode}>
                    <Link
                      href={`/m/riwayat/${encodeURIComponent(r.multiPaymentCode)}`}
                      className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800"
                    >
                      <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${v.tone}`}>
                        <span className="material-symbols-outlined text-xl">{v.icon}</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.firstCustomerName || r.firstCustomerId || r.multiPaymentCode}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {serviceLabel(r.firstServiceType)}
                          {r.totalItems > 1 ? ` · ${r.totalItems} tagihan` : ""} ·{" "}
                          {new Date(r.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatRp(r.grandTotal)}</p>
                        <TxStatusBadge status={r.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {hasNext && (
          <button
            type="button"
            disabled={loading}
            onClick={() => load(page + 1)}
            className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 font-medium disabled:opacity-50"
          >
            {loading ? "Memuat…" : "Muat lebih banyak"}
          </button>
        )}
      </div>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">{children}</div>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium border ${
        active
          ? "bg-primary text-white border-primary"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
