"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Summary {
  totalTrx: number;
  totalKasir: number;
  totalLoket: number;
  totalAll: number;
}

interface Beneficiary {
  target: "KASIR" | "LOKET";
  beneficiary: string;
  trxCount: number;
  totalAmount: number;
}

interface PerLoket {
  loketCode: string;
  trxCount: number;
  totalKasir: number;
  totalLoket: number;
}

interface PerProvider {
  provider: string;
  trxCount: number;
  totalKasir: number;
  totalLoket: number;
}

interface DetailItem {
  id: number;
  paidAt: string;
  loketCode: string;
  username: string;
  provider: string;
  productCode: string | null;
  itemCode: string;
  transactionCode: string | null;
  target: "KASIR" | "LOKET";
  beneficiary: string;
  ruleName: string | null;
  ruleType: "PERCENT" | "FLAT";
  ruleValue: number;
  basis: string;
  baseAmount: number;
  commissionAmount: number;
  status: "ACCRUED" | "PAID" | "VOID";
}

interface Report {
  filter: { startDate: string; endDate: string; loketCode: string | null; provider: string; target: string; beneficiary: string; status: string };
  summary: Summary;
  perBeneficiary: Beneficiary[];
  perLoket: PerLoket[];
  perProvider: PerProvider[];
  detail: DetailItem[];
}

const PROVIDERS = ["", "PDAM", "LUNASIN", "PLN", "TELKOM", "BPJS", "PULSA"];

