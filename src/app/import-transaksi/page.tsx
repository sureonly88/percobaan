"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type JenisType = "PDAM" | "PLN_POSTPAID" | "PLN_PREPAID";

interface ImportStats {
  inserted: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}

interface PreviewCounts {
  PDAM: number;
  PLN_POSTPAID: number;
  PLN_PREPAID: number;
}

type PageState = "idle" | "previewing" | "importing" | "done" | "error";

interface ImportLog {
  id: number;
  actorUsername: string | null;
  actorRole: string | null;
  actorIp: string | null;
  sourceUrl: string | null;
  tglAwal: string | null;
  tglAkhir: string | null;
  jenis: string[];
  loketCode: string | null;
  durationMs: number | null;
  inserted: number;
  updated: number;
  errors: number;
  errorDetails: string[];
  createdAt: string;
}

const JENIS_OPTIONS: { value: JenisType; label: string }[] = [
  { value: "PDAM",        label: "PDAM (Tagihan Air)" },
  { value: "PLN_POSTPAID", label: "PLN Postpaid (Tagihan Listrik)" },
  { value: "PLN_PREPAID",  label: "PLN Prepaid (Token Listrik)" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportTransaksiPage() {
  const [sourceUrl,   setSourceUrl]   = useState("");
  const [reportToken, setReportToken] = useState("");
  const [tglAwal,     setTglAwal]     = useState("");
  const [tglAkhir,    setTglAkhir]    = useState("");
  const [jenis,       setJenis]       = useState<JenisType[]>(["PDAM", "PLN_POSTPAID", "PLN_PREPAID"]);
  const [loketCode,   setLoketCode]   = useState("");

  const [pageState, setPageState] = useState<PageState>("idle");
  const [preview,   setPreview]   = useState<PreviewCounts | null>(null);
  const [stats,     setStats]     = useState<ImportStats | null>(null);
  const [message,   setMessage]   = useState("");
  const [errMsg,    setErrMsg]    = useState("");

  // ── Cleanup state ──────────────────────────────────────────────────────────
  const [cleaning,     setCleaning]     = useState(false);
  const [cleanupMsg,   setCleanupMsg]   = useState<{ok: boolean; text: string} | null>(null);

  // ── Import log history ─────────────────────────────────────────────────────
  const [logs,         setLogs]         = useState<ImportLog[]>([]);
  const [logsLoading,  setLogsLoading]  = useState(false);
  const [expandedLog,  setExpandedLog]  = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/v1/admin/import-transaksi/logs?limit=20");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function toggleJenis(v: JenisType) {
    setJenis((prev) =>
      prev.includes(v) ? prev.filter((j) => j !== v) : [...prev, v]
    );
  }

  function isFormValid() {
    return sourceUrl.trim() && reportToken.trim() && tglAwal && tglAkhir && jenis.length > 0;
  }

  // ── Preview: hitung total transaksi tanpa mengimport ──────────────────────
  async function handlePreview() {
    if (!isFormValid()) return;
    setPageState("previewing");
    setErrMsg("");
    setPreview(null);
    setStats(null);

    const params = new URLSearchParams({
      sourceUrl:   sourceUrl.trim(),
      reportToken: reportToken.trim(),
      tglAwal,
      tglAkhir,
    });
    if (loketCode.trim()) params.set("loketCode", loketCode.trim());

    try {
      const res = await fetch(`/api/v1/admin/import-transaksi?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal cek koneksi");
      setPreview(data.counts as PreviewCounts);
      setPageState("idle");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPageState("error");
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!isFormValid()) return;
    if (!confirm("Yakin ingin memulai import transaksi? Data yang sudah ada akan di-overwrite.")) return;

    setPageState("importing");
    setErrMsg("");
    setStats(null);
    setMessage("");

    try {
      const res = await fetch("/api/v1/admin/import-transaksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl:   sourceUrl.trim(),
          reportToken: reportToken.trim(),
          tglAwal,
          tglAkhir,
          jenis,
          loketCode: loketCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import gagal");
      setStats(data.stats);
      setMessage(data.message);
      setPageState("done");
      fetchLogs(); // refresh riwayat setelah import selesai
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPageState("error");
    }
  }

  const isBusy = pageState === "previewing" || pageState === "importing";

  // ── Cleanup: hapus data PDAM legacy format lama ───────────────────────────
  async function handleCleanup() {
    if (!confirm(
      "Ini akan menghapus SEMUA data yang pernah diimport dari Pedami Payment (format lama).\n\nLanjutkan?"
    )) return;
    setCleaning(true);
    setCleanupMsg(null);
    try {
      const res = await fetch("/api/v1/admin/import-transaksi", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal cleanup");
      setCleanupMsg({ ok: true, text: data.message });
    } catch (e) {
      setCleanupMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCleaning(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import Transaksi</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Import data historis dari aplikasi pedami-payment ke sistem ini.
        </p>
      </div>

      {/* ── Form ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Konfigurasi Sumber Data</h2>

        {/* Source URL */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            URL Aplikasi Pedami-Payment <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            placeholder="http://192.168.1.1:8000"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={isBusy}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Report Token */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Report Token <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            placeholder="Token akses API pedami-payment"
            value={reportToken}
            onChange={(e) => setReportToken(e.target.value)}
            disabled={isBusy}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Tanggal */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tanggal Awal <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={tglAwal}
              onChange={(e) => setTglAwal(e.target.value)}
              disabled={isBusy}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tanggal Akhir <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={tglAkhir}
              onChange={(e) => setTglAkhir(e.target.value)}
              disabled={isBusy}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Jenis Transaksi */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Jenis Transaksi <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {JENIS_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={jenis.includes(value)}
                  onChange={() => toggleJenis(value)}
                  disabled={isBusy}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                {preview && (
                  <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded-full ${
                    preview[value] === -1
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}>
                    {preview[value] === -1 ? "error" : `${preview[value].toLocaleString()} transaksi`}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Loket Code (opsional) */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Filter Loket{" "}
            <span className="font-normal text-gray-400">(opsional, koma-separated)</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: L001,L002"
            value={loketCode}
            onChange={(e) => setLoketCode(e.target.value)}
            disabled={isBusy}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handlePreview}
            disabled={!isFormValid() || isBusy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {pageState === "previewing" ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                Cek Koneksi...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">search</span>
                Cek Koneksi & Hitung
              </>
            )}
          </button>

          <button
            onClick={handleImport}
            disabled={!isFormValid() || isBusy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {pageState === "importing" ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                Sedang Import... (sabar ya)
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">move_to_inbox</span>
                Mulai Import
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Hasil Import ── */}
      {pageState === "done" && stats && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <span className="material-symbols-outlined text-xl">check_circle</span>
            <h2 className="font-semibold">Import Selesai</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Data Baru"
              value={stats.inserted}
              color="text-green-600 dark:text-green-400"
              bg="bg-green-50 dark:bg-green-900/20"
            />
            <StatCard
              label="Diperbarui"
              value={stats.updated}
              color="text-blue-600 dark:text-blue-400"
              bg="bg-blue-50 dark:bg-blue-900/20"
            />
            <StatCard
              label="Error"
              value={stats.errors}
              color="text-red-600 dark:text-red-400"
              bg="bg-red-50 dark:bg-red-900/20"
            />
          </div>

          {stats.errorDetails.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Detail Error:</p>
              <ul className="rounded-lg border border-red-200 dark:border-red-800 divide-y divide-red-100 dark:divide-red-800 max-h-48 overflow-y-auto">
                {stats.errorDetails.map((e, i) => (
                  <li key={i} className="px-3 py-1.5 text-xs font-mono text-red-700 dark:text-red-300">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => { setPageState("idle"); setStats(null); setMessage(""); setPreview(null); }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Import lagi dengan pengaturan lain
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {pageState === "error" && errMsg && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-500 shrink-0">error</span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Terjadi Kesalahan</p>
            <p className="text-sm text-red-600 dark:text-red-300">{errMsg}</p>
            <button
              onClick={() => setPageState("idle")}
              className="text-xs text-red-500 dark:text-red-400 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* ── Riwayat Import ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-gray-500">history</span>
            <h2 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Riwayat Import</h2>
            {logs.length > 0 && (
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                {logs.length} terakhir
              </span>
            )}
          </div>
          <button
            onClick={fetchLogs}
            disabled={logsLoading}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-sm ${logsLoading ? "animate-spin" : ""}`}>refresh</span>
            Refresh
          </button>
        </div>

        {logsLoading && logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            <span className="material-symbols-outlined animate-spin text-2xl block mb-2">progress_activity</span>
            Memuat riwayat...
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            <span className="material-symbols-outlined text-2xl block mb-2 opacity-40">inbox</span>
            Belum ada riwayat import.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.id;
              const hasError   = log.errors > 0;
              const durationSec = log.durationMs != null ? (log.durationMs / 1000).toFixed(1) : null;
              return (
                <li key={log.id} className="px-6 py-4 text-sm">
                  <div
                    className="flex items-start gap-3 cursor-pointer select-none"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {/* status icon */}
                    <span className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${
                      hasError ? "text-amber-500" : "text-green-500"
                    }`}>
                      {hasError ? "warning" : "check_circle"}
                    </span>

                    {/* main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {log.tglAwal} — {log.tglAkhir}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                          {new Date(log.createdAt).toLocaleString("id-ID", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        {durationSec && (
                          <span className="text-gray-400 text-xs">{durationSec}s</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {log.jenis.map((j) => (
                          <span key={j} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
                            {j}
                          </span>
                        ))}
                        {log.loketCode && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            loket: {log.loketCode}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* stats badges */}
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                        +{log.inserted}
                      </span>
                      {log.updated > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                          ~{log.updated}
                        </span>
                      )}
                      {hasError && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                          {log.errors} err
                        </span>
                      )}
                      <span className={`material-symbols-outlined text-base text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        expand_more
                      </span>
                    </div>
                  </div>

                  {/* expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 ml-7 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div><span className="font-medium text-gray-600 dark:text-gray-300">Oleh:</span> {log.actorUsername ?? "-"} ({log.actorRole ?? "-"})</div>
                        <div><span className="font-medium text-gray-600 dark:text-gray-300">IP:</span> {log.actorIp ?? "-"}</div>
                        <div className="col-span-2"><span className="font-medium text-gray-600 dark:text-gray-300">Source URL:</span> {log.sourceUrl ?? "-"}</div>
                      </div>
                      {log.errorDetails.length > 0 && (
                        <div>
                          <p className="font-medium text-red-600 dark:text-red-400 mb-1">Detail Error ({log.errorDetails.length}):</p>
                          <ul className="rounded-lg border border-red-200 dark:border-red-800 divide-y divide-red-100 dark:divide-red-800 max-h-32 overflow-y-auto">
                            {log.errorDetails.map((e, i) => (
                              <li key={i} className="px-3 py-1 font-mono text-red-700 dark:text-red-300">{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Info box ── */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300 space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <span className="material-symbols-outlined text-base">info</span>
          Catatan Penting
        </div>
        <ul className="list-disc list-inside space-y-1 text-amber-600 dark:text-amber-400">
          <li>Import berjalan server-side, proses mungkin memakan waktu beberapa menit.</li>
          <li>Kode unik PDAM menggunakan <code>idpel + periode</code> — satu pelanggan per periode = satu baris.</li>
          <li>Kode transaksi akan diberi prefix <code>LEGACY-PDAM-</code>, <code>LEGACY-PLN-</code>, atau <code>LEGACY-PLNP-</code>.</li>
          <li>Import dapat dijalankan ulang tanpa efek samping (idempotent).</li>
        </ul>
      </div>

      {/* ── Zona Berbahaya: Bersihkan data lama ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800">
        <div className="px-6 py-4 border-b border-red-100 dark:border-red-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-red-500">warning</span>
          <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Zona Berbahaya</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Hapus semua data import PDAM (format lama)</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Gunakan ini jika data yang sudah diimport menggunakan format kunci lama
                (sebelum perbaikan bug duplikasi). Setelah dihapus, jalankan import ulang.
              </p>
            </div>
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {cleaning ? (
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
              )}
              {cleaning ? "Menghapus..." : "Bersihkan Data Lama"}
            </button>
          </div>
          {cleanupMsg && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              cleanupMsg.ok
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
            }`}>
              <span className="material-symbols-outlined text-sm">{cleanupMsg.ok ? "check_circle" : "error"}</span>
              {cleanupMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
