"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { requestNotificationPermission } from "@/ui/mobile/PendingWatcher";
import { useReportReplies } from "@/ui/mobile/useReportReplies";
import { ROLE_LABELS, canAccessPage, normalizeRole } from "@/lib/rbac";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function MobileAkunPage() {
  const reportReplies = useReportReplies();
  const { data: session } = useSession();
  const user = session?.user as
    | { name?: string | null; username?: string; role?: string; loketCode?: string; loketName?: string }
    | undefined;
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setNotifPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function openDesktop() {
    document.cookie = "prefer_desktop=1; path=/; max-age=31536000; samesite=lax";
    window.location.href = "/";
  }

  const role = ROLE_LABELS[normalizeRole(user?.role || "kasir")];
  const initials = (user?.name || user?.username || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div>
      <MobileHeader title="Akun" />
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">{initials}</div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{user?.name || user?.username}</p>
            <p className="text-sm text-slate-500 truncate">
              {role} · {user?.loketName || user?.loketCode || "tanpa loket"}
            </p>
          </div>
        </div>

        {!standalone && (
          <div className="rounded-2xl bg-primary/10 p-4">
            <p className="font-semibold text-primary">Pasang aplikasi di HP</p>
            {installPrompt ? (
              <button
                type="button"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
                className="mt-3 h-11 w-full rounded-xl bg-primary text-white font-semibold"
              >
                Pasang sekarang
              </button>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Buka menu browser (⋮ di Chrome, atau tombol Bagikan di Safari), lalu pilih <b>Tambahkan ke Layar Utama</b>.
              </p>
            )}
          </div>
        )}

        <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {/* Hanya menu yang boleh dibuka peran ini (supervisor tidak punya Top-up / Tutup kasir mobile) */}
          {([
            ["/m/persetujuan", "inbox", "Persetujuan"],
            ["/m/pantau-agen", "monitoring", "Pantau agen"],
            ["/m/masalah", "forum", reportReplies > 0 ? `Laporan masalah saya (${reportReplies} dibalas)` : "Laporan masalah saya"],
            ["/m/topup", "add_card", "Top-up saldo"],
            ["/m/tutup-kasir", "point_of_sale", "Tutup kasir"],
            ["/m/pengaturan", "settings", "Pengaturan akun"],
            ["/m/panduan", "help_center", "Panduan pengguna"],
          ] as const)
            .filter(
              ([href]) =>
                canAccessPage(user?.role || "kasir", href) &&
                // supervisor: Persetujuan, Agen & laporan sudah ada di menu bawah; admin: laporan lewat inbox
                !((href === "/m/persetujuan" || href === "/m/pantau-agen") && normalizeRole(user?.role || "kasir") === "supervisor") &&
                !(href === "/m/masalah" && normalizeRole(user?.role || "kasir") !== "kasir")
            )
            .map(([href, icon, label]) => (
              <MenuRow key={href} href={href} icon={icon} label={label} />
            ))}
          <li>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("m-pin-change"))}
              className="w-full flex items-center gap-3 px-4 h-14 text-left active:bg-slate-50 dark:active:bg-slate-800"
            >
              <span className="material-symbols-outlined text-slate-500">password</span>
              <span className="flex-1">Ganti PIN aplikasi</span>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </button>
          </li>
          {normalizeRole(user?.role || "kasir") !== "supervisor" && (
          <li>
            <button
              type="button"
              disabled={notifPerm !== "default"}
              onClick={async () => setNotifPerm(await requestNotificationPermission())}
              className="w-full flex items-center gap-3 px-4 h-14 text-left active:bg-slate-50 dark:active:bg-slate-800 disabled:active:bg-transparent"
            >
              <span className="material-symbols-outlined text-slate-500">notifications</span>
              <span className="flex-1">
                <span className="block">Notifikasi status transaksi</span>
                <span className="block text-xs text-slate-500">
                  {notifPerm === "granted"
                    ? "Aktif — Anda diberi tahu saat transaksi diproses selesai"
                    : notifPerm === "denied"
                      ? "Diblokir — izinkan di pengaturan situs browser"
                      : notifPerm === "unsupported"
                        ? "Tidak didukung browser ini — pemberitahuan tampil di dalam aplikasi"
                        : "Ketuk untuk mengaktifkan"}
                </span>
              </span>
              {notifPerm === "granted" && <span className="material-symbols-outlined text-emerald-600">check_circle</span>}
            </button>
          </li>
          )}
          <li>
            <button type="button" onClick={openDesktop} className="w-full flex items-center gap-3 px-4 h-14 text-left active:bg-slate-50 dark:active:bg-slate-800">
              <span className="material-symbols-outlined text-slate-500">desktop_windows</span>
              <span className="flex-1">Buka versi desktop</span>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </button>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full h-12 rounded-xl border border-red-200 dark:border-red-900 text-red-600 font-semibold flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">logout</span> Keluar
        </button>
      </div>
    </div>
  );
}

function MenuRow({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 h-14 active:bg-slate-50 dark:active:bg-slate-800">
        <span className="material-symbols-outlined text-slate-500">{icon}</span>
        <span className="flex-1">{label}</span>
        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
      </Link>
    </li>
  );
}