function fmtRp(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function fmtDate(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function defaultStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LaporanKomisiPage() {
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(todayStr());
  const [loketCode, setLoketCode] = useState("");
  const [provider, setProvider] = useState("");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [lokets, setLokets] = useState<Array<{ loket_code: string; nama: string }>>([]); 
  const [detailPage, setDetailPage] = useState(1);
  const [showBackfill, setShowBackfill] = useState(false);
  const [backfillStart, setBackfillStart] = useState(defaultStart());
  const [backfillEnd, setBackfillEnd] = useState(todayStr());
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<null | { ok: boolean; totalItems: number; processed: number; skipped: number; failed: number; errors: string[] }>(null);
  useEffect(() => {
    fetch("/api/loket")
      .then((r) => r.json())
      .then((j) => setLokets(Array.isArray(j?.lokets) ? j.lokets : Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("startDate", startDate);
      sp.set("endDate", endDate);
      if (loketCode) sp.set("loketCode", loketCode);
      if (provider) sp.set("provider", provider);
      if (target) sp.set("target", target);
      if (status) sp.set("status", status);
      if (showDetail) sp.set("detail", "1");
      const res = await fetch(`/api/keuangan/komisi/laporan?${sp.toString()}`);
      const j = await res.json();
      setData(j);
      setDetailPage(1);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, loketCode, provider, target, status, showDetail]);

  useEffect(() => { load(); }, [load]);

  const runBackfill = async () => {
    setBackfillRunning(true);
    setBackfillResult(null);
    try {
      const sp = new URLSearchParams({ startDate: backfillStart, endDate: backfillEnd });
      const res = await fetch(`/api/keuangan/komisi/backfill?${sp.toString()}`, { method: "POST" });
      const j = await res.json();
      setBackfillResult(j);
      if (j.ok) load(); // refresh laporan
    } catch {
      setBackfillResult({ ok: false, totalItems: 0, processed: 0, skipped: 0, failed: 1, errors: ["Gagal menghubungi server"] });
    } finally {
      setBackfillRunning(false);
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const BOM = "\uFEFF";
    let csv = BOM + `LAPORAN KOMISI ${startDate} s.d. ${endDate}\n\n`;
    csv += "RINGKASAN\n";
    csv += `Total Transaksi,${data.summary.totalTrx}\n`;
    csv += `Total Komisi Kasir,${data.summary.totalKasir}\n`;
    csv += `Total Komisi Loket,${data.summary.totalLoket}\n`;
    csv += `Total Komisi,${data.summary.totalAll}\n\n`;
    csv += "PER PENERIMA\n";
    csv += "Target,Beneficiary,Jumlah Trx,Total Komisi\n";
    for (const b of data.perBeneficiary) {
      csv += `${b.target},${b.beneficiary},${b.trxCount},${b.totalAmount}\n`;
    }
    csv += "\nPER LOKET\n";
    csv += "Loket,Jumlah Trx,Komisi Kasir,Komisi Loket\n";
    for (const l of data.perLoket) {
      csv += `${l.loketCode},${l.trxCount},${l.totalKasir},${l.totalLoket}\n`;
    }
    csv += "\nPER PROVIDER\n";
    csv += "Provider,Jumlah Trx,Komisi Kasir,Komisi Loket\n";
    for (const p of data.perProvider) {
      csv += `${p.provider},${p.trxCount},${p.totalKasir},${p.totalLoket}\n`;
    }
    if (showDetail && data.detail.length) {
      csv += "\nDETAIL\n";
      csv += "Tanggal,Loket,User,Provider,Produk,Item,Target,Beneficiary,Rule,Base,Komisi,Status\n";
      for (const d of data.detail) {
        csv += `${d.paidAt},${d.loketCode},${d.username},${d.provider},${d.productCode ?? ""},${d.itemCode},${d.target},${d.beneficiary},"${d.ruleName ?? ""}",${d.baseAmount},${d.commissionAmount},${d.status}\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `komisi_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">analytics</span>
            Laporan Komisi / Profit Sharing
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Rekap komisi per periode — dasar perhitungan gaji kasir & bagi hasil loket
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/keuangan/komisi"
            className="h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            Atur Aturan
          </a>
          <button
            onClick={() => { setBackfillResult(null); setShowBackfill(true); }}
            className="h-11 px-4 rounded-lg border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 text-sm font-medium flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          >
            <span className="material-symbols-outlined text-base">history</span>
            Backfill Historis
          </button>
          <button
            onClick={exportCSV}
            disabled={!data}
            className="h-11 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Export CSV
          </button>
        </div>
      </header>

      {/* Modal Backfill */}
      {showBackfill && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Backfill Komisi Historis</h2>
              <button onClick={() => setShowBackfill(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-500">
                Hitung ulang komisi untuk transaksi SUCCESS yang belum punya entry di ledger. Transaksi yang sudah ter-record akan di-skip otomatis (idempotent). Maksimal 90 hari per run.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Dari</label>
                  <input type="date" value={backfillStart} onChange={(e) => setBackfillStart(e.target.value)}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Sampai</label>
                  <input type="date" value={backfillEnd} onChange={(e) => setBackfillEnd(e.target.value)}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm" />
                </div>
              </div>
              {backfillResult && (
                <div className={`rounded-lg p-3 text-sm ${
                  backfillResult.ok
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
                }`}>
                  {backfillResult.ok ? (
                    <>
                      <div className="font-semibold mb-1">Backfill selesai</div>
                      <div>Total item diperiksa: <b>{backfillResult.totalItems}</b></div>
                      <div>Komisi baru dicatat: <b className="text-emerald-700 dark:text-emerald-300">{backfillResult.processed}</b></div>
                      <div>Di-skip (sudah ada / no rule): <b>{backfillResult.skipped}</b></div>
                      {backfillResult.failed > 0 && <div className="text-amber-700">Gagal: {backfillResult.failed}</div>}
                    </>
                  ) : (
                    <div>{backfillResult.errors?.[0] ?? "Terjadi kesalahan"}</div>
                  )}
                  {backfillResult.errors?.length > 0 && backfillResult.ok && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-slate-500">Lihat error ({backfillResult.errors.length})</summary>
                      <ul className="mt-1 space-y-0.5">{backfillResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowBackfill(false)}
                className="h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                Tutup
              </button>
              <button onClick={runBackfill} disabled={backfillRunning}
                className="h-11 px-5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {backfillRunning && <span className="animate-spin material-symbols-outlined text-base">progress_activity</span>}
                {backfillRunning ? "Memproses..." : "Jalankan Backfill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tanggal Mulai</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tanggal Akhir</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Loket</label>
          <select
            value={loketCode}
            onChange={(e) => setLoketCode(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          >
            <option value="">Semua Loket</option>
            {lokets.map((l) => (
              <option key={l.loket_code} value={l.loket_code}>{l.loket_code} — {l.nama}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p || "Semua Provider"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Target</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          >
            <option value="">Semua</option>
            <option value="KASIR">Kasir</option>
            <option value="LOKET">Loket</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
          >
            <option value="">Semua</option>
            <option value="ACCRUED">Accrued (Belum Bayar)</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>
        <div className="md:col-span-6 flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={showDetail}
              onChange={(e) => setShowDetail(e.target.checked)}
            />
            Tampilkan detail per transaksi
          </label>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-500">Jumlah Transaksi</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{(data?.summary.totalTrx ?? 0).toLocaleString("id-ID")}</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="text-xs text-blue-700 dark:text-blue-300">Komisi Kasir</div>
          <div className="text-2xl font-bold text-blue-800 dark:text-blue-200 mt-1">{fmtRp(data?.summary.totalKasir ?? 0)}</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
          <div className="text-xs text-purple-700 dark:text-purple-300">Komisi Loket</div>
          <div className="text-2xl font-bold text-purple-800 dark:text-purple-200 mt-1">{fmtRp(data?.summary.totalLoket ?? 0)}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <div className="text-xs text-emerald-700 dark:text-emerald-300">Total Komisi</div>
          <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 mt-1">{fmtRp(data?.summary.totalAll ?? 0)}</div>
        </div>
      </div>

      {loading && <div className="text-center py-6 text-slate-400">Memuat data...</div>}

      {/* Per Penerima */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <h2 className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800">
          Per Penerima (Kasir / Loket)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2.5">Target</th>
                <th className="text-left px-3 py-2.5">Beneficiary</th>
                <th className="text-right px-3 py-2.5">Jumlah Trx</th>
                <th className="text-right px-3 py-2.5">Total Komisi</th>
              </tr>
            </thead>
            <tbody>
              {(data?.perBeneficiary ?? []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400">Belum ada komisi pada periode ini</td></tr>
              )}
              {(data?.perBeneficiary ?? []).map((b, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      b.target === "KASIR"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    }`}>{b.target}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{b.beneficiary}</td>
                  <td className="px-3 py-2 text-right">{b.trxCount.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtRp(b.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per Loket & Provider side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800">Per Loket</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2.5">Loket</th>
                <th className="text-right px-3 py-2.5">Trx</th>
                <th className="text-right px-3 py-2.5">Kasir</th>
                <th className="text-right px-3 py-2.5">Loket</th>
              </tr>
            </thead>
            <tbody>
              {(data?.perLoket ?? []).map((l, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-mono">{l.loketCode}</td>
                  <td className="px-3 py-2 text-right">{l.trxCount}</td>
                  <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-300">{fmtRp(l.totalKasir)}</td>
                  <td className="px-3 py-2 text-right text-purple-700 dark:text-purple-300">{fmtRp(l.totalLoket)}</td>
                </tr>
              ))}
              {(data?.perLoket ?? []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-4 text-slate-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800">Per Provider</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2.5">Provider</th>
                <th className="text-right px-3 py-2.5">Trx</th>
                <th className="text-right px-3 py-2.5">Kasir</th>
                <th className="text-right px-3 py-2.5">Loket</th>
              </tr>
            </thead>
            <tbody>
              {(data?.perProvider ?? []).map((p, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-semibold">{p.provider}</td>
                  <td className="px-3 py-2 text-right">{p.trxCount}</td>
                  <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-300">{fmtRp(p.totalKasir)}</td>
                  <td className="px-3 py-2 text-right text-purple-700 dark:text-purple-300">{fmtRp(p.totalLoket)}</td>
                </tr>
              ))}
              {(data?.perProvider ?? []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-4 text-slate-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail */}
      {showDetail && data && (() => {
        const DETAIL_PER_PAGE = 50;
        const totalPages = Math.max(1, Math.ceil(data.detail.length / DETAIL_PER_PAGE));
        const safePage = Math.min(detailPage, totalPages);
        const pageRows = data.detail.slice((safePage - 1) * DETAIL_PER_PAGE, safePage * DETAIL_PER_PAGE);
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">
                Detail Transaksi
                <span className="ml-2 text-xs font-normal text-slate-400">{data.detail.length.toLocaleString("id-ID")} baris</span>
              </h2>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => setDetailPage(1)}
                    disabled={safePage === 1}
                    className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="material-symbols-outlined text-base">first_page</span>
                  </button>
                  <button
                    onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  <span className="text-slate-600 dark:text-slate-300 min-w-[6rem] text-center">
                    Hal {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setDetailPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                  <button
                    onClick={() => setDetailPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="material-symbols-outlined text-base">last_page</span>
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-2 py-2">Tanggal</th>
                    <th className="text-left px-2 py-2">Loket</th>
                    <th className="text-left px-2 py-2">User</th>
                    <th className="text-left px-2 py-2">Provider</th>
                    <th className="text-left px-2 py-2">Item</th>
                    <th className="text-left px-2 py-2">Target</th>
                    <th className="text-left px-2 py-2">Rule</th>
                    <th className="text-right px-2 py-2">Base</th>
                    <th className="text-right px-2 py-2">Komisi</th>
                    <th className="text-center px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detail.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-6 text-slate-400">Tidak ada detail</td></tr>
                  )}
                  {pageRows.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">{fmtDate(d.paidAt)}</td>
                      <td className="px-2 py-1.5 font-mono">{d.loketCode}</td>
                      <td className="px-2 py-1.5">{d.username}</td>
                      <td className="px-2 py-1.5">{d.provider}</td>
                      <td className="px-2 py-1.5 font-mono">{d.itemCode}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          d.target === "KASIR" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>{d.target}</span>
                      </td>
                      <td className="px-2 py-1.5">{d.ruleName} <span className="text-slate-400">({d.ruleType === "PERCENT" ? `${d.ruleValue}%` : fmtRp(d.ruleValue)})</span></td>
                      <td className="px-2 py-1.5 text-right">{fmtRp(d.baseAmount)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmtRp(d.commissionAmount)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          d.status === "ACCRUED" ? "bg-amber-100 text-amber-700" :
                          d.status === "PAID" ? "bg-emerald-100 text-emerald-700" :
                          "bg-slate-200 text-slate-500"
                        }`}>{d.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>
                  Menampilkan {((safePage - 1) * DETAIL_PER_PAGE + 1).toLocaleString("id-ID")}–{Math.min(safePage * DETAIL_PER_PAGE, data.detail.length).toLocaleString("id-ID")} dari {data.detail.length.toLocaleString("id-ID")} baris
                </span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .reduce<(number | "...")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "..." ? (
                        <span key={`ellipsis-${i}`} className="px-1">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setDetailPage(p as number)}
                          className={`h-7 min-w-[1.75rem] px-1.5 rounded text-xs font-medium ${
                            p === safePage
                              ? "bg-primary text-white"
                              : "border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
