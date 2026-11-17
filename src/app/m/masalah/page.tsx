"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { type ReportListItem, ReportRow } from "@/ui/mobile/ReportBits";
import { normalizeRole } from "@/lib/rbac";

/**
 * Daftar laporan masalah. Agen/kasir: laporan miliknya sendiri. Admin/supervisor: semua
 * laporan (filter Terbuka / Selesai). Laporan baru dibuat dari detail transaksi di Riwayat.
 */
export default function MobileMasalahPage() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string } | undefined;
  const handler = ["admin", "supervisor"].includes(normalizeRole(user?.role || "kasir"));
  const [filter, setFilter] = useState<"OPEN" | "SELESAI">("OPEN");
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Server membatasi kasir ke laporannya sendiri
      const res = await fetch(`/api/laporan-transaksi?status=${filter}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setError(j.error || "Gagal memuat laporan");
      else setReports(j.reports || []);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <MobileHeader
        title={handler ? "Laporan masalah" : "Laporan masalah saya"}
        subtitle={handler ? "Dari agen & kasir" : "Pertanyaan Anda ke admin"}
        backHref={handler ? "/m/persetujuan" : "/m/akun"}
      />
      <div className="px-4 pt-3 flex gap-2">
        {([
          ["OPEN", "Terbuka"],
          ["SELESAI", "Selesai"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`h-9 px-4 rounded-full text-sm font-medium border ${
              filter === k ? "bg-primary text-white border-primary" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-4 space-y-3">
        {error && <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
        {!loading && reports.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-5xl">forum</span>
            <p className="mt-2 text-sm">{filter === "OPEN" ? "Tidak ada laporan terbuka" : "Belum ada laporan selesai"}</p>
            {!handler && filter === "OPEN" && (
              <p className="text-xs mt-1 max-w-xs mx-auto">
                Untuk melapor, buka transaksinya di menu Riwayat lalu tekan &quot;Laporkan masalah&quot;.
              </p>
            )}
          </div>
        )}
        {reports.length > 0 && (
          <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                r={r}
                showReporter={handler}
                highlight={r.status !== "SELESAI" && (handler ? r.awaiting === "HANDLER" : r.awaiting === "REPORTER")}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
