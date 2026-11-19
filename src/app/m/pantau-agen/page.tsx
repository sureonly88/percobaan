"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { AgentAvatar, FlagBadge, activityText } from "@/ui/mobile/AgentBits";
import { formatRp } from "@/lib/mobile/products";
import type { AgentOverview, AgentSummary } from "@/lib/agent-monitor";

type FilterKey = "all" | "attention" | "online" | "idle";
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "attention", label: "Perlu perhatian" },
  { key: "online", label: "Online" },
  { key: "idle", label: "Belum transaksi" },
];

function needsAttention(a: AgentSummary) {
  return a.flags.includes("REVIEW") || a.flags.includes("TERTAHAN") || a.flags.includes("LAPORAN");
}

function matches(a: AgentSummary, filter: FilterKey, q: string) {
  if (filter === "attention" && !needsAttention(a)) return false;
  if (filter === "online" && !a.online) return false;
  if (filter === "idle" && a.today.itemCount > 0) return false;
  if (!q) return true;
  const hay = `${a.name} ${a.username} ${a.loketCode || ""} ${a.loketName || ""}`.toLowerCase();
  return hay.includes(q);
}

export default function PantauAgenPage() {
  const [data, setData] = useState<AgentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // rbac-check: admin, supervisor
      const res = await fetch("/api/pantau-agen", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data agen");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data agen");
    } finally {
      setLoading(false);
    }
  }, []);

  // Muat ulang tiap menit selama halaman terlihat
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const q = search.trim().toLowerCase();
  const agents = useMemo(() => (data?.agents || []).filter((a) => matches(a, filter, q)), [data, filter, q]);
  const t = data?.totals;

  return (
    <div>
      <MobileHeader
        title="Pantau agen"
        subtitle={
          data
            ? `Diperbarui ${new Date(data.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
            : "Aktivitas agen hari ini"
        }
        right={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-10 w-10 flex items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800 disabled:opacity-50"
            aria-label="Muat ulang"
          >
            <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        }
      />

      <div className="p-4 space-y-4">
        {error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 text-sm">{error}</div>
        )}

        {t && (
          <div className="grid grid-cols-2 gap-3">
            <Stat icon="wifi" tone="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30" label="Online sekarang" value={`${t.online} / ${t.agents}`} sub={`${t.activeToday} aktif hari ini`} />
            <Stat icon="receipt_long" tone="text-primary bg-primary/10" label="Lunas hari ini" value={String(t.successCount)} sub={formatRp(t.successAmount)} />
            <Stat
              icon="hourglass_top"
              tone="text-amber-600 bg-amber-50 dark:bg-amber-900/30"
              label="Tertahan"
              value={String(t.pendingCount + t.reviewCount)}
              sub={t.heldAmount > 0 ? `${formatRp(t.heldAmount)} ditahan` : "Tidak ada saldo ditahan"}
            />
            <Stat
              icon="priority_high"
              tone="text-red-600 bg-red-50 dark:bg-red-900/30"
              label="Perlu perhatian"
              value={String(t.needAttention)}
              sub={t.reviewCount > 0 ? `${t.reviewCount} di Review Transaksi` : "agen"}
            />
          </div>
        )}

        <div className="space-y-3">
          <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="material-symbols-outlined text-slate-400">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, username, atau loket"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 h-9 px-3 rounded-full text-sm font-medium border ${
                  filter === f.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">groups</span>
            {data?.agents.length ? "Tidak ada agen yang cocok dengan filter." : "Belum ada agen aktif."}
          </div>
        ) : (
          <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {agents.map((a) => (
              <li key={a.username}>
                <Link
                  href={`/m/pantau-agen/${encodeURIComponent(a.username)}`}
                  className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800"
                >
                  <AgentAvatar name={a.name} online={a.online} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {a.loketName || a.loketCode || "Tanpa loket"} · {activityText(a)}
                    </p>
                    {a.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {a.flags.map((f) => (
                          <FlagBadge key={f} flag={f} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatRp(a.today.successAmount)}</p>
                    <p className="text-[11px] text-slate-500">{a.today.successCount} lunas</p>
                    {a.pendingCount + a.reviewCount > 0 && (
                      <p className="text-[11px] font-semibold text-amber-600">{a.pendingCount + a.reviewCount} tertahan</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-slate-400 text-center px-4">
          &quot;Online&quot; = aplikasi agen terbuka dalam 5 menit terakhir. Angka hari ini dihitung sejak pukul 00.00.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon, tone, label, value, sub }: { icon: string; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${tone}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <span className="text-xs text-slate-500 leading-tight">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="text-[11px] text-slate-500 truncate">{sub}</p>
    </div>
  );
}
