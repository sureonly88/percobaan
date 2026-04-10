"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { normalizeRole, ROLE_LABELS } from "@/lib/rbac";

const NAV_LINKS = [
  { label: "Dashboard", href: "/" },
  { label: "Pembayaran", href: "/pembayaran" },
  { label: "Riwayat", href: "#" },
  { label: "Laporan", href: "#" },
  { label: "Pengaturan", href: "#" },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionUser = session?.user as { name?: string | null; username?: string; email?: string | null; role?: string } | undefined;
  const userName = sessionUser?.name || sessionUser?.username || sessionUser?.email || "User";
  const userRole = normalizeRole((session?.user as { role?: string } | undefined)?.role || "kasir");
  const roleLabel = ROLE_LABELS[userRole];
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-20 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="bg-primary p-1.5 rounded-lg text-white flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Pedami Payment</h2>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={
                  isActive
                    ? "text-sm font-semibold text-primary"
                    : "text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary w-64"
            placeholder="Cari transaksi..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-semibold truncate">{userName}</p>
            <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
