"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { TxStatusBadge } from "@/ui/mobile/ReceiptShareCard";
import { ReportStatusBadge } from "@/ui/mobile/ReportBits";
import { AgentAvatar, FlagBadge, activityText, relativeTime } from "@/ui/mobile/AgentBits";
import { formatRp, serviceVisual } from "@/lib/mobile/products";
import { serviceLabel, toWaNumber } from "@/lib/mobile/receipt-share";
import type { AgentDetail } from "@/lib/agent-monitor";
import { LOW_BALANCE_THRESHOLD } from "@/lib/agent-monitor-shared";

const CLOSING_LABEL: Record<string, string> = {
  DRAFT: "Draf, belum dikirim",
  SUBMITTED: "Terkirim, menunggu verifikasi",
  VERIFIED: "Terverifikasi",
  REJECTED: "Dikembalikan verifikator",
};

export default function PantauAgenDetailPage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(String(params?.username || ""));
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // rbac-check: admin, supervisor
      const res = await fetch(`/api/pantau-agen?username=${encodeURIComponent(username)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data agen");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data agen");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (!username) return;
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(t);
  }, [username, load]);

  const a = data?.agent;
  const wa = a?.phone ? toWaNumber(a.phone) : "";

  return (
    <div>
      <MobileHeader
        title={a?.name || username}
        subtitle={a ? `${a.username} · ${a.loketName || a.loketCode || "Tanpa loket"}` : "Detail agen"}
        backHref="/m/pantau-agen"
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
        {error && <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 text-sm">{error}</div>}

        {loading && !data && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {a && data && (
          <>
            {/* Status & kontak */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <AgentAvatar name={a.name} online={a.online} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${a.online ? "text-emerald-600" : ""}`}>{activityText(a)}</p>
                  <p className="text-xs text-slate-500">
                    Transaksi terakhir: {a.lastTransactionAt ? relativeTime(a.lastTransactionAt) : "belum ada"}
                  </p>
                  {data.lastPath && !a.online && a.lastSeenAt && (
                    <p className="text-[11px] text-slate-400 truncate">Halaman terakhir: {data.lastPath}</p>
                  )}
                </div>
              </div>
              {a.flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.flags.map((f) => (
                    <FlagBadge key={f} flag={f} />
                  ))}
                </div>
              )}
              {a.phone && (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`tel:${a.phone.replace(/[^\d+]/g, "")}`}
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 text-sm font-semibold"
                  >
                    <span className="material-symbols-outlined text-[20px]">call</span>
                    Telepon
                  </a>
                  {wa ? (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center gap-1.5 text-sm font-semibold"
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                      WhatsApp
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
              )}
            </section>

            {/* Angka hari ini */}
            <section className="grid grid-cols-2 gap-3">
              <Mini label="Lunas hari ini" value={formatRp(a.today.successAmount)} sub={`${a.today.successCount} transaksi · admin ${formatRp(a.today.adminFee)}`} />
              <Mini label="Gagal hari ini" value={String(a.today.failedCount)} sub="transaksi" />
              <Mini
                label="Saldo loket"
                value={formatRp(a.loketSaldo)}
                sub={a.loketSaldo < LOW_BALANCE_THRESHOLD ? "Di bawah batas saldo rendah" : a.loketCode || "-"}
                warn={a.loketSaldo < LOW_BALANCE_THRESHOLD}
              />
              <Mini
                label="Saldo ditahan"
                value={formatRp(a.heldAmount)}
                sub={`${a.pendingCount} diproses · ${a.reviewCount} ditinjau`}
                warn={a.pendingCount + a.reviewCount > 0}
              />
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500">point_of_sale</span>
              <span className="flex-1 text-sm">Tutup kasir hari ini</span>
              <span className={`text-xs font-semibold ${a.flags.includes("BELUM_TUTUP_KASIR") ? "text-amber-600" : "text-slate-500"}`}>
                {a.closingStatus ? CLOSING_LABEL[a.closingStatus] || a.closingStatus : "Belum ada"}
              </span>
            </section>

            {/* Transaksi tertahan */}
            <Section title="Transaksi tertahan" count={data.pending.length} empty="Tidak ada transaksi yang tertahan.">
              {data.pending.map((p) => {
                const v = serviceVisual(p.serviceType);
                return (
                  <li key={`${p.multiPaymentCode}-${p.transactionCode}`}>
                    <Link href={`/m/riwayat/${encodeURIComponent(p.multiPaymentCode)}`} className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
                      <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${v.tone}`}>
                        <span className="material-symbols-outlined text-[20px]">{v.icon}</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.customerName || p.customerId || p.multiPaymentCode}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {serviceLabel(p.serviceType)} · {relativeTime(p.createdAt)}
                        </p>
                        <p className="text-[11px] text-slate-400">Advice {p.adviceAttempts}x</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatRp(p.total)}</p>
                        <span className="mt-1 inline-block"><TxStatusBadge status={p.status} /></span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </Section>

            {/* Laporan masalah terbuka */}
            <Section title="Laporan masalah terbuka" count={data.reports.length} empty="Tidak ada laporan masalah terbuka.">
              {data.reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/m/masalah/${r.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
                    <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${r.awaiting === "HANDLER" ? "bg-red-600" : "bg-transparent"}`} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.customerName || `Laporan #${r.id}`}</p>
                      <p className="text-xs text-slate-500 truncate">{r.categoryLabel}</p>
                      <p className="text-[11px] text-slate-400">
                        #{r.id} · {r.awaiting === "HANDLER" ? "menunggu tanggapan" : "menunggu agen"} · {relativeTime(r.lastMessageAt)}
                      </p>
                    </div>
                    <ReportStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </Section>

            {/* Transaksi terakhir */}
            <Section title="Transaksi terakhir" count={data.recent.length} empty="Agen belum pernah bertransaksi.">
              {data.recent.map((r) => {
                const v = serviceVisual(r.serviceType);
                return (
                  <li key={r.multiPaymentCode}>
                    <Link href={`/m/riwayat/${encodeURIComponent(r.multiPaymentCode)}`} className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
                      <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${v.tone}`}>
                        <span className="material-symbols-outlined text-[20px]">{v.icon}</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.customerName || r.customerId || r.multiPaymentCode}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {serviceLabel(r.serviceType)}
                          {r.totalItems > 1 ? ` +${r.totalItems - 1}` : ""} · {relativeTime(r.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatRp(r.grandTotal)}</p>
                        <span className="mt-1 inline-block"><TxStatusBadge status={r.status} /></span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${warn ? "bg-amber-50 dark:bg-amber-900/20" : "bg-white dark:bg-slate-900"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</p>
      <p className="text-[11px] text-slate-500 truncate">{sub}</p>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
        {count > 0 ? ` (${count})` : ""}
      </h2>
      {count === 0 ? (
        <p className="rounded-2xl bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">{children}</ul>
      )}
    </section>
  );
}
