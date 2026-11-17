"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { normalizeRole } from "@/lib/rbac";
import { actionableCount, fetchApprovalInbox } from "@/lib/mobile/approvals";

const REFRESH_MS = 120_000;

/**
 * Jumlah persetujuan yang menunggu tindakan pengguna (admin / supervisor). Untuk kasir
 * selalu 0 dan tidak memanggil API. Diperbarui tiap 2 menit, saat aplikasi kembali
 * dibuka, dan setelah event "m-approval-refresh" (dipicu halaman inbox setelah aksi).
 */
export function useApprovalCount(): number | null {
  const { data: session, status } = useSession();
  const user = session?.user as { username?: string; role?: string } | undefined;
  const role = normalizeRole(user?.role || "kasir");
  const enabled = status === "authenticated" && (role === "admin" || role === "supervisor");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !user?.username) return;
    let alive = true;
    const run = async () => {
      const inbox = await fetchApprovalInbox();
      if (alive && inbox.errors.length < 3) setCount(actionableCount(inbox, user.username!).total);
    };
    run();
    const t = setInterval(run, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("m-approval-refresh", run);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("m-approval-refresh", run);
    };
  }, [enabled, user?.username]);

  return enabled ? count : null;
}
