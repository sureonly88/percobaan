"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumb } from "@/ui";

/**
 * Laporan Masalah (desktop) — laporan transaksi dari agen/kasir untuk admin & supervisor.
 * Memakai API /api/laporan-transaksi yang sama dengan versi mobile (/m/masalah).
 * Laporan hanya percakapan; tindakan atas transaksi tetap lewat menunya masing-masing.
 */

type StatusFilter = "OPEN" | "BARU" | "DIPROSES" | "SELESAI" | "ALL";

interface Report {
  id: number;
  multiPaymentCode: string;
  transactionCode: string | null;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  serviceType: string | null;
  totalAmount: number;
  category: string;
  categoryLabel: string;
  status: "BARU" | "DIPROSES" | "SELESAI";
  awaiting: "HANDLER" | "REPORTER" | "NONE";
  reportedBy: string;
  assignedTo: string | null;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
}

interface Message {
  id: number;
  author: string;
  authorRole: string;
  kind: string;
  body: string;
  createdAt: string;
}

interface TxItem {
  itemCode: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  periodLabel: string | null;
  total: number;
  status: string;
  transactionCode: string | null;
  providerErrorMessage: string | null;
  adviceAttempts: number;
}

interface TxDetail {
  multiPayment: { multiPaymentCode: string; status: string; username: string | null; loketName: string | null; grandTotal: number; createdAt: string; paidAt: string | null };
  items: TxItem[];
}

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "OPEN", label: "Terbuka" },
  { key: "BARU", label: "Baru" },
  { key: "DIPROSES", label: "Diproses" },
  { key: "SELESAI", label: "Selesai" },
  { key: "ALL", label: "Semua" },
];

