"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getAccessiblePages, normalizeRole, ROLE_LABELS } from "@/lib/rbac";

type NavItem = { label: string; href: string; icon: string };
type NavGroup = { category: string; items: NavItem[] };

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
      { label: "Update Saldo Loket", href: "/saldo", icon: "account_balance_wallet" },
    ],
  },
  {
    category: "Administrasi",
    items: [
      { label: "Biaya Admin", href: "/biaya-admin", icon: "payments" },
      { label: "Manajemen User", href: "/users", icon: "admin_panel_settings" },
      { label: "API Provider", href: "/provider", icon: "api" },
      { label: "Dokumentasi API", href: "/provider/docs", icon: "menu_book" },
      { label: "Pengaturan", href: "/pengaturan", icon: "settings" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  const sessionUser = session?.user as { name?: string | null; username?: string; email?: string | null; role?: string } | undefined;
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

  // Filter nav items based on role
  const accessiblePages = useMemo(() => getAccessiblePages(userRole), [userRole]);
  const filteredNavGroups = useMemo(() => {
    return NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          accessiblePages.some((p) => item.href === p || (p !== "/" && item.href.startsWith(p + "/")))
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [accessiblePages]);

  return (
    <aside
      className={`${
        collapsed ? "w-[76px]" : "w-64"
      } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-300 ease-in-out`}
    >
      {/* Logo + Toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center p-4" : "justify-between p-6"}`}>
        <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
          <div className="bg-primary rounded-lg p-2 flex items-center justify-center text-white shrink-0">
            <span className="material-symbols-outlined text-2xl">bolt</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-lg font-bold leading-none">Pedami Payment</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                Dashboard
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
            title="Minimize sidebar"
          >
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center mt-1 mb-2">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
            title="Expand sidebar"
          >
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex-1 ${collapsed ? "px-2" : "px-4"} mt-4 space-y-6 overflow-y-auto`}>
        {filteredNavGroups.map((group) => (
          <div key={group.category}>
            {!collapsed && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-4 mb-2">
                {group.category}
              </p>
            )}
            {collapsed && (
              <hr className="border-slate-200 dark:border-slate-700 mx-2 mb-2" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center ${
                      collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                    } rounded-lg ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    } transition-colors`}
                  >
                    <span className="material-symbols-outlined shrink-0">{item.icon}</span>
                    {!collapsed && (
                      <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className={`${collapsed ? "p-2" : "p-4"} border-t border-slate-200 dark:border-slate-800`}>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`flex items-center ${
            collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
          } rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full`}
          title={collapsed ? "Keluar" : undefined}
        >
          <span className="material-symbols-outlined shrink-0">logout</span>
          {!collapsed && <span>Keluar</span>}
        </button>
        
      </div>
    </aside>
  );
}
