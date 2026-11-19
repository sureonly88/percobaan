import type { AgentFlag, AgentSummary } from "@/lib/agent-monitor";

export const FLAG_STYLE: Record<AgentFlag, { label: string; cls: string }> = {
  REVIEW: { label: "Ditinjau", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  TERTAHAN: { label: "Tertahan", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  LAPORAN: { label: "Laporan masalah", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  SALDO_RENDAH: { label: "Saldo rendah", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  BELUM_TUTUP_KASIR: { label: "Belum tutup kasir", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export function FlagBadge({ flag }: { flag: AgentFlag }) {
  const f = FLAG_STYLE[flag];
  return <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${f.cls}`}>{f.label}</span>;
}

/** "baru saja", "5 mnt lalu", "2 jam lalu", "kemarin 14.05", "12 Nov 09.10". */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "belum pernah";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const hours = Math.floor(min / 60);
  const d = new Date(t);
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return hours < 6 ? `${hours} jam lalu` : `hari ini ${time}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `kemarin ${time}`;
  return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ${time}`;
}

/** Keterangan aktivitas: dari kehadiran aplikasi bila ada, kalau tidak dari transaksi terakhir. */
export function activityText(a: Pick<AgentSummary, "online" | "lastSeenAt" | "lastChannel" | "lastTransactionAt">): string {
  if (a.online) return a.lastChannel === "mobile" ? "Online di HP" : "Online di desktop";
  if (a.lastSeenAt) return `Aktif ${relativeTime(a.lastSeenAt)}`;
  if (a.lastTransactionAt) return `Transaksi ${relativeTime(a.lastTransactionAt)}`;
  return "Belum ada aktivitas";
}

export function AgentAvatar({ name, online }: { name: string; online: boolean }) {
  // Hanya kata berhuruf ("Kasir 01" → "K", bukan "K0")
  const words = name.split(/\s+/).filter((p) => p.length > 0 && p[0].toLowerCase() !== p[0].toUpperCase());
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "").slice(0, 2)).toUpperCase();
  return (
    <span className="relative shrink-0 h-11 w-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
      {initials || "?"}
      <span
        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
        aria-label={online ? "online" : "offline"}
      />
    </span>
  );
}
