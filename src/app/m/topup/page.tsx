"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { formatRp } from "@/lib/mobile/products";

// Sama dengan daftar yang divalidasi server di /api/topup/create.
const NOMINALS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
const PAGE_SIZE = 10;

type TopupStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

interface TopupRow {
  requestCode: string;
  orderId: string;
  loketCode: string;
  username: string;
  nominal: number;
  status: TopupStatus;
  paymentMethod: string | null;
  snapUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ActiveTopup {
  orderId: string;
  nominal: number;
  snapUrl: string | null;
  expiresAt: string | null;
  status: TopupStatus;
}

const STATUS_META: Record<TopupStatus, { label: string; cls: string }> = {
  SUCCESS: { label: "Berhasil", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" },
  FAILED: { label: "Gagal", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200" },
  EXPIRED: { label: "Kedaluwarsa", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

/** PENDING yang sudah lewat expiresAt tidak bisa dibayar lagi meski status di DB belum diperbarui. */
function isPayable(t: { status: TopupStatus; snapUrl: string | null; expiresAt: string | null }): boolean {
  if (t.status !== "PENDING" || !t.snapUrl) return false;
  if (!t.expiresAt) return true;
  const exp = new Date(t.expiresAt).getTime();
  return Number.isNaN(exp) || exp > Date.now();
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MobileTopupPage() {
  const [nominal, setNominal] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<ActiveTopup | null>(null);

  const [rows, setRows] = useState<TopupRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const reqId = useRef(0);

  const loadHistory = useCallback(async (nextPage: number) => {
    const id = ++reqId.current;
    setLoading(true);
    setListError("");
    try {
      const res = await fetch(`/api/topup?page=${nextPage}&pageSize=${PAGE_SIZE}`, { cache: "no-store" });
      const data = await res.json();
      if (id !== reqId.current) return;
      if (!res.ok) {
        setListError(data.error || "Gagal memuat riwayat top-up");
        return;
      }
      const items: TopupRow[] = data.topups || [];
      setRows((prev) => (nextPage === 1 ? items : [...prev, ...items]));
      setPage(nextPage);
      setTotalPages(Number(data.pagination?.totalPages || 1));
      // Pulihkan pembayaran yang masih menunggu (mis. setelah aplikasi ditutup)
      if (nextPage === 1) {
        const pending = items.find(isPayable);
        if (pending) {
          setActive((cur) =>
            cur ?? {
              orderId: pending.orderId,
              nominal: Number(pending.nominal),
              snapUrl: pending.snapUrl,
              expiresAt: pending.expiresAt,
              status: "PENDING",
            },
          );
        }
      }
    } catch {
      if (id === reqId.current) setListError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(1);
  }, [loadHistory]);

  // Cek status pembayaran aktif tiap 5 detik sampai tidak PENDING lagi.
  const activeOrderId = active?.status === "PENDING" ? active.orderId : null;
  useEffect(() => {
    if (!activeOrderId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/topup?code=${encodeURIComponent(activeOrderId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status && data.status !== "PENDING") {
          setActive((cur) => (cur && cur.orderId === activeOrderId ? { ...cur, status: data.status } : cur));
          loadHistory(1);
        }
      } catch {
        // coba lagi di putaran berikutnya
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeOrderId, loadHistory]);

  async function onCreate() {
    if (!nominal) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/topup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat top-up");
        return;
      }
      setActive({
        orderId: data.orderId,
        nominal: Number(data.nominal),
        snapUrl: data.snapUrl ?? null,
        expiresAt: data.expiresAt ?? null,
        status: "PENDING",
      });
      setNominal(null);
      loadHistory(1);
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <MobileHeader title="Top-up saldo" subtitle="Isi saldo loket lewat Midtrans" backHref="/m/akun" />
      <div className="p-4 space-y-4">
        {active && <ActiveCard active={active} onDismiss={() => setActive(null)} />}

        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Pilih nominal</h2>
          <div className="grid grid-cols-2 gap-2">
            {NOMINALS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNominal(n)}
                aria-pressed={nominal === n}
                className={`h-12 rounded-xl border text-sm font-semibold ${
                  nominal === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 dark:border-slate-700 active:bg-slate-50 dark:active:bg-slate-800"
                }`}
              >
                {formatRp(n)}
              </button>
            ))}
          </div>

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Biaya layanan</dt>
              <dd className="text-emerald-600 font-medium">Gratis</dd>
            </div>
            <div className="flex justify-between text-base">
              <dt className="font-semibold">Total bayar</dt>
              <dd className="font-bold">{nominal ? formatRp(nominal) : "-"}</dd>
            </div>
          </dl>

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onCreate}
            disabled={!nominal || submitting}
            className="mt-4 h-12 w-full rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
          >
            {submitting ? "Membuat pembayaran…" : "Lanjut ke pembayaran"}
          </button>
          <p className="mt-2 text-xs text-slate-500">Saldo masuk otomatis setelah pembayaran dikonfirmasi Midtrans.</p>
        </section>

        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-sm font-semibold text-slate-500">Riwayat top-up</h2>
            <button type="button" onClick={() => loadHistory(1)} className="text-sm text-primary font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-base">refresh</span>
              Muat ulang
            </button>
          </div>

          {listError && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 p-4 text-sm mb-2">{listError}</div>
          )}

          {rows.length === 0 && !loading && !listError ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-500">Belum ada top-up.</div>
          ) : (
            <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {rows.map((t) => {
                const expired = t.status === "PENDING" && !isPayable(t) && Boolean(t.expiresAt);
                const meta = expired ? STATUS_META.EXPIRED : (STATUS_META[t.status] ?? STATUS_META.EXPIRED);
                return (
                  <li key={t.orderId} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{formatRp(Number(t.nominal))}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {fmtTime(t.createdAt)} · {t.username}
                          {t.paymentMethod ? ` · ${t.paymentMethod}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                    </div>
                    {isPayable(t) && t.snapUrl && (
                      <a
                        href={t.snapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary font-medium"
                      >
                        Lanjutkan pembayaran
                        <span className="material-symbols-outlined text-base">open_in_new</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {loading && <div className="mt-2 h-14 rounded-2xl bg-white dark:bg-slate-900 animate-pulse" />}
          {!loading && page < totalPages && (
            <button
              type="button"
              onClick={() => loadHistory(page + 1)}
              className="mt-3 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 font-medium"
            >
              Muat lebih banyak
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function ActiveCard({ active, onDismiss }: { active: ActiveTopup; onDismiss: () => void }) {
  if (active.status === "PENDING") {
    return (
      <section className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 animate-pulse">hourglass_top</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Menunggu pembayaran {formatRp(active.nominal)}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {active.orderId}
              {active.expiresAt ? ` · berlaku s.d. ${fmtTime(active.expiresAt)}` : ""}
            </p>
          </div>
        </div>
        {active.snapUrl && (
          <a
            href={active.snapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 h-12 w-full rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2"
          >
            Buka halaman pembayaran
            <span className="material-symbols-outlined text-base">open_in_new</span>
          </a>
        )}
        <p className="mt-2 text-xs text-slate-500">Status diperbarui otomatis setelah Anda menyelesaikan pembayaran.</p>
      </section>
    );
  }

  const ok = active.status === "SUCCESS";
  return (
    <section
      className={`rounded-2xl p-4 flex items-start gap-3 ${
        ok ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200" : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
      }`}
    >
      <span className="material-symbols-outlined">{ok ? "check_circle" : "error"}</span>
      <div className="flex-1">
        <p className="font-semibold">{ok ? "Top-up berhasil" : active.status === "EXPIRED" ? "Top-up kedaluwarsa" : "Top-up gagal"}</p>
        <p className="text-sm">
          {formatRp(active.nominal)}
          {ok ? " sudah masuk ke saldo loket." : "."}
        </p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Tutup" className="h-8 w-8 -mr-1 flex items-center justify-center rounded-full">
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </section>
  );
}
