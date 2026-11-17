"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { formatRp } from "@/lib/mobile/products";
import { serviceLabel } from "@/lib/mobile/receipt-share";
import { ReportStatusBadge } from "@/ui/mobile/ReportBits";

interface Message {
  id: number;
  author: string;
  authorRole: string;
  kind: string;
  body: string;
  createdAt: string;
}
interface Report {
  id: number;
  multiPaymentCode: string;
  transactionCode: string | null;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  serviceType: string | null;
  totalAmount: number;
  categoryLabel: string;
  status: "BARU" | "DIPROSES" | "SELESAI";
  reportedBy: string;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
}

const fmt = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Percakapan satu laporan masalah (pelapor ↔ admin/supervisor). */
export default function MobileMasalahDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { data: session } = useSession();
  const me = (session?.user as { username?: string } | undefined)?.username || "";

  const [report, setReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canHandle, setCanHandle] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const apply = (j: { report: Report; messages: Message[]; canHandle: boolean }) => {
    setReport(j.report);
    setMessages(j.messages);
    setCanHandle(j.canHandle);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/laporan-transaksi?id=${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) return setError(j.error || "Laporan tidak ditemukan");
      apply(j);
      window.dispatchEvent(new Event("m-approval-refresh"));
      window.dispatchEvent(new Event("m-report-refresh"));
    } catch {
      setError("Gagal menghubungi server");
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(t);
  }, [id, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
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
      window.dispatchEvent(new Event("m-approval-refresh"));
      return true;
    } catch {
      setError("Koneksi terputus");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    if (await act({ action: "reply", message: text })) setText("");
  }

  if (!report) {
    return (
      <div>
        <MobileHeader title="Laporan masalah" backHref="/m/masalah" />
        <p className="p-6 text-center text-slate-500">{error || "Memuat…"}</p>
      </div>
    );
  }

  const closed = report.status === "SELESAI";
  return (
    <div className="flex flex-col min-h-[calc(100dvh-4.5rem)]">
      <MobileHeader title={`Laporan #${report.id}`} subtitle={report.categoryLabel} backHref="/m/masalah" right={<ReportStatusBadge status={report.status} />} />

      <div className="p-4 space-y-3">
        <Link
          href={`/m/riwayat/${encodeURIComponent(report.multiPaymentCode)}`}
          className="block rounded-2xl bg-white dark:bg-slate-900 p-4 active:bg-slate-50 dark:active:bg-slate-800"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{report.customerName || report.customerId || report.multiPaymentCode}</p>
              <p className="text-xs text-slate-500 truncate">
                {serviceLabel(report.serviceType)} · {report.customerId} · {report.loketCode}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{report.multiPaymentCode}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold">{formatRp(report.totalAmount)}</p>
              <p className="text-xs text-primary font-semibold mt-1">Buka transaksi ›</p>
            </div>
          </div>
        </Link>
        <p className="text-xs text-slate-500">
          Dilaporkan {report.reportedBy} · {fmt(report.createdAt)}
          {report.assignedTo ? ` · ditangani ${report.assignedTo}` : " · belum ada penanggung jawab"}
        </p>
        {canHandle && (
          <p className="text-[11px] text-slate-500">
            Tindakan atas transaksi (cek ke provider, review, pembatalan) tetap lewat menunya masing-masing — buka transaksi atau tab Persetujuan.
          </p>
        )}
      </div>

      <div className="flex-1 px-4 space-y-2 pb-4">
        {messages.map((m) =>
          m.kind === "EVENT" ? (
            <p key={m.id} className="text-center text-[11px] text-slate-500 py-1">
              {m.body} · {fmt(m.createdAt)}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.author === me ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.author === me ? "bg-primary text-white rounded-br-md" : "bg-white dark:bg-slate-900 rounded-bl-md"
                }`}
              >
                {m.author !== me && (
                  <p className="text-[11px] font-semibold opacity-70">
                    {m.author} · {m.authorRole === "kasir" ? "agen" : m.authorRole}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-0.5 ${m.author === me ? "text-white/70" : "text-slate-400"}`}>{fmt(m.createdAt)}</p>
              </div>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] bg-background-light/95 dark:bg-background-dark/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 p-3 space-y-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {canHandle && !closed && (
          <div className="flex gap-2">
            {report.assignedTo !== me && (
              <button type="button" disabled={busy} onClick={() => act({ action: "take" })} className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold">
                Ambil laporan
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setResolving((v) => !v)} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
              Selesaikan
            </button>
          </div>
        )}
        {resolving && !closed && (
          <div className="flex gap-2">
            <input
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Kesimpulan, mis. token sudah dikirim ulang"
              className="flex-1 min-w-0 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy || resolution.trim().length < 5}
              onClick={async () => {
                if (await act({ action: "resolve", resolution })) {
                  setResolving(false);
                  setResolution("");
                }
              }}
              className="h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
            >
              Simpan
            </button>
          </div>
        )}
        {closed && report.resolution && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Selesai: {report.resolution}</p>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder={closed ? "Balas untuk membuka kembali laporan…" : "Tulis pesan…"}
            className="flex-1 min-w-0 min-h-11 max-h-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm"
          />
          <button type="button" disabled={busy || !text.trim()} onClick={send} className="h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40" aria-label="Kirim">
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
