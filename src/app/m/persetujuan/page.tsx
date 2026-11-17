"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { ReportRow } from "@/ui/mobile/ReportBits";
import { formatPeriode, formatRp } from "@/lib/mobile/products";
import { serviceLabel } from "@/lib/mobile/receipt-share";
import {
  type ApprovalInbox,
  type CashierClosing,
  type ReviewQueueItem,
  type VoidRequest,
  actionableCount,
  fetchApprovalInbox,
  isReopenPending,
} from "@/lib/mobile/approvals";

type Tab = "masalah" | "review" | "void" | "setoran";
type Selected = { kind: "review"; item: ReviewQueueItem } | { kind: "void"; item: VoidRequest } | { kind: "setoran"; item: CashierClosing };

const fmtWaktu = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

/**
 * Inbox persetujuan versi mobile (admin & supervisor). Semua aksi memanggil API yang sama
 * dengan halaman desktop (/review-transaksi, /pembatalan, /verifikasi-kasir); aturan
 * maker-checker ditegakkan server. Pengajuan milik sendiri hanya ditampilkan, tanpa tombol.
 */
export default function MobilePersetujuanPage() {
  const { data: session } = useSession();
  const me = (session?.user as { username?: string } | undefined)?.username || "";
  const [tab, setTab] = useState<Tab>("masalah");
  const [inbox, setInbox] = useState<ApprovalInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchApprovalInbox();
    setInbox(data);
    setLoading(false);
    window.dispatchEvent(new Event("m-approval-refresh"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = inbox && me ? actionableCount(inbox, me) : { review: 0, voids: 0, setoran: 0, masalah: 0, total: 0 };

  function done(text: string) {
    setSelected(null);
    setFlash({ ok: true, text });
    load();
  }

  return (
    <div>
      <MobileHeader
        title="Persetujuan"
        subtitle={loading && !inbox ? "Memuat…" : counts.total > 0 ? `${counts.total} menunggu tindakan Anda` : "Tidak ada yang menunggu"}
        right={
          <button type="button" onClick={load} className="h-10 w-10 rounded-full flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-800" aria-label="Muat ulang">
            <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        }
      />

      <div className="px-4 pt-3">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1">
          {([
            ["masalah", "Masalah", counts.masalah],
            ["review", "Review", counts.review],
            ["void", "Batal", counts.voids],
            ["setoran", "Setoran", counts.setoran],
          ] as Array<[Tab, string, number]>).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1 ${tab === key ? "bg-white dark:bg-slate-900 shadow text-primary" : "text-slate-600 dark:text-slate-300"}`}
            >
              {label}
              {n > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3 pb-8">
        {flash && (
          <div className={`rounded-xl p-3 text-sm flex gap-2 ${flash.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-red-50 text-red-700"}`}>
            <span className="material-symbols-outlined text-lg">{flash.ok ? "check_circle" : "error"}</span>
            <span className="flex-1">{flash.text}</span>
            <button type="button" onClick={() => setFlash(null)} aria-label="Tutup" className="material-symbols-outlined text-lg">close</button>
          </div>
        )}
        {inbox && inbox.errors.length > 0 && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-3 text-xs">
            Sebagian data gagal dimuat: {inbox.errors.join("; ")}
          </div>
        )}

        {tab === "masalah" && (
          <>
            <List empty="Tidak ada laporan masalah terbuka" loading={loading && !inbox}>
              {inbox?.reports.map((r) => (
                <ReportRow key={r.id} r={r} showReporter highlight={r.awaiting === "HANDLER" && r.reportedBy !== me} />
              ))}
            </List>
            <Link href="/m/masalah" className="block text-center text-sm text-primary font-semibold py-1">Lihat semua laporan (termasuk selesai)</Link>
          </>
        )}

        {tab === "review" && (
          <List empty="Tidak ada transaksi yang perlu ditinjau" loading={loading && !inbox}>
            {inbox?.reviews.map((r) => (
              <Card key={r.transactionCode} onClick={() => setSelected({ kind: "review", item: r })}
                title={r.customerName || r.customerId}
                subtitle={`${serviceLabel(r.serviceType)} · ${r.customerId} · ${r.loketName || r.loketCode || "-"}`}
                amount={r.heldAmount || r.totalAmount}
                tag={r.pendingRequest ? (r.pendingRequest.requestedBy === me ? ["Pengajuan Anda", "slate"] : ["Refund perlu disetujui", "red"]) : ["Perlu keputusan", "amber"]}
                meta={`Masuk ${fmtWaktu(r.createdAt)} · advice ${r.adviceAttempts}x`}
              />
            ))}
          </List>
        )}

        {tab === "void" && (
          <List empty="Tidak ada pengajuan pembatalan" loading={loading && !inbox}>
            {inbox?.voids.map((v) => (
              <Card key={v.id} onClick={() => setSelected({ kind: "void", item: v })}
                title={v.customerName || v.customerId}
                subtitle={`${v.provider} · ${v.customerId} · ${v.loketCode || "-"}`}
                amount={v.refundAmount}
                tag={v.requestedBy === me ? ["Pengajuan Anda", "slate"] : ["Perlu persetujuan", "red"]}
                meta={`Diajukan ${v.requestedBy} · ${fmtWaktu(v.requestedAt)}${v.warnings.length ? ` · ${v.warnings.length} peringatan` : ""}`}
              />
            ))}
          </List>
        )}

        {tab === "setoran" && (
          <>
            <p className="text-xs text-slate-500">Menampilkan setoran hari ini & kemarin. Tanggal lain lewat menu Verifikasi Kasir versi desktop.</p>
            <List empty="Tidak ada setoran yang menunggu verifikasi" loading={loading && !inbox}>
              {inbox?.closings.map((c) => (
                <Card key={c.id} onClick={() => setSelected({ kind: "setoran", item: c })}
                  title={c.username}
                  subtitle={`${c.loketName || c.loketCode} · ${new Date(c.businessDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                  amount={c.depositTotal}
                  tag={c.username === me ? ["Setoran Anda", "slate"] : isReopenPending(c) ? ["Minta buka ulang", "amber"] : ["Perlu verifikasi", "red"]}
                  meta={c.discrepancyAmount !== 0 ? `Selisih ${formatRp(c.discrepancyAmount)}` : `Disetor ${fmtWaktu(c.submittedAt)}`}
                />
              ))}
            </List>
          </>
        )}
      </div>

      {selected?.kind === "review" && <ReviewSheet item={selected.item} me={me} onClose={() => setSelected(null)} onDone={done} />}
      {selected?.kind === "void" && <VoidSheet item={selected.item} me={me} onClose={() => setSelected(null)} onDone={done} />}
      {selected?.kind === "setoran" && <ClosingSheet item={selected.item} me={me} onClose={() => setSelected(null)} onDone={done} />}
    </div>
  );
}

// ─── Lembar Review transaksi ─────────────────────────────────────────────────

function ReviewSheet({ item, me, onClose, onDone }: { item: ReviewQueueItem; me: string; onClose: () => void; onDone: (t: string) => void }) {
  const req = item.pendingRequest;
  const [decision, setDecision] = useState<"SUCCESS" | "FAILED" | null>(null);
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [confirm, setConfirm] = useState<null | "decide" | "approve" | "reject">(null);
  const held = item.heldAmount || item.totalAmount;

  async function call(url: string, method: string, body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(String(j.error || `Gagal (HTTP ${res.status})`));
      return { ok: res.ok, j };
    } catch {
      setError("Koneksi terputus");
      return { ok: false, j: {} };
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function runAdvice() {
    setInfo("");
    const r = item.provider === "PDAM"
      ? await call("/api/pembayaran/pdam/advice", "POST", { idpel: item.customerId, transactionCode: item.transactionCode })
      : await call("/api/pembayaran/lunasin/advice", "POST", { transactionCode: item.transactionCode, idpel: item.customerId, kodeProduk: item.productCode, idTrx: item.idTrx });
    if (r.ok) onDone(String(r.j.message || "Advice dijalankan — status diperbarui"));
    else setInfo("Provider belum memberi kepastian. Putuskan berdasarkan bukti dari provider.");
  }

  async function decide() {
    // rbac-check: admin, supervisor
    const r = await call("/api/transaksi/review", "POST", { transactionCode: item.transactionCode, decision, evidence: evidence.trim(), note: note.trim() || undefined });
    if (r.ok) onDone(String(r.j.message || "Keputusan tersimpan"));
  }

  async function review(action: "approve" | "reject") {
    // rbac-check: admin, supervisor
    const r = await call("/api/transaksi/review", "PATCH", { id: req!.id, action, note: action === "reject" ? rejectNote.trim() : undefined });
    if (r.ok) onDone(String(r.j.message || (action === "approve" ? "Refund disetujui" : "Pengajuan ditolak")));
  }

  return (
    <Sheet title="Review transaksi" onClose={onClose}>
      <Rows rows={[
        ["Pelanggan", `${item.customerName || "-"} · ${item.customerId}`],
        ["Layanan", serviceLabel(item.serviceType)],
        ["Periode", item.periods.length ? item.periods.map(formatPeriode).join(", ") : "-"],
        ["Loket / petugas", `${item.loketName || item.loketCode || "-"} · ${item.username || "-"}`],
        ["Saldo ditahan", formatRp(held)],
        ["No. Trx", item.transactionCode],
        ["Advice", `${item.adviceAttempts}x`],
        ["Kesalahan terakhir", item.lastError || "-"],
      ]} />

      {req ? (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm space-y-1">
          <p className="font-semibold">Pengajuan GAGAL (refund {formatRp(held)})</p>
          <p>Bukti: {req.evidence}</p>
          {req.note && <p>Catatan: {req.note}</p>}
          <p className="text-xs text-slate-500">Oleh {req.requestedBy} · {fmtWaktu(req.requestedAt)}</p>
        </div>
      ) : null}

      {req && req.requestedBy === me && <p className="text-sm text-slate-500">Pengajuan Anda — harus disetujui oleh user lain.</p>}

      {req && req.requestedBy !== me && (
        <div className="space-y-2">
          <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Catatan (wajib bila menolak)" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !rejectNote.trim()} onClick={() => setConfirm("reject")} className="h-12 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold disabled:opacity-40">Tolak</button>
            <button type="button" disabled={busy} onClick={() => setConfirm("approve")} className="h-12 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40">Setujui refund</button>
          </div>
        </div>
      )}

      {!req && (
        <div className="space-y-3">
          <button type="button" disabled={busy} onClick={runAdvice} className="w-full h-11 rounded-xl border border-primary/40 text-primary font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40">
            <span className="material-symbols-outlined text-xl">sync</span> Cek ulang ke provider
          </button>
          {info && <p className="text-xs text-amber-700 dark:text-amber-400">{info}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Choice active={decision === "SUCCESS"} onClick={() => setDecision("SUCCESS")} tone="emerald" label="Nyatakan LUNAS" hint="Langsung berlaku" />
            <Choice active={decision === "FAILED"} onClick={() => setDecision("FAILED")} tone="red" label="Ajukan GAGAL" hint="Refund, perlu user lain" />
          </div>
          {decision && (
            <>
              <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Bukti dari provider (min. 5 karakter), mis. no. referensi" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3" />
              <button type="button" disabled={busy || evidence.trim().length < 5} onClick={() => setConfirm("decide")} className="w-full h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-40">Simpan keputusan</button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {confirm && (
        <Confirm
          busy={busy}
          onCancel={() => setConfirm(null)}
          onOk={() => (confirm === "decide" ? decide() : review(confirm))}
          okLabel={confirm === "reject" ? "Ya, tolak" : "Ya, lanjutkan"}
          danger={confirm !== "reject" && (confirm === "approve" || decision === "FAILED")}
          text={
            confirm === "decide"
              ? decision === "SUCCESS"
                ? `Nyatakan transaksi ${item.customerId} LUNAS? Keputusan langsung berlaku: hold ${formatRp(held)} dipakai sebagai pembayaran.`
                : `Ajukan GAGAL untuk ${item.customerId}? Refund ${formatRp(held)} baru terjadi setelah disetujui user lain.`
              : confirm === "approve"
                ? `Setujui refund ${formatRp(held)} ke loket ${item.loketName || item.loketCode}? Transaksi menjadi GAGAL dan saldo dikembalikan.`
                : "Tolak pengajuan refund ini? Transaksi tetap ditinjau."
          }
        />
      )}
    </Sheet>
  );
}

// ─── Lembar Pembatalan ──────────────────────────────────────────────────────

function VoidSheet({ item, me, onClose, onDone }: { item: VoidRequest; me: string; onClose: () => void; onDone: (t: string) => void }) {
  const own = item.requestedBy === me;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      // rbac-check: admin, supervisor
      const res = await fetch("/api/transaksi/pembatalan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action, note: note.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(String(j.error || `Gagal (HTTP ${res.status})`));
      else onDone(String(j.message || (action === "approve" ? "Pembatalan disetujui" : "Pengajuan ditolak")));
    } catch {
      setError("Koneksi terputus");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Sheet title="Pembatalan transaksi" onClose={onClose}>
      <Rows rows={[
        ["Pelanggan", `${item.customerName || "-"} · ${item.customerId}`],
        ["Provider", item.provider],
        ["No. Trx", item.transactionCode],
        ["Loket", item.loketCode || "-"],
        ["Total transaksi", formatRp(item.totalAmount)],
        ["Dikembalikan ke loket", `${formatRp(item.refundAmount)} (${item.refundBasis})`],
        ["Ref. provider", item.providerReference || "-"],
        ["Diajukan", `${item.requestedBy} · ${fmtWaktu(item.requestedAt)}`],
      ]} />
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm">
        <p className="text-xs text-slate-500">Alasan</p>
        <p>{item.reason}</p>
      </div>
      {item.warnings.length > 0 && (
        <ul className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          {item.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}
      {own ? (
        <p className="text-sm text-slate-500">Pengajuan Anda — harus disetujui oleh user lain.</p>
      ) : (
        <div className="space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (wajib bila menolak)" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => setConfirm("reject")} className="h-12 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold disabled:opacity-40">Tolak</button>
            <button type="button" disabled={busy} onClick={() => setConfirm("approve")} className="h-12 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40">Setujui</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {confirm && (
        <Confirm
          busy={busy}
          onCancel={() => setConfirm(null)}
          onOk={() => act(confirm)}
          okLabel={confirm === "approve" ? "Ya, batalkan transaksi" : "Ya, tolak"}
          danger={confirm === "approve"}
          text={
            confirm === "approve"
              ? `Batalkan transaksi ${item.transactionCode}? ${formatRp(item.refundAmount)} dikembalikan ke loket, jurnal dibalik, dan komisi dibatalkan. Tidak bisa diurungkan.`
              : "Tolak pengajuan pembatalan ini?"
          }
        />
      )}
    </Sheet>
  );
}

// ─── Lembar Setoran kasir ───────────────────────────────────────────────────

function ClosingSheet({ item, me, onClose, onDone }: { item: CashierClosing; me: string; onClose: () => void; onDone: (t: string) => void }) {
  const own = item.username === me;
  const reopen = isReopenPending(item);
  const [received, setReceived] = useState(String(item.depositTotal));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<null | "VERIFIED" | "REJECTED" | "reopen">(null);
  const receivedNum = Number(received.replace(/\D/g, "")) || 0;

  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setError("");
    try {
      // rbac-check: admin, supervisor
      const res = await fetch("/api/verifikasi-kasir", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(String(j.error || `Gagal (HTTP ${res.status})`));
      else onDone(okText);
    } catch {
      setError("Koneksi terputus");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Sheet title="Setoran kasir" onClose={onClose}>
      <Rows rows={[
        ["Kasir / loket", `${item.username} · ${item.loketName || item.loketCode}`],
        ["Tanggal", new Date(item.businessDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })],
        ["Uang menurut sistem", formatRp(item.systemCashTotal)],
        ["Uang dihitung kasir", formatRp(item.countedCashTotal)],
        ["Kas ditahan", formatRp(item.retainedCash)],
        ["Disetor", formatRp(item.depositTotal)],
        ["Selisih", formatRp(item.discrepancyAmount)],
        ["Bukti setor", item.proofReference || "-"],
        ["Disetor pada", fmtWaktu(item.submittedAt)],
      ]} />
      {(item.cashierNote || item.discrepancyNote) && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm space-y-1">
          {item.cashierNote && <p>Catatan kasir: {item.cashierNote}</p>}
          {item.discrepancyNote && <p>Alasan selisih: {item.discrepancyNote}</p>}
        </div>
      )}
      {reopen && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="font-semibold">Permintaan buka ulang</p>
          <p>{item.reopenRequestNote || "-"}</p>
          <p className="text-xs text-slate-500">Oleh {item.reopenRequestedBy} · {fmtWaktu(item.reopenRequestedAt)}</p>
        </div>
      )}

      {own ? (
        <p className="text-sm text-slate-500">Ini setoran Anda sendiri — verifikasi dilakukan user lain.</p>
      ) : (
        <div className="space-y-2">
          {item.status === "SUBMITTED" && (
            <label className="block">
              <span className="text-sm font-medium">Uang diterima</span>
              <input inputMode="numeric" value={receivedNum ? receivedNum.toLocaleString("id-ID") : ""} onChange={(e) => setReceived(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-lg" />
              {receivedNum !== item.depositTotal && <span className="text-xs text-amber-700">Beda {formatRp(receivedNum - item.depositTotal)} dari jumlah disetor</span>}
            </label>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={item.status === "SUBMITTED" ? "Catatan (wajib bila menolak)" : "Catatan (opsional)"} className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3" />
          {item.status === "SUBMITTED" && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || !note.trim()} onClick={() => setConfirm("REJECTED")} className="h-12 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold disabled:opacity-40">Tolak</button>
              <button type="button" disabled={busy || receivedNum <= 0} onClick={() => setConfirm("VERIFIED")} className="h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-40">Terima</button>
            </div>
          )}
          {reopen && (
            <button type="button" disabled={busy} onClick={() => setConfirm("reopen")} className="w-full h-12 rounded-xl border border-amber-400 text-amber-700 dark:text-amber-300 font-semibold disabled:opacity-40">
              Setujui buka ulang
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {confirm && (
        <Confirm
          busy={busy}
          onCancel={() => setConfirm(null)}
          okLabel="Ya, lanjutkan"
          onOk={() =>
            confirm === "reopen"
              ? patch({ action: "approve_reopen", closingId: item.id, note: note.trim() || undefined }, "Tutup kasir dibuka ulang")
              : patch(
                  { closingId: item.id, status: confirm, verifierNote: note.trim() || undefined, receivedAmount: confirm === "VERIFIED" ? receivedNum : undefined },
                  confirm === "VERIFIED" ? "Setoran diterima" : "Setoran ditolak — kasir diminta memperbaiki"
                )
          }
          text={
            confirm === "VERIFIED"
              ? `Terima setoran ${item.username} sebesar ${formatRp(receivedNum)}?`
              : confirm === "REJECTED"
                ? `Tolak setoran ${item.username}? Kasir harus memperbaiki dan menyetor ulang.`
                : `Buka ulang tutup kasir ${item.username}? Status kembali ke draf (hanya bisa sekali).`
          }
        />
      )}
    </Sheet>
  );
}

// ─── Komponen kecil ─────────────────────────────────────────────────────────

function List({ children, empty, loading }: { children: React.ReactNode; empty: string; loading: boolean }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (loading) return <p className="text-center text-slate-500 py-10">Memuat…</p>;
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <span className="material-symbols-outlined text-5xl text-emerald-500">task_alt</span>
        <p className="mt-2 text-sm">{empty}</p>
      </div>
    );
  }
  return <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">{items}</ul>;
}

const TAG_TONE: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function Card({ title, subtitle, amount, tag, meta, onClick }: { title: string; subtitle: string; amount: number; tag: [string, string]; meta: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50 dark:active:bg-slate-800">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          <p className="text-[11px] text-slate-400 truncate">{meta}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatRp(amount)}</p>
          <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${TAG_TONE[tag[1]]}`}>{tag[0]}</span>
        </div>
      </button>
    </li>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3" role="dialog" aria-label={title}>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold">{title}</p>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center active:bg-slate-100" aria-label="Tutup">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Choice({ active, onClick, label, hint, tone }: { active: boolean; onClick: () => void; label: string; hint: string; tone: "emerald" | "red" }) {
  const on = tone === "emerald" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700" : "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700";
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border-2 p-3 text-left ${active ? on : "border-slate-200 dark:border-slate-700"}`}>
      <p className="text-sm font-bold">{label}</p>
      <p className="text-[11px] text-slate-500">{hint}</p>
    </button>
  );
}

function Confirm({ text, okLabel, onOk, onCancel, busy, danger }: { text: string; okLabel: string; onOk: () => void; onCancel: () => void; busy: boolean; danger?: boolean }) {
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5">
        <p className="text-base">{text}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">Batal</button>
          <button type="button" disabled={busy} onClick={onOk} className={`h-11 rounded-xl text-white font-bold disabled:opacity-50 ${danger ? "bg-red-600" : "bg-primary"}`}>
            {busy ? "Memproses…" : okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
