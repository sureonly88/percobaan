"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { AppSidebar } from "./AppSidebar";
import { NotificationCenter } from "./NotificationCenter";
import { useStuckTransactionDetector } from "@/lib/useStuckDetector";
import { normalizeRole, ROLE_LABELS } from "@/lib/rbac";

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loketSaldo, setLoketSaldo] = useState<number | null>(null);

  const user = session?.user as { loketCode?: string; loketName?: string; role?: string; name?: string | null; username?: string; email?: string | null } | undefined;
  const userName = user?.name || user?.username || user?.email || "User";
  const normalizedRole = normalizeRole(user?.role || "kasir");
  const roleLabel = ROLE_LABELS[normalizedRole];
  const userInitials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const fetchSaldo = useCallback(() => {
    if (user?.loketCode) {
      fetch("/api/saldo")
        .then(r => r.json())
        .then(json => {
          const loket = (json.lokets ?? []).find((l: { loketCode: string }) => l.loketCode === user.loketCode);
          if (loket) setLoketSaldo(Number(loket.pulsa));
        })
        .catch(() => {});
    }
  }, [user?.loketCode]);

  useEffect(() => {
    fetchSaldo();
    const interval = setInterval(fetchSaldo, 60000);
    return () => clearInterval(interval);
  }, [fetchSaldo]);

  // Hooks must be called before any conditional returns
  useStuckTransactionDetector();

  // Redirect to login when unauthenticated
  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      router.replace("/login");
    }
  }, [status, router, pathname]);

  // Login page — render without shell
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show centered loading while redirecting
  if (!session) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Authenticated — show full app shell
  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex items-center justify-between">
          <div className="relative max-w-md w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
              search
            </span>
            <input
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary"
              placeholder="Cari data..."
              type="text"
            />
          </div>
          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div className="text-sm font-medium text-slate-500">
              {new Date().toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-2.5 py-1.5 min-w-0">
              <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {userInitials}
              </div>
              <div className="hidden sm:flex items-center gap-2 min-w-0 text-sm">
                <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {userName}
                </p>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/10 text-primary uppercase leading-none">
                  {roleLabel}
                </span>
                {user?.loketCode && (
                  <>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                    <span className="material-symbols-outlined text-primary text-sm">store</span>
                    <span className="text-xs text-slate-500 truncate">{user.loketName || user.loketCode}</span>
                    {loketSaldo !== null && (
                      <>
                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                        <span className={`text-xs font-bold ${loketSaldo < 100000 ? 'text-red-500' : 'text-emerald-600'}`}>
                          {formatRupiah(loketSaldo)}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="p-8 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
