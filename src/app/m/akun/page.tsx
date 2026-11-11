"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { ROLE_LABELS, normalizeRole } from "@/lib/rbac";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function MobileAkunPage() {
  const { data: session } = useSession();
  const user = session?.user as
    | { name?: string | null; username?: string; role?: string; loketCode?: string; loketName?: string }
    | undefined;
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
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
          <MenuRow href="/m/topup" icon="add_card" label="Top-up saldo" />
          <MenuRow href="/m/tutup-kasir" icon="point_of_sale" label="Tutup kasir" />
          <MenuRow href="/m/pengaturan" icon="settings" label="Pengaturan akun" />
          <MenuRow href="/m/panduan" icon="help_center" label="Panduan pengguna" />
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
