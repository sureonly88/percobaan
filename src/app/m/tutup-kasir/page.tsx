"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { formatRp } from "@/lib/mobile/products";
import { normalizeRole } from "@/lib/rbac";

type ClosingStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "REJECTED";

interface ClosingSummary {
  successfulRequestCount: number;
  successfulItemCount: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
  systemCashTotal: number;
}

interface ClosingDetail {
  id: number;
  status: ClosingStatus;
  openingCash: number;
  otherCashAmount: number;
  retainedCash: number;
  cashierNote: string | null;
  discrepancyNote: string | null;
  discrepancyReasonCode?: string | null;
  proofReference?: string | null;
  proofNote?: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifierNote: string | null;
  receivedAmount: number;
  updatedAt: string | null;
  denominations: Array<{ denomination: number; quantity: number }>;
}

interface ClosingHistoryItem {
  id: number;
  businessDate: string;
  username: string;
  loketCode: string;
  countedCashTotal: number;
  depositTotal: number;
  discrepancyAmount: number;
  status: ClosingStatus;
  verifiedBy: string | null;
  reopenRequestedAt?: string | null;
}

interface ProductBreakdown {
  provider: string;
  serviceType: string;
  itemCount: number;
  total: number;
}

interface CashierOption {
  username: string;
  displayName: string;
  loketCode: string;
  loketName: string;
}

interface OverviewResponse {
  discrepancyReasons: Array<{ code: string; label: string }>;
  filters: { canSelectAll: boolean; username: string | null; loketCode: string | null };
  effectiveSummary: ClosingSummary;
  suggestedOpeningCash: number;
  closing: ClosingDetail | null;
  history: ClosingHistoryItem[];
  productBreakdown: ProductBreakdown[];
  cashierOptions: CashierOption[];
  denominations: number[];
}