const STATUS_STYLE: Record<string, string> = {
  BARU: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  DIPROSES: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  SELESAI: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const TX_STATUS: Record<string, string> = {
  SUCCESS: "Lunas",
  PARTIAL_SUCCESS: "Sebagian",
  PENDING: "Diproses",
  PENDING_PROVIDER: "Diproses",
  PENDING_ADVICE: "Menunggu advice",
  PENDING_REVIEW: "Ditinjau",
  FAILED: "Gagal",
  VOID: "Dibatalkan",
};

/** Gaya bersama kotak filter: tinggi, border, dan sudut yang sama. */
const CONTROL =
  "h-10 rounded-xl border border-slate-200 bg-white text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30";

/** <select> tanpa gaya bawaan browser (Safari/macOS mengabaikan padding & radius) + ikon panah. */
function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} min-w-[11rem] cursor-pointer appearance-none pl-3 pr-9 font-medium ${value ? "border-primary/50 text-primary" : "text-slate-700 dark:text-slate-200"}`}
      >
        {children}
      </select>
      <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-lg text-slate-400">expand_more</span>
    </div>
  );
}

const rp = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

function ageLabel(iso: string): { text: string; late: boolean } {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return { text: `${mins} mnt`, late: false };
  const h = Math.floor(mins / 60);
  if (h < 24) return { text: `${h} jam`, late: h >= 2 };
  return { text: `${Math.floor(h / 24)} hari`, late: true };
}

export default function LaporanMasalahPage() {
  const { data: session } = useSession();
  const me = (session?.user as { username?: string } | undefined)?.username || "";

  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loket, setLoket] = useState("");
  const [assignee, setAssignee] = useState(""); // "", "me", "none"
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = status === "ALL" ? "" : `?status=${status}`;
      // rbac-check: admin, supervisor
      const res = await fetch(`/api/laporan-transaksi${q}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setError(j.error || "Gagal memuat laporan");
      else setReports(j.reports || []);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // Tautan langsung dari notifikasi: /laporan-masalah?id=123
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (id) setSelectedId(id);
  }, []);

  const categories = useMemo(() => Array.from(new Map(reports.map((r) => [r.category, r.categoryLabel])).entries()), [reports]);
  const lokets = useMemo(() => Array.from(new Set(reports.map((r) => r.loketCode).filter(Boolean))) as string[], [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (category && r.category !== category) return false;
      if (loket && r.loketCode !== loket) return false;
      if (assignee === "me" && r.assignedTo !== me) return false;
      if (assignee === "none" && r.assignedTo) return false;
      if (onlyWaiting && !(r.status !== "SELESAI" && r.awaiting === "HANDLER")) return false;
      if (!q) return true;
      return [r.customerName, r.customerId, r.multiPaymentCode, r.transactionCode, r.reportedBy, String(r.id)].some((v) =>
        (v || "").toLowerCase().includes(q)
      );
    });
  }, [reports, search, category, loket, assignee, onlyWaiting, me]);

  const waitingCount = reports.filter((r) => r.status !== "SELESAI" && r.awaiting === "HANDLER").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Laporan Masalah" }]} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Laporan Masalah</h1>
          <p className="mt-1 text-sm text-slate-500">
            Laporan transaksi dari agen & kasir. Balas, ambil sebagai penanggung jawab, lalu selesaikan dengan kesimpulan. Tindakan atas
            transaksinya (advice, review, pembatalan) tetap lewat menunya masing-masing.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <span className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}>refresh</span> Muat ulang
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              status === t.key
                ? "bg-primary text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
        {waitingCount > 0 && (
          <span className="ml-auto rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {waitingCount} menunggu tanggapan
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pelanggan, transaksi, pelapor"
            className={`${CONTROL} w-full pl-10 pr-3 placeholder:text-slate-400`}
          />
        </div>
        <FilterSelect value={category} onChange={setCategory} label="Kategori">
          <option value="">Semua kategori</option>
          {categories.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={loket} onChange={setLoket} label="Loket">
          <option value="">Semua loket</option>
          {lokets.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={assignee} onChange={setAssignee} label="Penanggung jawab">
          <option value="">Semua penanggung jawab</option>
          <option value="me">Ditangani saya</option>
          <option value="none">Belum ada penanggung jawab</option>
        </FilterSelect>
        <label className={`${CONTROL} flex cursor-pointer items-center gap-2 px-3 font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700`}>
          <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-primary" />
          Menunggu tanggapan
        </label>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Memuat...</p>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <span className="material-symbols-outlined text-4xl text-emerald-500">task_alt</span>
              <p className="mt-2 text-sm">Tidak ada laporan pada filter ini.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Pelanggan / transaksi</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Pelapor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Terakhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r) => {
                  const waiting = r.status !== "SELESAI" && r.awaiting === "HANDLER";
                  const age = ageLabel(r.lastMessageAt);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 ${selectedId === r.id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          {waiting && <span className="h-2 w-2 rounded-full bg-red-600" title="Menunggu tanggapan" />}#{r.id}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className={waiting ? "font-bold" : "font-medium"}>{r.customerName || r.customerId || "-"}</p>
                        <p className="text-xs text-slate-500">
                          {r.customerId} · {rp(r.totalAmount)}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">{r.multiPaymentCode}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-xs">{r.categoryLabel}</td>
                      <td className="px-4 py-3 align-top text-xs">
                        {r.reportedBy}
                        <span className="block text-slate-400">{r.loketCode || "-"}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">{r.assignedTo ? `oleh ${r.assignedTo}` : "belum diambil"}</span>
                      </td>
                      <td className="px-4 py-3 text-right align-top text-xs">
                        <span className={age.late && waiting ? "font-bold text-red-600" : "text-slate-500"}>{age.text} lalu</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="xl:sticky xl:top-36 xl:self-start">
          {selectedId ? (
            <ReportPanel key={selectedId} id={selectedId} me={me} onChanged={load} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-600">
              Pilih laporan untuk melihat percakapan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel detail + percakapan ─────────────────────────────────────────────

function ReportPanel({ id, me, onChanged, onClose }: { id: number; me: string; onChanged: () => void; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const apply = (j: { report: Report; messages: Message[] }) => {
    setReport(j.report);
    setMessages(j.messages);
  };

  const load = useCallback(async () => {
    try {
      // rbac-check: admin, supervisor
      const res = await fetch(`/api/laporan-transaksi?id=${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) return setError(j.error || "Laporan tidak ditemukan");
      apply(j);
      // Ringkasan transaksi terkait (status terbaru tiap tagihan)
      const t = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(j.report.multiPaymentCode)}`, { cache: "no-store" });
      if (t.ok) setTx(await t.json());
    } catch {
      setError("Gagal menghubungi server");
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      // rbac-check: admin, supervisor
      const res = await fetch("/api/laporan-transaksi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Gagal");
        return false;
      }
      apply(j);
      onChanged();
      return true;
    } catch {
      setError("Koneksi terputus");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
        {error || "Memuat..."}
      </div>
    );
  }

  const closed = report.status === "SELESAI";
  return (
    <div className="flex max-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold">
              Laporan #{report.id}
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[report.status]}`}>{report.status}</span>
            </p>
            <p className="text-xs text-slate-500">{report.categoryLabel}</p>
            <p className="text-xs text-slate-500">
              Dilaporkan {report.reportedBy} ({report.loketCode || "-"}) · {dt(report.createdAt)}
              {report.assignedTo ? ` · ditangani ${report.assignedTo}` : " · belum ada penanggung jawab"}
            </p>
          </div>
          <button onClick={onClose} title="Tutup" className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Ringkasan transaksi */}
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/40">
          <p className="font-mono font-bold">{report.multiPaymentCode}</p>
          {tx ? (
            <>
              <p className="text-slate-500">
                Status transaksi: <b>{TX_STATUS[tx.multiPayment.status] || tx.multiPayment.status}</b> · {rp(tx.multiPayment.grandTotal)} · petugas{" "}
                {tx.multiPayment.username || "-"} · {dt(tx.multiPayment.paidAt || tx.multiPayment.createdAt)}
              </p>
              <ul className="mt-2 space-y-1">
                {tx.items.map((i) => (
                  <li key={i.itemCode} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {i.customerName || i.customerId}
                      {i.periodLabel ? ` · ${i.periodLabel}` : ""}
                      {i.transactionCode ? <span className="font-mono text-slate-400"> · {i.transactionCode}</span> : null}
                      {i.status === "FAILED" && i.providerErrorMessage ? <span className="block text-red-600">{i.providerErrorMessage}</span> : null}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {TX_STATUS[i.status] || i.status}
                      {i.adviceAttempts > 0 && i.status !== "SUCCESS" ? ` · advice ${i.adviceAttempts}x` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-slate-500">{report.customerName || report.customerId} · {rp(report.totalAmount)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <QuickLink href="/review-transaksi" icon="fact_check" label="Review" />
            <QuickLink href="/pembatalan" icon="undo" label="Pembatalan" />
            <QuickLink href={tx?.items.some((i) => i.transactionCode?.startsWith("LNS")) ? "/advice-lunasin" : "/advice-pdam"} icon="manage_search" label="Advice" />
            <QuickLink href="/riwayat" icon="history" label="Riwayat" />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) =>
          m.kind === "EVENT" ? (
            <p key={m.id} className="py-1 text-center text-[11px] text-slate-500">
              {m.body} · {dt(m.createdAt)}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.author === me ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.author === me ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-slate-100 dark:bg-slate-700"
                }`}
              >
                {m.author !== me && (
                  <p className="text-[11px] font-semibold opacity-70">
                    {m.author} · {m.authorRole === "kasir" ? "agen/kasir" : m.authorRole}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${m.author === me ? "text-white/70" : "text-slate-400"}`}>{dt(m.createdAt)}</p>
              </div>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-700">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {closed ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Selesai oleh {report.resolvedBy} ({dt(report.resolvedAt)}): {report.resolution}
          </p>
        ) : (
          <div className="flex gap-2">
            {report.assignedTo !== me && (
              <button
                disabled={busy}
                onClick={() => act({ action: "take" })}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Ambil laporan
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => setResolving((v) => !v)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Selesaikan
            </button>
          </div>
        )}
        {resolving && !closed && (
          <div className="flex gap-2">
            <input
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Kesimpulan penyelesaian (min. 5 karakter)"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              disabled={busy || resolution.trim().length < 5}
              onClick={async () => {
                if (await act({ action: "resolve", resolution })) {
                  setResolving(false);
                  setResolution("");
                }
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Simpan
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) {
                act({ action: "reply", message: text }).then((ok) => ok && setText(""));
              }
            }}
            rows={2}
            placeholder={closed ? "Balas untuk membuka kembali laporan…" : "Tulis balasan… (Ctrl+Enter untuk kirim)"}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            disabled={busy || !text.trim()}
            onClick={async () => {
              if (await act({ action: "reply", message: text })) setText("");
            }}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </Link>
  );
}
