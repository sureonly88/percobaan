"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { formatRp, localYmd, serviceVisual } from "@/lib/mobile/products";
import { serviceLabel } from "@/lib/mobile/receipt-share";

type PeriodKey = "today" | "yesterday" | "7d" | "month";
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hari ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "7d", label: "7 hari" },
  { key: "month", label: "Bulan ini" },
];

function periodRange(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date();
  const ago = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return localYmd(d);
  };
  switch (key) {
    case "today": return { startDate: ago(0), endDate: ago(0) };
    case "yesterday": return { startDate: ago(1), endDate: ago(1) };
    case "7d": return { startDate: ago(6), endDate: ago(0) };
    case "month": return { startDate: localYmd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: ago(0) };
  }
}

interface Bucket { count: number; tagihan: number; admin: number; total: number }
interface Report {
  startDate: string;
  endDate: string;
  lunas: Bucket;
  diproses: Bucket;
  gagal: Bucket;
  perLayanan: Array<{ serviceType: string; count: number; admin: number; total: number }>;
}
interface Setoran {
  total: number;
  closingStatus: string | null;
  depositTotal: number | null;
}

const CLOSING_LABEL: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draf tutup kasir", tone: "bg-slate-100 text-slate-700" },
  SUBMITTED: { label: "Sudah disetor · menunggu verifikasi", tone: "bg-amber-100 text-amber-800" },
  VERIFIED: { label: "Setoran terverifikasi", tone: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Setoran ditolak · perbaiki", tone: "bg-red-100 text-red-700" },
};