const STATUS_META: Record<ClosingStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  SUBMITTED: { label: "Diajukan", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" },
  VERIFIED: { label: "Terverifikasi", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
  REJECTED: { label: "Ditolak", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200" },
};

/** Tanggal bisnis mengikuti zona loket (WITA), sama dengan versi desktop. */
function todayWita(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function num(v: string): number {
  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Input angka rupiah: tampil dengan pemisah ribuan, disimpan sebagai digit. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** "+Rp 1.000" / "−Rp 1.000" / "Rp 0". */
function signedRp(n: number): string {
  if (n > 0) return `+${formatRp(n)}`;
  if (n < 0) return `−${formatRp(Math.abs(n))}`;
  return formatRp(0);
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ymd: string): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function MobileTutupKasirPage() {
  const { data: session } = useSession();
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role || "kasir");
  const isApprover = role === "admin" || role === "supervisor";

  const [businessDate, setBusinessDate] = useState(todayWita());
  const [cashier, setCashier] = useState<{ username: string; loketCode: string } | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [openingCash, setOpeningCash] = useState("0");
  const [otherCash, setOtherCash] = useState("0");
  const [retainedCash, setRetainedCash] = useState("0");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [cashierNote, setCashierNote] = useState("");
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");

  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [reopenFor, setReopenFor] = useState<ClosingHistoryItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ businessDate });
      if (cashier) {
        params.set("username", cashier.username);
        params.set("loketCode", cashier.loketCode);
      }
      const res = await fetch(`/api/tutup-kasir?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "Gagal memuat data tutup kasir");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setLoadError("Gagal menghubungi server. Periksa koneksi.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [businessDate, cashier]);

  useEffect(() => {
    load();
  }, [load]);

  // Isi form dari data server (closing yang sudah ada, atau saran modal awal).
  useEffect(() => {
    if (!data) return;
    const c = data.closing;
    setOpeningCash(String(data.suggestedOpeningCash ?? c?.openingCash ?? 0));
    setOtherCash(String(c?.otherCashAmount ?? 0));
    setRetainedCash(String(c?.retainedCash ?? 0));
    setCashierNote(c?.cashierNote ?? "");
    setDiscrepancyNote(c?.discrepancyNote ?? "");
    setReasonCode(c?.discrepancyReasonCode ?? "");
    setProofReference(c?.proofReference ?? "");
    setProofNote(c?.proofNote ?? "");
    const next: Record<number, string> = {};
    for (const d of data.denominations) {
      next[d] = String(c?.denominations.find((x) => x.denomination === d)?.quantity ?? 0);
    }
    setQty(next);
  }, [data]);

  const summary = data?.effectiveSummary;
  const denomRows = (data?.denominations ?? []).map((d) => ({ denomination: d, quantity: num(qty[d] || "0") }));
  const denomTotal = denomRows.reduce((s, r) => s + r.denomination * r.quantity, 0);
  const counted = denomTotal + num(otherCash);
  const expected = num(openingCash) + (summary?.systemCashTotal ?? 0);
  const retained = num(retainedCash);
  const deposit = counted - retained;
  const discrepancy = counted - expected;
  const retainedInvalid = retained > counted;
  const closing = data?.closing ?? null;
  const canEdit = !closing || closing.status === "DRAFT" || closing.status === "REJECTED";
  const mustPickCashier = Boolean(data?.filters.canSelectAll && !cashier);

  const productGroups = useMemo(() => {
    const rows = data?.productBreakdown ?? [];
    return rows.slice().sort((a, b) => b.total - a.total);
  }, [data?.productBreakdown]);

  async function save(action: "draft" | "submit") {
    setNotice(null);
    if (action === "submit") {
      if (discrepancy !== 0 && !reasonCode) {
        setNotice({ tone: "error", text: "Pilih alasan selisih sebelum mengajukan." });
        return;
      }
      if (discrepancy !== 0 && !discrepancyNote.trim()) {
        setNotice({ tone: "error", text: "Isi catatan selisih sebelum mengajukan." });
        return;
      }
      if (!window.confirm(`Ajukan closing dengan setoran ${formatRp(deposit)}? Data tidak bisa diubah setelah diajukan.`)) return;
    }
    setSaving(action);
    try {
      const res = await fetch("/api/tutup-kasir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessDate,
          username: cashier?.username,
          loketCode: cashier?.loketCode,
          openingCash: num(openingCash),
          otherCashAmount: num(otherCash),
          retainedCash: retained,
          cashierNote,
          discrepancyNote,
          discrepancyReasonCode: reasonCode,
          proofReference,
          proofNote,
          denominations: denomRows,
          action,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "error", text: json.error || "Gagal menyimpan tutup kasir" });
        return;
      }
      setNotice({ tone: "ok", text: action === "submit" ? "Closing diajukan. Menunggu verifikasi." : "Draft tersimpan." });
      await load();
    } catch {
      setNotice({ tone: "error", text: "Gagal menghubungi server. Periksa koneksi." });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <MobileHeader title="Tutup kasir" subtitle={fmtDate(businessDate)} backHref="/m/akun" />
      <div className="p-4 space-y-4">
        <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-500">Tanggal closing</span>
            <input
              type="date"
              value={businessDate}
              max={todayWita()}
              onChange={(e) => e.target.value && setBusinessDate(e.target.value)}
              className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-base"
            />
          </label>
          {data?.filters.canSelectAll && (
            <label className="block">
              <span className="text-sm text-slate-500">Kasir</span>
              <select
                value={cashier?.username ?? ""}
                onChange={(e) => {
                  const opt = data.cashierOptions.find((o) => o.username === e.target.value);
                  setCashier(opt ? { username: opt.username, loketCode: opt.loketCode } : null);
                }}
                className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-base"
              >
                <option value="">Semua kasir (ringkasan saja)</option>
                {data.cashierOptions.map((o) => (
                  <option key={`${o.username}-${o.loketCode}`} value={o.username}>
                    {o.displayName} · {o.loketName || o.loketCode}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {loading && !data ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 h-40 animate-pulse" />
        ) : loadError ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 p-4 text-sm">
            {loadError}
            <button type="button" onClick={load} className="mt-3 block font-semibold underline">
              Coba lagi
            </button>
          </div>
        ) : data && summary ? (
          <>
            <section className="rounded-2xl bg-primary text-white p-4">
              <p className="text-sm opacity-80">
                Kas dari transaksi {businessDate === todayWita() ? "hari ini" : fmtDate(businessDate)}
              </p>
              <p className="text-2xl font-bold mt-1">{formatRp(summary.systemCashTotal)}</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div>
                  <p className="opacity-80">Transaksi</p>
                  <p className="font-semibold text-sm">{summary.successfulRequestCount}</p>
                </div>
                <div>
                  <p className="opacity-80">Tagihan</p>
                  <p className="font-semibold text-sm">{formatRp(summary.totalTagihan)}</p>
                </div>
                <div>
                  <p className="opacity-80">Admin</p>
                  <p className="font-semibold text-sm">{formatRp(summary.totalAdmin)}</p>
                </div>
              </div>
            </section>

            {closing && <StatusCard closing={closing} />}

            {mustPickCashier ? (
              <p className="text-sm text-slate-500 px-1">Pilih kasir untuk mengisi atau melihat form tutup kasir.</p>
            ) : (
              <>
                <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
                  <h2 className="font-semibold">Hitung uang fisik</h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {denomRows.map((r) => (
                      <li key={r.denomination} className="flex items-center gap-2 py-2">
                        <span className="w-24 font-medium">{formatRp(r.denomination)}</span>
                        <Stepper
                          value={qty[r.denomination] ?? "0"}
                          disabled={!canEdit}
                          onChange={(v) => setQty((q) => ({ ...q, [r.denomination]: v }))}
                        />
                        <span className="flex-1 text-right text-sm text-slate-500">{formatRp(r.denomination * r.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <MoneyInput label="Uang lainnya / koin" value={otherCash} onChange={setOtherCash} disabled={!canEdit} />
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-slate-500">Total kas fisik</span>
                    <span className="font-semibold">{formatRp(counted)}</span>
                  </div>
                </section>

                <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
                  <h2 className="font-semibold">Pencocokan kas</h2>
                  <MoneyInput label="Modal awal kas" value={openingCash} onChange={setOpeningCash} disabled={!canEdit} />
                  <dl className="text-sm space-y-1.5">
                    <Row label="Kas sistem" value={formatRp(summary.systemCashTotal)} />
                    <Row label="Kas seharusnya" value={formatRp(expected)} />
                    <Row label="Kas fisik" value={formatRp(counted)} />
                    <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                      <dt className="font-semibold">Selisih</dt>
                      <dd className={`font-bold ${discrepancy === 0 ? "text-emerald-600" : discrepancy > 0 ? "text-blue-600" : "text-red-600"}`}>
                        {signedRp(discrepancy)}
                      </dd>
                    </div>
                  </dl>

                  {discrepancy !== 0 && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 space-y-3">
                      <p className="text-sm text-amber-800 dark:text-amber-200">Ada selisih kas. Alasan dan catatan wajib diisi saat mengajukan.</p>
                      <label className="block">
                        <span className="text-sm">Alasan selisih</span>
                        <select
                          value={reasonCode}
                          onChange={(e) => setReasonCode(e.target.value)}
                          disabled={!canEdit}
                          className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-base"
                        >
                          <option value="">Pilih alasan…</option>
                          {data.discrepancyReasons.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TextArea label="Catatan selisih" value={discrepancyNote} onChange={setDiscrepancyNote} disabled={!canEdit} />
                      <TextInput label="Referensi bukti (opsional)" value={proofReference} onChange={setProofReference} disabled={!canEdit} />
                      <TextArea label="Catatan bukti (opsional)" value={proofNote} onChange={setProofNote} disabled={!canEdit} />
                    </div>
                  )}
                </section>

                <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
                  <h2 className="font-semibold">Setoran</h2>
                  <MoneyInput label="Kas ditahan untuk besok" value={retainedCash} onChange={setRetainedCash} disabled={!canEdit} />
                  {retainedInvalid && <p className="text-sm text-red-600">Kas ditahan melebihi kas fisik.</p>}
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500 text-sm">Setoran ke admin</span>
                    <span className="text-xl font-bold">{formatRp(Math.max(0, deposit))}</span>
                  </div>
                  <TextArea label="Catatan kasir (opsional)" value={cashierNote} onChange={setCashierNote} disabled={!canEdit} />
                </section>

                {notice && (
                  <p
                    role={notice.tone === "error" ? "alert" : "status"}
                    className={`rounded-xl p-3 text-sm ${
                      notice.tone === "ok"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                    }`}
                  >
                    {notice.text}
                  </p>
                )}

                {canEdit && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => save("draft")}
                      disabled={saving !== null || retainedInvalid}
                      className="h-12 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold disabled:opacity-40"
                    >
                      {saving === "draft" ? "Menyimpan…" : "Simpan draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => save("submit")}
                      disabled={saving !== null || retainedInvalid}
                      className="h-12 rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
                    >
                      {saving === "submit" ? "Mengajukan…" : closing?.status === "REJECTED" ? "Ajukan ulang" : "Ajukan closing"}
                    </button>
                  </div>
                )}
              </>
            )}

            {productGroups.length > 0 && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowProducts((v) => !v)}
                  className="w-full flex items-center justify-between p-4"
                  aria-expanded={showProducts}
                >
                  <span className="font-semibold">Rekap per produk</span>
                  <span className="material-symbols-outlined text-slate-400">{showProducts ? "expand_less" : "expand_more"}</span>
                </button>
                {showProducts && (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {productGroups.map((p) => (
                      <li key={`${p.provider}-${p.serviceType}`} className="flex justify-between px-4 py-3 text-sm">
                        <span>
                          {p.serviceType}
                          <span className="text-slate-500"> · {p.provider} · {p.itemCount} item</span>
                        </span>
                        <span className="font-medium">{formatRp(p.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {data.history.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 px-1 mb-2">Riwayat closing</h2>
                <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {data.history.map((h) => {
                    const meta = STATUS_META[h.status];
                    const canReopen = !isApprover && h.status === "VERIFIED" && !h.reopenRequestedAt;
                    return (
                      <li key={h.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{fmtDate(h.businessDate)}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {h.username} · setoran {formatRp(h.depositTotal)}
                              {h.discrepancyAmount !== 0 ? ` · selisih ${signedRp(h.discrepancyAmount)}` : ""}
                            </p>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                        </div>
                        {h.reopenRequestedAt && <p className="mt-1 text-xs text-amber-600">Reopen diajukan, menunggu persetujuan.</p>}
                        {canReopen && (
                          <button type="button" onClick={() => setReopenFor(h)} className="mt-2 text-sm text-primary font-medium">
                            Ajukan reopen
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <p className="text-xs text-slate-500 px-1">Cetak berita acara dan laporan setoran tersedia di versi desktop.</p>
          </>
        ) : null}
      </div>

      {reopenFor && (
        <ReopenSheet
          item={reopenFor}
          onClose={() => setReopenFor(null)}
          onDone={async () => {
            setReopenFor(null);
            setNotice({ tone: "ok", text: "Pengajuan reopen terkirim." });
            await load();
          }}
        />
      )}
    </div>
  );
}

function StatusCard({ closing }: { closing: ClosingDetail }) {
  const meta = STATUS_META[closing.status];
  const message =
    closing.status === "SUBMITTED"
      ? "Closing sudah diajukan dan menunggu verifikasi admin/supervisor."
      : closing.status === "VERIFIED"
        ? `Terverifikasi oleh ${closing.verifiedBy || "-"} · ${fmtDateTime(closing.verifiedAt)}. Data terkunci.`
        : closing.status === "REJECTED"
          ? `Ditolak oleh ${closing.verifiedBy || "-"}. Perbaiki lalu ajukan ulang.`
          : `Draft terakhir disimpan ${fmtDateTime(closing.updatedAt)}.`;
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Status closing</h2>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
      </div>
      <p className="text-sm text-slate-500 mt-2">{message}</p>
      {closing.status === "REJECTED" && closing.verifierNote && (
        <p className="mt-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 p-3 text-sm">“{closing.verifierNote}”</p>
      )}
    </section>
  );
}

function ReopenSheet({ item, onClose, onDone }: { item: ClosingHistoryItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!note.trim()) {
      setError("Alasan reopen wajib diisi.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/tutup-kasir", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_reopen", closingId: item.id, note: note.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Gagal mengajukan reopen");
        return;
      }
      onDone();
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-title"
        className="w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reopen-title" className="text-lg font-bold">
          Ajukan reopen
        </h2>
        <p className="text-sm text-slate-500">Closing {fmtDate(item.businessDate)} akan dibuka kembali setelah disetujui admin/supervisor.</p>
        <TextArea label="Alasan" value={note} onChange={setNote} autoFocus />
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold">
            Batal
          </button>
          <button type="button" onClick={send} disabled={sending} className="h-12 rounded-xl bg-primary text-white font-semibold disabled:opacity-40">
            {sending ? "Mengirim…" : "Kirim"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const n = num(value);
  const btn = "h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30";
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} disabled={disabled || n === 0} onClick={() => onChange(String(n - 1))} aria-label="Kurangi">
        <span className="material-symbols-outlined text-lg">remove</span>
      </button>
      <input
        inputMode="numeric"
        value={value === "0" ? "" : value}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(digitsOnly(e.target.value) || "0")}
        className="h-10 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-center text-base disabled:opacity-60"
        aria-label="Jumlah lembar"
      />
      <button type="button" className={btn} disabled={disabled} onClick={() => onChange(String(n + 1))} aria-label="Tambah">
        <span className="material-symbols-outlined text-lg">add</span>
      </button>
    </div>
  );
}

function MoneyInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const shown = num(value) ? num(value).toLocaleString("id-ID") : "";
  return (
    <label className="block">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="mt-1 flex items-center h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3">
        <span className="text-slate-400 mr-2">Rp</span>
        <input
          inputMode="numeric"
          value={shown}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => onChange(digitsOnly(e.target.value) || "0")}
          className="flex-1 bg-transparent text-base outline-none disabled:opacity-60"
        />
      </div>
    </label>
  );
}

function TextInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-base disabled:opacity-60"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-base disabled:opacity-60"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
