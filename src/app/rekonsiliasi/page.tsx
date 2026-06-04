"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type ProviderTab = "pdam" | "lunasin";

interface LoketOption {
  nama: string;
  loketCode: string;
}

interface SummaryData {
  totalTransaksi: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
}

interface PdamPreviewRow {
  id: number;
  transactionDate: string;
  transactionCode: string;
  customerId: string;
  customerName: string;
  periodLabel: string;
  loketCode: string;
  loketName: string;
  username: string;
  jenisLoket: string;
  amount: number;
  adminFee: number;
  total: number;
}

interface LunasinPreviewRow {
  id: number;
  transactionDate: string;
  transactionCode: string;
  customerId: string;
  customerName: string;
  productCode: string;
  productLabel: string;
  sheetName: string;
  periodLabel: string;
  loketCode: string;
  loketName: string;
  username: string;
  amount: number;
  adminFee: number;
  total: number;
}

interface PreviewResponse<T> {
  provider: ProviderTab;
  summary: SummaryData;
  total: number;
  page: number;
  totalPages: number;
  loketList: LoketOption[];
  rows: T[];
}

interface ReconciliationBatch {
  id: number;
  provider: string;
  startDate: string;
  endDate: string;
  loketCode: string | null;
  providerImportId: number | null;
  totalItems: number;
  matchCount: number;
  exceptionCount: number;
  totalInternal: number;
  totalProvider: number;
  createdBy: string | null;
  createdAt: string;
}

interface ProviderImportItem {
  id: number;
  provider: string;
  startDate: string;
  endDate: string;
  loketCode: string | null;
  originalFilename: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalProvider: number;
  importedBy: string | null;
  createdAt: string;
}

