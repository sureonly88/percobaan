"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { normalizeRole } from "@/lib/rbac";

/**
 * Agen/kasir: jumlah laporan masalah miliknya yang sudah dibalas / diselesaikan admin dan
 * belum dibuka. Diperbarui tiap 2 menit, saat aplikasi dibuka kembali, dan setelah event
 * "m-report-refresh". Admin/supervisor memakai useApprovalCount (tab Masalah di inbox).
 */
export function useReportReplies(): number {
  const { data: session, status } = useSession();
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role || "kasir");
  const enabled = status === "authenticated" && role === "kasir";
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch("/api/laporan-transaksi?summary=1", { cache: "no-store" });
        if (res.ok && alive) setCount(Number((await res.json()).awaiting || 0));
      } catch {
        /* abaikan */
      }
    };
    run();
    const t = setInterval(run, 120_000);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("m-report-refresh", run);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("m-report-refresh", run);
    };
  }, [enabled]);

  return enabled ? count : 0;
}
