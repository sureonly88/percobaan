"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getAccessiblePages, normalizeRole, ROLE_LABELS } from "@/lib/rbac";
import { NAV_GROUPS, filterNavGroups, type NavGroup } from "./nav-config";

type BadgeMap = Record<string, number>;

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
        title={group.category}
        className={`flex items-center gap-1 whitespace-nowrap px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "text-primary bg-primary/10"
            : "text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        {group.shortLabel}
        <span className={`material-symbols-outlined text-base transition-transform ${open ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-50">
          <p className="px-4 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.category}</p>
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
    return filterNavGroups(NAV_GROUPS, accessiblePages);
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

  // Drawer: tutup dengan Escape & kunci scroll halaman selama terbuka
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <nav className="print:hidden sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      {/* Main bar */}
      <div className="px-4 lg:px-6 flex items-center justify-between h-16">
        {/* Left: Logo + Desktop Nav */}
        <div className="flex items-center gap-1 lg:gap-2 min-w-0">
          {/* Tombol drawer menu (layar < 1280px) */}
          <button
            onClick={() => setMobileOpen(true)}
            title="Buka menu"
            aria-expanded={mobileOpen}
            className="xl:hidden -ml-2 mr-1 p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
          <Link href="/" className="flex items-center gap-2.5 mr-4 shrink-0">
            <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">bolt</span>
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:block">Pedami</span>
          </Link>

          {/* Desktop nav */}
          {/* 8 grup menu baru muat mulai 1280px; di bawahnya pakai menu hamburger */}
          <div className="hidden xl:flex items-center gap-0.5">
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
            <div className="hidden md:flex xl:hidden 2xl:flex items-center gap-2 text-sm min-w-0">
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
            <span className="hidden 2xl:inline">Keluar</span>
          </button>

        </div>
      </div>

      {/* Drawer menu (layar < 1280px) — panel samping, bukan layar penuh */}
      <div
        className={`xl:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`xl:hidden fixed inset-y-0 left-0 z-[70] flex w-72 max-w-[85vw] flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu navigasi"
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">bolt</span>
            </div>
            <span className="text-lg font-bold tracking-tight">Pedami</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Tutup menu"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {filteredNavGroups.map((group) => (
            <div key={group.category} className="py-1.5">
              <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.category}
              </p>
              {group.items.map((item) => {
                const itemActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    tabIndex={mobileOpen ? 0 : -1}
                    className={`mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
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
        </div>

        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{userName}</p>
              <p className="text-[10px] font-bold uppercase text-primary">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            tabIndex={mobileOpen ? 0 : -1}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Keluar
          </button>
        </div>
      </aside>
    </nav>
  );
}
