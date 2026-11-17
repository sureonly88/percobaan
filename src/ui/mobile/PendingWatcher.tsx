"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { localYmd } from "@/lib/mobile/products";
import { serviceLabel } from "@/lib/mobile/receipt-share";

/**
 * Pemantau transaksi tertunda milik agen (status Diproses / Ditinjau).
 * Saat statusnya berubah final (Lunas / Gagal / Sebagian) — mis. setelah advice dari
 * desktop, keputusan Review, atau "Cek ke provider" — agen diberi tahu lewat banner di
 * aplikasi dan notifikasi HP (bila diizinkan).
 *
 * Hanya berjalan selama aplikasi terbuka (tidak ada push server). Isi notifikasi HP tidak
 * memuat nama pelanggan karena bisa terbaca di layar kunci.
 */
const FAST_MS = 60_000; // ada transaksi tertunda
const SLOW_MS = 180_000; // tidak ada
const LOOKBACK_DAYS = 30;
const storeKey = (u: string) => `m_watch_pending_${u}`;

interface Watched {
  code: string;
  customerId: string;
  serviceType: string | null;
}

interface Notice {
  code: string;
  status: string;
  title: string;
  body: string;
}

const FINAL = ["SUCCESS", "PARTIAL_SUCCESS", "FAILED"];

function maskId(id: string): string {
  return id.length > 4 ? `…${id.slice(-4)}` : id;
}

function describe(status: string): { word: string; detail: string } {
  if (status === "SUCCESS") return { word: "LUNAS", detail: "Struk sudah bisa dikirim ke pelanggan." };
  if (status === "PARTIAL_SUCCESS") return { word: "SEBAGIAN LUNAS", detail: "Sebagian tagihan lunas, sebagian gagal." };
  return { word: "GAGAL", detail: "Saldo yang ditahan dikembalikan ke loket." };
}

export function PendingWatcher() {
  const { data: session, status } = useSession();
  const username = (session?.user as { username?: string } | undefined)?.username || "";
  const [notices, setNotices] = useState<Notice[]>([]);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(async (n: Notice) => {
    setNotices((prev) => [n, ...prev.filter((x) => x.code !== n.code)].slice(0, 3));
    window.dispatchEvent(new Event("m-pending-resolved"));
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const url = `/m/riwayat/${encodeURIComponent(n.code)}`;
        const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
        if (reg) {
          await reg.showNotification(n.title, { body: n.body, tag: n.code, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } });
        } else {
          new Notification(n.title, { body: n.body, tag: n.code, icon: "/icons/icon-192.png" });
        }
      }
    } catch {
      /* notifikasi HP opsional */
    }
  }, []);

  const poll = useCallback(async () => {
    if (!username || busy.current) return;
    busy.current = true;
    let hasPending = false;
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - LOOKBACK_DAYS);
      const q = new URLSearchParams({
        status: "PENDING,PENDING_REVIEW",
        startDate: localYmd(start),
        endDate: localYmd(end),
        pageSize: "50",
      });
      const res = await fetch(`/api/pembayaran/multipay?${q.toString()}`);
      if (!res.ok) return;
      const j = await res.json();
      const current: Watched[] = (j.items || [])
        .filter((i: { username: string | null }) => i.username === username)
        .map((i: { multiPaymentCode: string; firstCustomerId: string | null; firstServiceType: string | null }) => ({
          code: i.multiPaymentCode,
          customerId: i.firstCustomerId || "",
          serviceType: i.firstServiceType,
        }));

      let prev: Watched[] = [];
      try {
        prev = JSON.parse(localStorage.getItem(storeKey(username)) || "[]");
      } catch {
        prev = [];
      }
      const currentCodes = new Set(current.map((c) => c.code));
      const keep = [...current];

      for (const w of prev) {
        if (currentCodes.has(w.code)) continue;
        // Hilang dari daftar tertunda → baca status terbarunya
        try {
          const d = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(w.code)}`);
          if (!d.ok) continue; // tidak ditemukan / bukan milik loket ini → lupakan
          const dj = await d.json();
          const st = String(dj.multiPayment?.status || "");
          if (FINAL.includes(st)) {
            const { word, detail } = describe(st);
            await notify({
              code: w.code,
              status: st,
              title: `${serviceLabel(w.serviceType)} ${maskId(w.customerId)} ${word}`,
              body: detail,
            });
          } else {
            keep.push(w); // masih tertunda tapi di luar halaman/periode daftar
          }
        } catch {
          keep.push(w); // offline — cek lagi nanti
        }
      }
      hasPending = keep.length > 0;
      try {
        localStorage.setItem(storeKey(username), JSON.stringify(keep.slice(0, 100)));
      } catch {
        /* abaikan */
      }
    } catch {
      hasPending = true;
    } finally {
      busy.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => poll(), hasPending ? FAST_MS : SLOW_MS);
    }
  }, [username, notify]);

  useEffect(() => {
    if (status !== "authenticated" || !username) return;
    poll();
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    // Dipicu setelah pembayaran / cek provider agar transaksi baru segera dipantau
    const onKick = () => setTimeout(() => poll(), 1500);
    // Agen sudah melihat status final di halaman detail → tidak perlu diberi tahu lagi
    const onSeen = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      try {
        const list: Watched[] = JSON.parse(localStorage.getItem(storeKey(username)) || "[]");
        localStorage.setItem(storeKey(username), JSON.stringify(list.filter((w) => w.code !== code)));
      } catch {
        /* abaikan */
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("m-pending-refresh", onKick);
    window.addEventListener("m-pending-seen", onSeen);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("m-pending-refresh", onKick);
      window.removeEventListener("m-pending-seen", onSeen);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, username, poll]);

  // Banner hilang sendiri setelah 12 detik
  useEffect(() => {
    if (notices.length === 0) return;
    const t = setTimeout(() => setNotices((n) => n.slice(0, -1)), 12_000);
    return () => clearTimeout(t);
  }, [notices]);

  if (notices.length === 0) return null;
  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[60] px-3 pt-[max(0.75rem,env(safe-area-inset-top))] space-y-2 pointer-events-none">
      {notices.map((n) => {
        const ok = n.status === "SUCCESS";
        return (
          <div
            key={n.code}
            role="status"
            className={`pointer-events-auto rounded-2xl shadow-lg p-3 flex items-start gap-3 text-white ${ok ? "bg-emerald-600" : n.status === "FAILED" ? "bg-red-600" : "bg-amber-600"}`}
          >
            <span className="material-symbols-outlined">{ok ? "check_circle" : n.status === "FAILED" ? "cancel" : "info"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{n.title}</p>
              <p className="text-xs text-white/90">{n.body}</p>
              <Link
                href={`/m/riwayat/${encodeURIComponent(n.code)}`}
                onClick={() => setNotices((x) => x.filter((y) => y.code !== n.code))}
                className="inline-block mt-1 text-xs font-semibold underline"
              >
                Lihat transaksi
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setNotices((x) => x.filter((y) => y.code !== n.code))}
              className="h-7 w-7 flex items-center justify-center rounded-full bg-white/20"
              aria-label="Tutup"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Minta izin notifikasi HP (harus dipanggil dari tombol yang ditekan pengguna). */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
