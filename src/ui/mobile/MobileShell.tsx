"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MOBILE_NAV, isNavActive } from "./mobile-nav";

/** Kerangka versi mobile: konten + bottom nav, banner offline, dan registrasi service worker. */
export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-background-dark">
      <div className="mx-auto max-w-md min-h-[100dvh] flex flex-col bg-background-light dark:bg-background-dark relative">
        {!online && (
          <div className="sticky top-0 z-50 bg-red-600 text-white text-sm font-medium px-4 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">wifi_off</span>
            Tidak ada koneksi — pembayaran tidak bisa diproses
          </div>
        )}
        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</main>
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
          aria-label="Menu utama"
        >
          <ul className="grid grid-cols-5">
            {MOBILE_NAV.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium ${
                      active ? "text-primary" : "text-slate-500 dark:text-slate-400"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className="material-symbols-outlined text-[26px]"
                      style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Header halaman mobile: judul + tombol kembali opsional + aksi kanan. */
export function MobileHeader({
  title,
  subtitle,
  onBack,
  backHref,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backHref?: string;
  right?: React.ReactNode;
}) {
  const backIcon = <span className="material-symbols-outlined">arrow_back</span>;
  const backCls = "-ml-2 h-10 w-10 flex items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800";
  return (
    <header className="sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center gap-2 border-b border-slate-200/70 dark:border-slate-800">
      {onBack ? (
        <button type="button" onClick={onBack} className={backCls} aria-label="Kembali">
          {backIcon}
        </button>
      ) : backHref ? (
        <Link href={backHref} className={backCls} aria-label="Kembali">
          {backIcon}
        </Link>
      ) : null}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
