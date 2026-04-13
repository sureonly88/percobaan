"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getAccessiblePages, normalizeRole, ROLE_LABELS } from "@/lib/rbac";

type NavItem = { label: string; href: string; icon: string };
type NavGroup = { category: string; items: NavItem[] };
type BadgeMap = Record<string, number>;

const NAV_GROUPS: NavGroup[] = [
  {
    category: "Operasional",
    items: [
      { label: "Dashboard", href: "/", icon: "dashboard" },
      { label: "Multi-Payment", href: "/pembayaran", icon: "receipt_long" },
      { label: "Advice Lunasin", href: "/advice-lunasin", icon: "fact_check" },
      { label: "Monitoring", href: "/monitoring", icon: "monitor_heart" },
      { label: "Notifikasi", href: "/notifikasi", icon: "notifications" },
    ],
  },
  {
    category: "Kasir & Laporan",
    items: [
      { label: "Tutup Kasir", href: "/tutup-kasir", icon: "point_of_sale" },
      { label: "Verifikasi Kasir", href: "/verifikasi-kasir", icon: "verified" },
      { label: "Laporan Transaksi", href: "/laporan", icon: "analytics" },
      { label: "Rekonsiliasi Data", href: "/rekonsiliasi", icon: "table_view" },
      { label: "Riwayat", href: "/riwayat", icon: "history" },
    ],
  },
  {
    category: "Pelanggan & Loket",
    items: [
      { label: "Manajemen Pelanggan", href: "/pelanggan", icon: "group" },
      { label: "Manajemen Loket", href: "/loket", icon: "store" },
      { label: "Anggota Loket", href: "/loket/members", icon: "manage_accounts" },
      { label: "Update Saldo Loket", href: "/saldo", icon: "account_balance_wallet" },
      { label: "Top-up Saldo", href: "/topup", icon: "add_card" },
    ],
  },
  {
    category: "Administrasi",
    items: [
      { label: "Biaya Admin", href: "/biaya-admin", icon: "payments" },
      { label: "Manajemen User", href: "/users", icon: "admin_panel_settings" },
      { label: "Pendaftaran Agen", href: "/users/registrations", icon: "how_to_reg" },
      { label: "API Provider", href: "/provider", icon: "api" },
      { label: "Dokumentasi API", href: "/provider/docs", icon: "menu_book" },
      { label: "Pengaturan", href: "/pengaturan", icon: "settings" },
      { label: "DB Manager", href: "/db-manage", icon: "database" },
    ],
  },
];

function NavDropdown({ group, isActive, badgeMap = {} }: { group: NavGroup; isActive: boolean; badgeMap?: BadgeMap }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "text-primary bg-primary/10"
            : "text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        {group.category}
        <span className={`material-symbols-outlined text-base transition-transform ${open ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-50">
          {group.items.map((item) => {
            const itemActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  itemActive
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {badgeMap[item.href] ? (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {badgeMap[item.href] > 99 ? "99+" : badgeMap[item.href]}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppTopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const sessionUser = session?.user as {
    name?: string | null;
    username?: string;
    email?: string | null;
    role?: string;
  } | undefined;
  const userName = sessionUser?.name || sessionUser?.username || sessionUser?.email || "User";
  const userRole = (session?.user as { role?: string })?.role || "kasir";
  const normalizedRole = normalizeRole(userRole);
  const roleLabel = ROLE_LABELS[normalizedRole];
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const accessiblePages = useMemo(() => getAccessiblePages(userRole), [userRole]);
  const filteredNavGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        accessiblePages.some(
          (p) => item.href === p || (p !== "/" && item.href.startsWith(p + "/"))
        )
      ),
    })).filter((group) => group.items.length > 0);
  }, [accessiblePages]);

  // Fetch pending registrations count for admin badge
  useEffect(() => {
    if (normalizedRole !== "admin") return;
    async function fetchPending() {
      try {
        const res = await fetch("/api/admin/registrations?status=pending&pageSize=1");
        if (res.ok) {
          const d = await res.json();
          setPendingCount(d.pendingCount ?? 0);
        }
      } catch { /* ignore */ }
    }
    fetchPending();
    const id = setInterval(fetchPending, 60_000);
    return () => clearInterval(id);
  }, [normalizedRole]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      {/* Main bar */}
      <div className="px-4 lg:px-6 flex items-center justify-between h-16">
        {/* Left: Logo + Desktop Nav */}
        <div className="flex items-center gap-1 lg:gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 mr-4 shrink-0">
            <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">bolt</span>
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:block">Pedami</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {filteredNavGroups.map((group) => {
              const groupActive = group.items.some((item) => pathname === item.href);
              const badgeMap: BadgeMap = pendingCount > 0 ? { "/users/registrations": pendingCount } : {};
            return <NavDropdown key={group.category} group={group} isActive={groupActive} badgeMap={badgeMap} />;
            })}
          </div>
        </div>

        {/* Right: user info + mobile toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5">
            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
                {userName}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/10 text-primary uppercase leading-none">
                {roleLabel}
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Keluar"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            <span className="hidden lg:inline">Keluar</span>
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-[calc(100vh-4rem)] overflow-y-auto">
          {filteredNavGroups.map((group) => (
            <div key={group.category} className="py-2">
              <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {group.category}
              </p>
              {group.items.map((item) => {
                const itemActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                      itemActive
                        ? "text-primary bg-primary/10 font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {pendingCount > 0 && item.href === "/users/registrations" && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-800 p-3">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full"
            >
              <span className="material-symbols-outlined">logout</span>
              Keluar
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
