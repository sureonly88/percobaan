"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb } from "@/ui";

type Tab = "queue" | "PENDING" | "HISTORY";

interface TransactionReview {
  id: number;
  transactionCode: string;
  provider: string;
  loketCode: string | null;
  customerId: string | null;
  customerName: string | null;
  heldAmount: number;
  decision: "SUCCESS" | "FAILED";
  evidence: string;
  note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

interface QueueItem {
  transactionCode: string;
  provider: string;
  serviceType: string | null;
  productCode: string | null;
  loketCode: string | null;
  loketName: string | null;
  username: string | null;
  customerId: string;
  customerName: string | null;
  periods: string[];
  itemCount: number;
  totalAmount: number;
  heldAmount: number;
  adviceAttempts: number;
  idTrx: string | null;
  createdAt: string;
  lastError: string | null;
  pendingRequest: TransactionReview | null;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "queue", label: "Perlu Review" },
  { key: "PENDING", label: "Menunggu Persetujuan" },
  { key: "HISTORY", label: "Riwayat" },
];

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount || 0).toLocaleString("id-ID");
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReviewTransaksiPage() {
  const { data: session } = useSession();
  const currentUser = String((session?.user as { username?: string } | undefined)?.username || "");

  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reviews, setReviews] = useState<TransactionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adviceRunning, setAdviceRunning] = useState<string | null>(null);

  const [decision, setDecision] = useState<{ item: QueueItem; decision: "SUCCESS" | "FAILED" } | null>(null);
  const [evidence, setEvidence] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [approval, setApproval] = useState<{ review: TransactionReview; action: "approve" | "reject" } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "queue") {
        const res = await fetch("/api/transaksi/review?view=queue");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat data");
        setQueue(json.data || []);
      } else if (tab === "PENDING") {
        const res = await fetch("/api/transaksi/review?view=PENDING");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat data");
        setReviews(json.data || []);
      } else {
        const [a, r] = await Promise.all([
          fetch("/api/transaksi/review?view=APPROVED").then((x) => x.json()),
          fetch("/api/transaksi/review?view=REJECTED").then((x) => x.json()),
        ]);
        const merged = [...(a.data || []), ...(r.data || [])] as TransactionReview[];
        merged.sort((x, y) => (y.reviewedAt || y.requestedAt).localeCompare(x.reviewedAt || x.requestedAt));
        setReviews(merged);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runAdvice = async (item: QueueItem) => {
    setAdviceRunning(item.transactionCode);
    setNotice("");
    try {
      const res =
        item.provider === "PDAM"
          ? await fetch("/api/pembayaran/pdam/advice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idpel: item.customerId, transactionCode: item.transactionCode }),
            })
          : await fetch("/api/pembayaran/lunasin/advice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transactionCode: item.transactionCode,
                idpel: item.customerId,
                kodeProduk: item.productCode,
                idTrx: item.idTrx,
              }),
            });
      const json = await res.json().catch(() => ({}));
      setNotice(
        res.ok
          ? `Advice ${item.transactionCode}: ${json.message || "selesai"}`
          : `Advice ${item.transactionCode}: ${json.error || "belum ada konfirmasi dari provider"}`
      );
      await fetchData();
    } catch {
      setNotice(`Advice ${item.transactionCode} gagal dihubungi`);
    } finally {
      setAdviceRunning(null);
    }
  };

  const openDecision = (item: QueueItem, d: "SUCCESS" | "FAILED") => {
    setDecision({ item, decision: d });
    setEvidence("");
    setDecisionNote("");
    setModalError("");
  };

  const submitDecision = async () => {
    if (!decision) return;
    if (evidence.trim().length < 5) {
      setModalError("Bukti dari provider wajib diisi (minimal 5 karakter)");
      return;
    }
    setModalLoading(true);
    setModalError("");
    try {
      const res = await fetch("/api/transaksi/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionCode: decision.item.transactionCode,
          decision: decision.decision,
          evidence: evidence.trim(),
          note: decisionNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Gagal menyimpan keputusan");
        return;
      }
      setNotice(`${json.message} — ${decision.item.transactionCode}`);
      setDecision(null);
      fetchData();
    } catch {
      setModalError("Gagal menyimpan keputusan");
    } finally {
      setModalLoading(false);
    }
  };

  const submitApproval = async () => {
    if (!approval) return;
    if (approval.action === "reject" && !approvalNote.trim()) {
      setModalError("Catatan penolakan wajib diisi");
      return;
    }
    setModalLoading(true);
    setModalError("");
    try {
      const res = await fetch("/api/transaksi/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: approval.review.id, action: approval.action, note: approvalNote.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Gagal memproses pengajuan");
        return;
      }
      setNotice(`${json.message} — ${approval.review.transactionCode}`);
      setApproval(null);
      fetchData();
    } catch {
      setModalError("Gagal memproses pengajuan");
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Review Transaksi" }]} />

      <header>
        <h1 className="text-2xl font-bold">Review Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Transaksi yang statusnya di provider tidak pasti setelah advice habis. Saldo loket tetap ditahan sampai
          diputuskan. Konfirmasi sukses langsung berlaku; pengembalian saldo (gagal) harus disetujui user lain.
        </p>
      </header>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
          <span className="material-symbols-outlined text-lg">info</span>
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice("")} title="Tutup">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.key
                ? "bg-primary text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : tab === "queue" ? (
        queue.length === 0 ? (
          <EmptyState text="Tidak ada transaksi yang menunggu review." />
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <div
                key={item.transactionCode}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold">{item.transactionCode}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        PENDING REVIEW
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.provider}
                        {item.productCode ? ` · ${item.productCode}` : ""} · {item.loketName || item.loketCode || "-"} ·
                        kasir {item.username || "-"}
                      </span>
                    </div>
                    <p className="text-sm">
                      <strong>{item.customerName || "-"}</strong> ({item.customerId})
                      {item.periods.length > 0 && <span className="text-slate-500"> · periode {item.periods.join(", ")}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Dibuat {formatDateTime(item.createdAt)} · {item.adviceAttempts}× advice
                      {item.lastError ? ` · ${item.lastError}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 text-left lg:text-right">
                    <p className="text-xs text-slate-500">Total transaksi</p>
                    <p className="font-bold">{formatRupiah(item.totalAmount)}</p>
                    <p className="text-xs text-slate-500">Saldo ditahan</p>
                    <p className="font-bold text-amber-600">{formatRupiah(item.heldAmount)}</p>
                  </div>
                </div>

                {item.pendingRequest ? (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                    Diajukan <strong>gagal</strong> oleh {item.pendingRequest.requestedBy} ({item.pendingRequest.evidence}) —
                    menunggu persetujuan di tab <strong>Menunggu Persetujuan</strong>.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => runAdvice(item)}
                      disabled={adviceRunning === item.transactionCode}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-700"
                    >
                      {adviceRunning === item.transactionCode ? "Mengecek..." : "Cek Ulang Advice"}
                    </button>
                    <button
                      onClick={() => openDecision(item, "SUCCESS")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Konfirmasi Sukses
                    </button>
                    <button
                      onClick={() => openDecision(item, "FAILED")}
                      className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                    >
                      Nyatakan Gagal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : reviews.length === 0 ? (
        <EmptyState text={tab === "PENDING" ? "Tidak ada pengajuan yang menunggu persetujuan." : "Belum ada riwayat review."} />
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{r.transactionCode}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.decision === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {r.decision === "SUCCESS" ? "KONFIRMASI SUKSES" : "NYATAKAN GAGAL"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {r.status} · {r.provider} · {r.loketCode || "-"}
                    </span>
                  </div>
                  <p className="text-sm">
                    <strong>{r.customerName || "-"}</strong> ({r.customerId || "-"})
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Bukti:</span> {r.evidence}
                    {r.note ? ` — ${r.note}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Diajukan {r.requestedBy} · {formatDateTime(r.requestedAt)}
                    {r.reviewedBy && r.decision === "FAILED" && ` · ${r.status === "APPROVED" ? "Disetujui" : "Ditolak"} ${r.reviewedBy} · ${formatDateTime(r.reviewedAt)}`}
                  </p>
                  {r.reviewNote && <p className="text-xs text-slate-500">Catatan: {r.reviewNote}</p>}
                </div>
                <div className="shrink-0 text-left lg:text-right">
                  <p className="text-xs text-slate-500">{r.decision === "FAILED" ? "Saldo dikembalikan" : "Saldo ditahan → terpotong"}</p>
                  <p className={`font-bold ${r.decision === "FAILED" ? "text-emerald-600" : ""}`}>{formatRupiah(r.heldAmount)}</p>
                </div>
              </div>

              {tab === "PENDING" && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {r.requestedBy === currentUser ? (
                    <p className="text-xs text-slate-500">Pengajuan Anda — harus disetujui oleh user lain.</p>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setApproval({ review: r, action: "approve" });
                          setApprovalNote("");
                          setModalError("");
                        }}
                        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                      >
                        Setujui & Kembalikan Saldo
                      </button>
                      <button
                        onClick={() => {
                          setApproval({ review: r, action: "reject" });
                          setApprovalNote("");
                          setModalError("");
                        }}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decision && (
        <ModalShell onClose={() => setDecision(null)}>
          <h3 className="mb-2 text-lg font-bold">
            {decision.decision === "SUCCESS" ? "Konfirmasi transaksi sukses?" : "Nyatakan transaksi gagal?"}
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            {decision.decision === "SUCCESS" ? (
              <>
                {decision.item.transactionCode} menjadi SUCCESS. Saldo yang ditahan (
                <strong>{formatRupiah(decision.item.heldAmount)}</strong>) menjadi potongan final, jurnal dan komisi dibuat.
                Langsung berlaku.
              </>
            ) : (
              <>
                Diajukan untuk dinyatakan gagal. Setelah disetujui user lain, saldo{" "}
                <strong>{formatRupiah(decision.item.heldAmount)}</strong> dikembalikan ke loket{" "}
                {decision.item.loketCode}. Pastikan provider benar-benar tidak memproses pembayaran ini.
              </>
            )}
          </p>
          <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Bukti dari provider *</label>
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="No. referensi / hasil cek laporan provider"
            className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Catatan (opsional)</label>
          <textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            rows={2}
            className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {modalError && <p className="mb-2 text-xs text-red-500">{modalError}</p>}
          <ModalActions
            loading={modalLoading}
            onCancel={() => setDecision(null)}
            onConfirm={submitDecision}
            confirmLabel={decision.decision === "SUCCESS" ? "Konfirmasi Sukses" : "Ajukan Gagal"}
            danger={decision.decision === "FAILED"}
          />
        </ModalShell>
      )}

      {approval && (
        <ModalShell onClose={() => setApproval(null)}>
          <h3 className="mb-2 text-lg font-bold">
            {approval.action === "approve" ? "Setujui pengembalian saldo?" : "Tolak pengajuan?"}
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            {approval.action === "approve" ? (
              <>
                Transaksi {approval.review.transactionCode} menjadi FAILED dan saldo yang ditahan dikembalikan ke loket{" "}
                {approval.review.loketCode}. Bukti pengaju: <em>{approval.review.evidence}</em>.
              </>
            ) : (
              <>Transaksi tetap menunggu review dan saldo tetap ditahan.</>
            )}
          </p>
          <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
            Catatan {approval.action === "reject" ? "*" : "(opsional)"}
          </label>
          <textarea
            value={approvalNote}
            onChange={(e) => setApprovalNote(e.target.value)}
            rows={3}
            className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {modalError && <p className="mb-2 text-xs text-red-500">{modalError}</p>}
          <ModalActions
            loading={modalLoading}
            onCancel={() => setApproval(null)}
            onConfirm={submitApproval}
            confirmLabel={approval.action === "approve" ? "Setujui" : "Tolak"}
            danger={approval.action === "approve"}
          />
        </ModalShell>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
      {text}
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        {children}
      </div>
    </div>
  );
}

function ModalActions(props: {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="mt-2 flex gap-3">
      <button
        onClick={props.onCancel}
        className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
      >
        Batal
      </button>
      <button
        onClick={props.onConfirm}
        disabled={props.loading}
        className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 ${
          props.danger ? "bg-red-500 hover:bg-red-600" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {props.loading ? "Memproses..." : props.confirmLabel}
      </button>
    </div>
  );
}