function fmtTgl(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function MobileLaporanPage() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; username?: string; loketCode?: string; loketName?: string } | undefined;

  const [period, setPeriod] = useState<PeriodKey>("today");
  const [report, setReport] = useState<Report | null>(null);
  const [setoran, setSetoran] = useState<Setoran | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqId = useRef(0);
  const singleDay = period === "today" || period === "yesterday";

  const load = useCallback(async () => {
    if (!user?.username) return;
    const id = ++reqId.current;
    const { startDate, endDate } = periodRange(period);
    setLoading(true);
    setError("");
    setSetoran(null);
    try {
      // Server membatasi ke username & loket sesi
      const res = await fetch(`/api/laporan/saya?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      if (id !== reqId.current) return;
      if (!res.ok) {
        setError(data.error || "Gagal memuat laporan");
        setReport(null);
        return;
      }
      setReport(data);

      // Uang yang harus disetor: angka yang sama dengan layar Tutup Kasir (per hari)
      if (startDate === endDate && user.loketCode) {
        const q = new URLSearchParams({ businessDate: startDate, username: user.username, loketCode: user.loketCode });
        const tk = await fetch(`/api/tutup-kasir?${q.toString()}`);
        if (id !== reqId.current) return;
        if (tk.ok) {
          const t = await tk.json();
          setSetoran({
            total: Number(t.effectiveSummary?.totalNominal ?? t.summary?.totalNominal ?? 0),
            closingStatus: t.closing?.status ?? null,
            depositTotal: t.closing ? Number(t.closing.depositTotal ?? 0) : null,
          });
        }
      }
    } catch {
      if (id === reqId.current) setError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [period, user?.username, user?.loketCode]);

  useEffect(() => {
    load();
  }, [load]);

  const periodeText = report
    ? report.startDate === report.endDate ? fmtTgl(report.startDate) : `${fmtTgl(report.startDate)} – ${fmtTgl(report.endDate)}`
    : "";
  const maxTotal = Math.max(1, ...(report?.perLayanan.map((p) => p.total) ?? [1]));

  function shareWhatsApp() {
    if (!report) return;
    const lines = [
      `*LAPORAN AGEN*`,
      `${user?.name || user?.username} · ${user?.loketName || user?.loketCode || ""}`,
      `Periode: ${periodeText}`,
      `------------------------------`,
    ];
    if (setoran && singleDay) {
      lines.push(`*Harus disetor: ${formatRp(setoran.total)}*`);
      if (setoran.closingStatus) lines.push(`Status: ${CLOSING_LABEL[setoran.closingStatus]?.label ?? setoran.closingStatus}`);
      lines.push(`------------------------------`);
    }
    lines.push(
      `Lunas   : ${report.lunas.count} tagihan · ${formatRp(report.lunas.total)}`,
      `  Tagihan ${formatRp(report.lunas.tagihan)} + admin ${formatRp(report.lunas.admin)}`,
      `Diproses: ${report.diproses.count} tagihan · ${formatRp(report.diproses.total)}`,
      `Gagal   : ${report.gagal.count} tagihan`,
    );
    if (report.perLayanan.length > 0) {
      lines.push(`------------------------------`, `*Per produk (lunas)*`);
      for (const p of report.perLayanan) lines.push(`${serviceLabel(p.serviceType)}: ${p.count} · ${formatRp(p.total)}`);
    }
    lines.push(`------------------------------`, `Dibuat ${new Date().toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  return (
    <div>
      <MobileHeader
        title="Laporan"
        subtitle={periodeText || "Laporan saya"}
        right={
          <button
            type="button"
            onClick={load}
            className="h-10 w-10 rounded-full flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
            aria-label="Muat ulang"
          >
            <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        }
      />

      {/* 1. Periode */}
      <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium border ${
              period === p.key
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-8">
        {error && <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>}

        {/* 2. Uang yang harus disetor */}
        <section className="rounded-2xl bg-primary text-white p-4 shadow-lg shadow-primary/20">
          {singleDay ? (
            <>
              <p className="text-sm text-white/80">Uang tunai yang harus disetor</p>
              <p className="text-3xl font-bold mt-1">{setoran ? formatRp(setoran.total) : loading ? "…" : "-"}</p>
              {setoran?.closingStatus ? (
                <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full ${CLOSING_LABEL[setoran.closingStatus]?.tone ?? "bg-white/20"}`}>
                  {CLOSING_LABEL[setoran.closingStatus]?.label ?? setoran.closingStatus}
                </span>
              ) : (
                setoran && <p className="text-xs text-white/80 mt-1">Belum tutup kasir untuk tanggal ini.</p>
              )}
              {report && report.diproses.count > 0 && (
                <p className="text-xs text-white/90 mt-3 flex gap-1">
                  <span className="material-symbols-outlined text-sm">hourglass_top</span>
                  <span>
                    {formatRp(report.diproses.total)} ({report.diproses.count} tagihan) masih menunggu konfirmasi provider —
                    belum dihitung. Masuk setoran bila nanti dinyatakan lunas.
                  </span>
                </p>
              )}
              <Link href="/m/tutup-kasir" className="mt-3 h-11 rounded-xl bg-white text-primary font-semibold flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-xl">point_of_sale</span> Tutup kasir
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-white/80">Total diterima (lunas)</p>
              <p className="text-3xl font-bold mt-1">{report ? formatRp(report.lunas.total) : loading ? "…" : "-"}</p>
              <p className="text-xs text-white/80 mt-1">Setoran dihitung per hari — pilih Hari ini atau Kemarin untuk melihat uang yang harus disetor.</p>
            </>
          )}
        </section>

        {/* 3. Ringkasan transaksi */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <h2 className="font-semibold mb-3">Ringkasan transaksi</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatTile href={`/m/riwayat?periode=${period}&status=ok`} label="Lunas" value={report?.lunas.count} tone="text-emerald-600" />
            <StatTile href={`/m/riwayat?periode=${period}&status=pending`} label="Diproses" value={report?.diproses.count} tone="text-amber-600" />
            <StatTile href={`/m/riwayat?periode=${period}&status=failed`} label="Gagal" value={report?.gagal.count} tone="text-red-600" />
          </div>
          <dl className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm space-y-1">
            <Row label="Nilai tagihan" value={report ? formatRp(report.lunas.tagihan) : "-"} />
            <Row label="Biaya admin" value={report ? formatRp(report.lunas.admin) : "-"} />
            <Row label="Total lunas" value={report ? formatRp(report.lunas.total) : "-"} bold />
          </dl>
        </section>

        {/* 4. Per produk */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <h2 className="font-semibold mb-3">Per produk (lunas)</h2>
          {!report || report.perLayanan.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">{loading ? "Memuat…" : "Belum ada transaksi lunas"}</p>
          ) : (
            <ul className="space-y-3">
              {report.perLayanan.map((p) => {
                const v = serviceVisual(p.serviceType);
                return (
                  <li key={p.serviceType} className="flex items-center gap-3">
                    <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${v.tone}`}>
                      <span className="material-symbols-outlined text-lg">{v.icon}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate">{serviceLabel(p.serviceType)}</span>
                        <span className="font-semibold whitespace-nowrap">{formatRp(p.total)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (p.total / maxTotal) * 100)}%` }} />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.count} tagihan · admin {formatRp(p.admin)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 7. Bagikan */}
        <button
          type="button"
          disabled={!report}
          onClick={shareWhatsApp}
          className="w-full h-12 rounded-xl bg-[#25D366] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <span className="material-symbols-outlined">chat</span> Kirim laporan ke WhatsApp
        </button>
      </div>
    </div>
  );
}

function StatTile({ href, label, value, tone }: { href: string; label: string; value: number | undefined; tone: string }) {
  return (
    <Link href={href} className="rounded-xl bg-slate-50 dark:bg-slate-800 py-2.5 active:bg-slate-100 dark:active:bg-slate-700">
      <p className={`text-xl font-bold ${tone}`}>{value ?? "-"}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </Link>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <dt className={bold ? "" : "text-slate-500"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