interface ReconciliationExceptionItem {
  id: number;
  transactionCode: string | null;
  customerId: string | null;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  loketCode: string | null;
  loketName: string | null;
  internalTotal: number;
  providerTotal: number;
  differenceAmount: number;
  matchStatus: string;
  note: string | null;
}

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("id-ID");
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RekonsiliasiPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role || "";
  const isAdmin = userRole === "admin";
  const [activeTab, setActiveTab] = useState<ProviderTab>("pdam");
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());
  const [loketCode, setLoketCode] = useState("");
  const [loketDropdownOpen, setLoketDropdownOpen] = useState(false);
  const [loketSearch, setLoketSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PreviewResponse<PdamPreviewRow | LunasinPreviewRow> | null>(null);
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ReconciliationBatch | null>(null);
  const [exceptionItems, setExceptionItems] = useState<ReconciliationExceptionItem[]>([]);
  const [batchError, setBatchError] = useState("");
  const [providerImports, setProviderImports] = useState<ProviderImportItem[]>([]);
  const [selectedProviderImportId, setSelectedProviderImportId] = useState<number | null>(null);
  const [providerFile, setProviderFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const loketDropdownRef = useRef<HTMLDivElement>(null);

  const summary = data?.summary;
  const loketList = data?.loketList ?? [];
  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;

  const selectedLoketLabel = useMemo(() => {
    if (!loketCode) return "Semua Loket";
    const selected = loketList.find((loket) => loket.loketCode === loketCode);
    return selected ? `${selected.nama} (${selected.loketCode})` : loketCode;
  }, [loketCode, loketList]);

  const filteredLoketList = useMemo(() => {
    const keyword = loketSearch.trim().toLowerCase();
    if (!keyword) return loketList;
    return loketList.filter((loket) => {
      return (
        loket.nama.toLowerCase().includes(keyword) ||
        loket.loketCode.toLowerCase().includes(keyword)
      );
    });
  }, [loketList, loketSearch]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("provider", activeTab);
    params.set("page", String(page));
    params.set("limit", "20");
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (loketCode) params.set("loketCode", loketCode);
    return params.toString();
  }, [activeTab, endDate, loketCode, page, startDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/rekonsiliasi?${queryString}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Gagal mengambil data rekonsiliasi");
      }
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengambil data rekonsiliasi";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const loadBatch = useCallback(async (batch: ReconciliationBatch) => {
    setSelectedBatch(batch);
    setBatchError("");
    try {
      const response = await fetch(`/api/rekonsiliasi/batches/${batch.id}?status=EXCEPTION`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal mengambil detail batch");
      setExceptionItems(json.items || []);
    } catch (err) {
      setExceptionItems([]);
      setBatchError(err instanceof Error ? err.message : "Gagal mengambil detail batch");
    }
  }, []);

  const fetchBatches = useCallback(async (autoSelectFirst = false) => {
    setBatchLoading(true);
    setBatchError("");
    try {
      const response = await fetch(`/api/rekonsiliasi/batches?provider=${activeTab}&pageSize=8`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal mengambil batch rekonsiliasi");
      const items = json.items || [];
      setBatches(items);
      if (autoSelectFirst && items[0]) {
        await loadBatch(items[0]);
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Gagal mengambil batch rekonsiliasi");
    } finally {
      setBatchLoading(false);
    }
  }, [activeTab, loadBatch]);

  const fetchProviderImports = useCallback(async (autoSelectFirst = false) => {
    setImportLoading(true);
    setImportError("");
    try {
      const response = await fetch(`/api/rekonsiliasi/imports?provider=${activeTab}&pageSize=8`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal mengambil import provider");
      const items = json.items || [];
      setProviderImports(items);
      if (autoSelectFirst && items[0]) setSelectedProviderImportId(items[0].id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Gagal mengambil import provider");
    } finally {
      setImportLoading(false);
    }
  }, [activeTab]);

  const handleImportProviderFile = async () => {
    if (!isAdmin || importing) return;
    if (!providerFile) {
      setImportError("Pilih file Excel provider terlebih dahulu");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      const formData = new FormData();
      formData.set("provider", activeTab);
      formData.set("startDate", startDate);
      formData.set("endDate", endDate);
      if (loketCode) formData.set("loketCode", loketCode);
      formData.set("file", providerFile);
      const response = await fetch("/api/rekonsiliasi/imports", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal import file provider");
      setProviderFile(null);
      setSelectedProviderImportId(Number(json.importId));
      await fetchProviderImports();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Gagal import file provider");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!isAdmin || generatingBatch) return;
    if (!selectedProviderImportId) {
      setBatchError("Pilih import Excel provider sebelum generate batch");
      return;
    }
    setGeneratingBatch(true);
    setBatchError("");
    try {
      const response = await fetch("/api/rekonsiliasi/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: activeTab, providerImportId: selectedProviderImportId, startDate, endDate, loketCode: loketCode || undefined }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal generate batch rekonsiliasi");
      setSelectedBatch(null);
      await fetchBatches(true);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Gagal generate batch rekonsiliasi");
    } finally {
      setGeneratingBatch(false);
    }
  };

  const updateExceptionItem = async (item: ReconciliationExceptionItem, status: "RESOLVED" | "IGNORED") => {
    if (!selectedBatch || !isAdmin) return;
    const note = window.prompt(status === "RESOLVED" ? "Catatan penyelesaian:" : "Alasan diabaikan:", item.note || "");
    if (note === null) return;
    try {
      const response = await fetch(`/api/rekonsiliasi/batches/${selectedBatch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, status, note }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal update item");
      setExceptionItems(json.items || []);
      await fetchBatches();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Gagal update item");
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelectedBatch(null);
    setExceptionItems([]);
    void fetchBatches(true);
  }, [fetchBatches]);

  useEffect(() => {
    setSelectedProviderImportId(null);
    setProviderFile(null);
    void fetchProviderImports(true);
  }, [fetchProviderImports]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (loketDropdownRef.current && !loketDropdownRef.current.contains(event.target as Node)) {
        setLoketDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTabChange = (tab: ProviderTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleApplyFilter = () => {
    setPage(1);
    void fetchData();
  };

  const handleResetFilter = () => {
    setStartDate(getToday());
    setEndDate(getToday());
    setLoketCode("");
    setLoketSearch("");
    setLoketDropdownOpen(false);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const response = await fetch(`/api/rekonsiliasi/export?${queryString}`);
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "Gagal mengunduh file rekonsiliasi");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^\"]+)"?/i);
      const filename = filenameMatch?.[1] || `rekonsiliasi_${activeTab}.xls`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengunduh file rekonsiliasi";
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rekonsiliasi Data</h2>
          <p className="text-slate-500">
            Rekonsiliasi transaksi sukses dengan file Excel provider sebagai data pembanding.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleTabChange("pdam")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === "pdam"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            PDAM Native
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("lunasin")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeTab === "lunasin"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Lunasin
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Tanggal Mulai</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Tanggal Akhir</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Loket</label>
            <div className="relative" ref={loketDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setLoketDropdownOpen((prev) => !prev);
                  setLoketSearch("");
                }}
                className="flex h-11 w-full items-center rounded-lg border border-slate-200 bg-white px-3 pr-10 text-left text-sm outline-none transition hover:border-slate-300 focus:border-primary dark:border-slate-700 dark:bg-slate-950"
              >
                <span className="truncate">{selectedLoketLabel}</span>
              </button>
              <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                expand_more
              </span>

              {loketDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-100 p-2 dark:border-slate-800">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-slate-400">
                        search
                      </span>
                      <input
                        type="text"
                        value={loketSearch}
                        onChange={(e) => setLoketSearch(e.target.value)}
                        placeholder="Cari nama / kode loket..."
                        autoFocus
                        className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setLoketCode("");
                        setLoketDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        !loketCode ? "bg-primary/5 font-bold text-primary" : ""
                      }`}
                    >
                      <span>Semua Loket</span>
                      {!loketCode && <span className="material-symbols-outlined text-base text-primary">check</span>}
                    </button>

                    {filteredLoketList.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">Loket tidak ditemukan</div>
                    ) : (
                      filteredLoketList.map((loket) => {
                        const isSelected = loketCode === loket.loketCode;
                        return (
                          <button
                            key={loket.loketCode}
                            type="button"
                            onClick={() => {
                              setLoketCode(loket.loketCode);
                              setLoketDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                              isSelected ? "bg-primary/5 font-bold text-primary" : ""
                            }`}
                          >
                            <span className="truncate">
                              {loket.nama}
                              <span className="ml-1.5 text-xs text-slate-400">{loket.loketCode}</span>
                            </span>
                            {isSelected && <span className="material-symbols-outlined text-base text-primary">check</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleApplyFilter}
              className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90"
            >
              Terapkan Filter
            </button>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleResetFilter}
              className="h-11 flex-1 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="h-11 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              {exporting ? "Mengunduh..." : "Excel"}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={handleGenerateBatch}
                disabled={generatingBatch || !selectedProviderImportId}
                className="h-11 flex-1 rounded-lg border border-primary/20 bg-primary/10 px-4 text-sm font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                title={!selectedProviderImportId ? "Pilih import Excel provider terlebih dahulu" : undefined}
              >
                {generatingBatch ? "Generate..." : "Batch"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Transaksi</p>
          <p className="mt-2 text-lg font-bold leading-tight">{loading ? "..." : formatNumber(summary?.totalTransaksi ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Tagihan</p>
          <p className="mt-2 text-lg font-bold leading-tight">{loading ? "..." : formatRupiah(summary?.totalTagihan ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Admin</p>
          <p className="mt-2 text-lg font-bold leading-tight">{loading ? "..." : formatRupiah(summary?.totalAdmin ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Nominal</p>
          <p className="mt-2 text-lg font-bold leading-tight">{loading ? "..." : formatRupiah(summary?.totalNominal ?? 0)}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-2">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">Import Excel Provider</h3>
            <p className="text-xs text-slate-400">Upload file settlement/laporan provider sebagai data pembanding batch.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <div className="mb-2 font-black uppercase tracking-wide text-slate-500">Format kolom</div>
            <div className="space-y-1">
              <p><b>Wajib:</b> `TOTAL_PROVIDER` dan salah satu dari `KODE_TRANSAKSI` / `ID_PELANGGAN`.</p>
              <p><b>Disarankan:</b> `PRODUK`, `PERIODE`, `KODE_LOKET`, `REF_PROVIDER`, `STATUS_PROVIDER`.</p>
              <p><b>Nominal:</b> `NOMINAL_TAGIHAN`, `ADMIN`, `TOTAL_PROVIDER`.</p>
            </div>
          </div>

          {isAdmin ? (
            <div className="mt-4 space-y-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setProviderFile(e.target.files?.[0] || null)}
                className="block w-full rounded-lg border border-slate-200 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-primary dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleImportProviderFile}
                disabled={importing || !providerFile}
                className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importing ? "Mengimport..." : "Import File Provider"}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400 dark:border-slate-700">Import hanya tersedia untuk admin.</div>
          )}

          {importError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {importError}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Data Provider Terimport</h3>
              <p className="text-xs text-slate-400">Pilih salah satu import sebagai pembanding saat generate batch.</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchProviderImports()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {importLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Memuat import provider...</div>
            ) : providerImports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
                Belum ada file provider yang diimport untuk provider aktif.
              </div>
            ) : providerImports.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedProviderImportId(item.id)}
                className={`w-full rounded-xl border p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedProviderImportId === item.id ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">#{item.id} · {item.originalFilename || "file provider"}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.startDate} s/d {item.endDate} · {item.loketCode || "Semua Loket"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${item.invalidRows > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                    {item.validRows}/{item.totalRows} valid
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">Total provider {formatRupiah(item.totalProvider)} · import oleh {item.importedBy || "-"}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Batch Rekonsiliasi</h3>
              <p className="text-xs text-slate-400">Histori hasil generate untuk provider aktif.</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchBatches()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          {batchError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {batchError}
            </div>
          )}

          <div className="space-y-2">
            {batchLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Memuat batch...</div>
            ) : batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
                Belum ada batch. Import file provider, pilih import, lalu klik <b>Batch</b>.
              </div>
            ) : batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => void loadBatch(batch)}
                className={`w-full rounded-xl border p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedBatch?.id === batch.id ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-sm">#{batch.id} · {batch.provider.toUpperCase()}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${batch.exceptionCount > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                    {batch.exceptionCount} exception
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{batch.startDate} s/d {batch.endDate} · import #{batch.providerImportId || "-"} · {batch.totalItems} item · match {batch.matchCount}</div>
                <div className="mt-1 text-xs text-slate-400">Internal {formatRupiah(batch.totalInternal)} · Provider {formatRupiah(batch.totalProvider)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 xl:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Exception Queue</h3>
              <p className="text-xs text-slate-400">Item selisih atau tidak ditemukan antara internal dan file provider.</p>
            </div>
            {selectedBatch && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Batch #{selectedBatch.id}
              </span>
            )}
          </div>

          {!selectedBatch ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400 dark:border-slate-700">
              Pilih batch untuk melihat exception.
            </div>
          ) : exceptionItems.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              Tidak ada exception aktif untuk batch ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Transaksi</th>
                    <th className="px-4 py-3 font-semibold text-right">Internal</th>
                    <th className="px-4 py-3 font-semibold text-right">Provider</th>
                    <th className="px-4 py-3 font-semibold text-right">Selisih</th>
                    <th className="px-4 py-3 font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exceptionItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-black ${item.matchStatus === "SELISIH_NOMINAL" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : item.matchStatus === "TIDAK_ADA_DI_PROVIDER" || item.matchStatus === "TIDAK_ADA_DI_INTERNAL" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : item.matchStatus === "NEED_REVIEW" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                          {item.matchStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100">{item.transactionCode || "-"}</div>
                        <div className="text-slate-400">{item.customerName || item.customerId || "-"} · {item.loketCode || "-"}</div>
                        {item.note && <div className="mt-1 text-[11px] text-primary">{item.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatRupiah(item.internalTotal)}</td>
                      <td className="px-4 py-3 text-right">{formatRupiah(item.providerTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{formatRupiah(item.differenceAmount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isAdmin ? (
                          <div className="flex gap-2">
                            <button onClick={() => void updateExceptionItem(item, "RESOLVED")} className="font-bold text-emerald-600 hover:underline">Resolve</button>
                            <button onClick={() => void updateExceptionItem(item, "IGNORED")} className="font-bold text-slate-500 hover:underline">Ignore</button>
                          </div>
                        ) : (
                          <span className="text-slate-400">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Preview {activeTab === "pdam" ? "PDAM Native" : "Lunasin"}
            </h3>
            <p className="text-xs text-slate-400">
              Hanya menampilkan transaksi sukses/lunas sesuai filter aktif.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {loading ? "..." : `${formatNumber(data?.total ?? 0)} transaksi`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
              {activeTab === "pdam" ? (
                <tr>
                  <th className="px-6 py-4 font-semibold">Tanggal</th>
                  <th className="px-6 py-4 font-semibold">Kode Transaksi</th>
                  <th className="px-6 py-4 font-semibold">ID Pelanggan</th>
                  <th className="px-6 py-4 font-semibold">Nama</th>
                  <th className="px-6 py-4 font-semibold">Periode</th>
                  <th className="px-6 py-4 font-semibold">Loket</th>
                  <th className="px-6 py-4 font-semibold">Kasir</th>
                  <th className="px-6 py-4 font-semibold text-right">Sub Total</th>
                  <th className="px-6 py-4 font-semibold text-right">Biaya Admin</th>
                  <th className="px-6 py-4 font-semibold text-right">Total</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 font-semibold">Tanggal</th>
                  <th className="px-6 py-4 font-semibold">Kode Transaksi</th>
                  <th className="px-6 py-4 font-semibold">Pelanggan</th>
                  <th className="px-6 py-4 font-semibold">Produk</th>
                  <th className="px-6 py-4 font-semibold">Sheet Export</th>
                  <th className="px-6 py-4 font-semibold">Loket</th>
                  <th className="px-6 py-4 font-semibold">Kasir</th>
                  <th className="px-6 py-4 font-semibold text-right">Total</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={activeTab === "pdam" ? 10 : 8} className="px-6 py-12 text-center text-slate-400">
                    Memuat data rekonsiliasi...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "pdam" ? 10 : 8} className="px-6 py-12 text-center text-slate-400">
                    Tidak ada transaksi sukses yang sesuai dengan filter.
                  </td>
                </tr>
              ) : activeTab === "pdam" ? (
                (rows as PdamPreviewRow[]).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-6 py-4">{row.transactionDate}</td>
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">{row.transactionCode}</td>
                    <td className="px-6 py-4">{row.customerId}</td>
                    <td className="px-6 py-4">{row.customerName}</td>
                    <td className="px-6 py-4">{row.periodLabel}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{row.loketName}</div>
                      <div className="text-[11px] text-slate-400">{row.loketCode}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{row.username}</div>
                      <div className="text-[11px] text-slate-400">{row.jenisLoket}</div>
                    </td>
                    <td className="px-6 py-4 text-right">{formatRupiah(row.amount)}</td>
                    <td className="px-6 py-4 text-right">{formatRupiah(row.adminFee)}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatRupiah(row.total)}</td>
                  </tr>
                ))
              ) : (
                (rows as LunasinPreviewRow[]).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-6 py-4">{row.transactionDate}</td>
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">{row.transactionCode}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{row.customerName}</div>
                      <div className="text-[11px] text-slate-400">{row.customerId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{row.productLabel}</div>
                      <div className="text-[11px] text-slate-400">{row.productCode}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
                        {row.sheetName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{row.loketName}</div>
                      <div className="text-[11px] text-slate-400">{row.loketCode}</div>
                    </td>
                    <td className="px-6 py-4">{row.username}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatRupiah(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm dark:border-slate-800">
          <span className="text-slate-400">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
        {activeTab === "pdam"
          ? "Ekspor PDAM Native menghasilkan 1 sheet detail transaksi sukses."
          : "Ekspor Lunasin dipisah per sheet: Postpaid, Prepaid, BPJS, Telkom, Pulsa, Paket Data, PDAM Lunasin, dan Lainnya."}
      </div>
    </div>
  );
}
