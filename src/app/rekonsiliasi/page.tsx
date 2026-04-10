"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            Rekonsiliasi transaksi sukses untuk PDAM Native dan Lunasin dengan ekspor Excel detail.
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
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    Memuat data rekonsiliasi...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
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