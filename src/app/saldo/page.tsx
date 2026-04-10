"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Breadcrumb } from "@/ui";

interface LoketOption {
  id: number;
  loketCode: string;
  nama: string;
  pulsa: number;
}

interface SaldoHistory {
  id: number;
  requestCode: string;
  username: string;
  loketCode: string;
  loketNama: string;
  nominal: number;
  tanggal: string;
  keterangan: string;
  isVerified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  statusVerifikasi: string | null;
  saldoSekarang: number;
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export default function SaldoPage() {
  const [lokets, setLokets] = useState<LoketOption[]>([]);
  const [history, setHistory] = useState<SaldoHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loketListSearch, setLoketListSearch] = useState("");
  const [filterLoket, setFilterLoket] = useState("");
  const [loketDropdownOpen, setLoketDropdownOpen] = useState(false);
  const [loketSearch, setLoketSearch] = useState("");
  const loketDropdownRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [modalLoket, setModalLoket] = useState<LoketOption | null>(null);
  const [tipe, setTipe] = useState<"topup" | "deduct">("topup");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Pagination - loket
  const [loketPage, setLoketPage] = useState(1);
  const loketPerPage = 8;

  // Pagination - history
  const [page, setPage] = useState(1);
  const perPage = 10;

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterLoket) params.set("loketCode", filterLoket);
      const res = await fetch(`/api/saldo?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLokets(data.lokets || []);
        setHistory(data.history || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterLoket]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close loket dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (loketDropdownRef.current && !loketDropdownRef.current.contains(e.target as Node)) {
        setLoketDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function openModal(loket: LoketOption) {
    setModalLoket(loket);
    setTipe("topup");
    setNominal("");
    setKeterangan("");
    setSuccessMessage("");
  }

  function closeModal() {
    setModalLoket(null);
    setSuccessMessage("");
  }

  const filteredLoketList = lokets.filter(
    (l) => l.nama.toLowerCase().includes(loketSearch.toLowerCase()) || l.loketCode.toLowerCase().includes(loketSearch.toLowerCase())
  );

  const filteredLokets = lokets.filter(
    (l) =>
      l.nama.toLowerCase().includes(loketListSearch.toLowerCase()) ||
      l.loketCode.toLowerCase().includes(loketListSearch.toLowerCase())
  );

  const filterLoketLabel = filterLoket
    ? lokets.find((l) => l.loketCode === filterLoket)?.nama || filterLoket
    : "Semua Loket";

  const totalLoketPages = Math.max(1, Math.ceil(filteredLokets.length / loketPerPage));
  const paginatedLokets = filteredLokets.slice((loketPage - 1) * loketPerPage, loketPage * loketPerPage);

  const totalPages = Math.ceil(history.length / perPage);
  const paginatedHistory = history.slice((page - 1) * perPage, page * perPage);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
    setLoketPage(1);
  }, [filterLoket]);

  useEffect(() => {
    setLoketPage(1);
  }, [loketListSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalLoket || !nominal || submitting) return;

    const nominalValue = Number(nominal.replace(/\D/g, ""));
    if (nominalValue <= 0) {
      alert("Nominal harus lebih dari 0");
      return;
    }

    const finalNominal = tipe === "deduct" ? -nominalValue : nominalValue;
    const action = tipe === "topup" ? "menambahkan" : "mengurangi";

    if (!confirm(`Yakin ingin ${action} saldo ${modalLoket.nama} sebesar ${formatRupiah(nominalValue)}?`)) {
      return;
    }

    setSubmitting(true);
    setSuccessMessage("");
    try {
      const res = await fetch("/api/saldo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loketCode: modalLoket.loketCode,
          nominal: finalNominal,
          keterangan: keterangan.trim() || `${tipe === "topup" ? "Top-up" : "Pengurangan"} saldo`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal memproses");
        return;
      }
      setSuccessMessage(data.message);
      setNominal("");
      setKeterangan("");
      fetchData();
    } catch {
      alert("Gagal menghubungi server");
    } finally {
      setSubmitting(false);
    }
  }

  function formatNominalInput(value: string) {
    const num = value.replace(/\D/g, "");
    if (!num) return setNominal("");
    setNominal(Number(num).toLocaleString("id-ID"));
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <>
      <div className="mb-8">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Update Saldo Loket" },
          ]}
        />
        <div className="mt-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Update Saldo Loket</h1>
          <p className="text-slate-500 mt-1">Tambah atau kurangi saldo (pulsa) loket.</p>
        </div>
      </div>

      {/* Saldo Overview Cards */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">store</span>
            Daftar Loket
          </h3>
          {filteredLokets.length > 0 && (
            <span className="text-xs text-slate-400">{filteredLokets.length} loket</span>
          )}
        </div>

        {loading && lokets.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat data loket...
          </div>
        ) : lokets.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl block mb-2">store</span>
            Tidak ada loket ditemukan
          </div>
        ) : (
          <>
            <div className="px-6 pt-5">
              <div className="relative max-w-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={loketListSearch}
                  onChange={(e) => setLoketListSearch(e.target.value)}
                  placeholder="Cari nama atau kode loket..."
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
              {paginatedLokets.map((l) => (
                <div
                  key={l.loketCode}
                  onClick={() => openModal(l)}
                  className="bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-900 text-slate-500">
                      <span className="material-symbols-outlined text-xl">store</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{l.nama}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{l.loketCode}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Saldo</p>
                    <p className={`text-lg font-black ${l.pulsa < 100000 ? "text-red-500" : "text-emerald-600"}`}>
                      {formatRupiah(l.pulsa)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {filteredLokets.length === 0 && (
              <div className="px-6 pb-6 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl block mb-2">search_off</span>
                Tidak ada loket yang cocok dengan pencarian.
              </div>
            )}

            {/* Loket Pagination */}
            {filteredLokets.length > 0 && totalLoketPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Menampilkan {(loketPage - 1) * loketPerPage + 1}–{Math.min(loketPage * loketPerPage, filteredLokets.length)} dari {filteredLokets.length} loket
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLoketPage((p) => Math.max(1, p - 1))}
                    disabled={loketPage === 1}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  {Array.from({ length: totalLoketPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalLoketPages || Math.abs(p - loketPage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`dots-${idx}`} className="px-2 text-slate-400 text-sm">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setLoketPage(p)}
                          className={`min-w-[36px] px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            loketPage === p
                              ? "bg-primary text-white"
                              : "border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setLoketPage((p) => Math.min(totalLoketPages, p + 1))}
                    disabled={loketPage === totalLoketPages}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Update Saldo */}
      {modalLoket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeModal}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{modalLoket.nama}</h3>
                  <p className="text-xs text-slate-400 font-mono">{modalLoket.loketCode}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-xl text-slate-400">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5">
              {/* Saldo Saat Ini */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl mb-5 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Saldo Saat Ini</p>
                <p className={`text-2xl font-black ${modalLoket.pulsa < 100000 ? "text-red-500" : "text-emerald-600"}`}>
                  {formatRupiah(modalLoket.pulsa)}
                </p>
              </div>

              {successMessage && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
                  <span className="material-symbols-outlined text-green-600 text-lg mt-0.5">check_circle</span>
                  <p className="text-sm text-green-700 dark:text-green-400">{successMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Tipe */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipe("topup")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                      tipe === "topup"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    Top-up
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipe("deduct")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                      tipe === "deduct"
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">remove_circle</span>
                    Kurangi
                  </button>
                </div>

                {/* Nominal */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Nominal</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-semibold">Rp</span>
                    <input
                      type="text"
                      value={nominal}
                      onChange={(e) => formatNominalInput(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2.5 text-sm font-mono font-bold focus:ring-primary focus:border-primary outline-none"
                    />
                  </div>
                </div>

                {/* Keterangan */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Keterangan</label>
                  <textarea
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    placeholder="Contoh: Top-up via transfer BCA"
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm focus:ring-primary focus:border-primary outline-none resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!nominal || submitting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      tipe === "topup"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {submitting ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        Proses...
                      </>
                    ) : (
                      tipe === "topup" ? "Top-up" : "Kurangi"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat Update Saldo — Full width */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between relative">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">history</span>
            Riwayat Update Saldo
          </h3>
          <div className="relative" ref={loketDropdownRef}>
            <button
              type="button"
              onClick={() => { setLoketDropdownOpen(!loketDropdownOpen); setLoketSearch(""); }}
              className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-3 pr-10 cursor-pointer text-left flex items-center min-w-[180px]"
            >
              <span className="truncate">{filterLoketLabel}</span>
            </button>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
            {loketDropdownOpen && (
              <div className="absolute z-50 top-full mt-1 right-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Cari loket..."
                      value={loketSearch}
                      onChange={(e) => setLoketSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setFilterLoket(""); setLoketDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                      filterLoket === "" ? "text-primary font-bold bg-primary/5" : ""
                    }`}
                  >
                    Semua Loket
                    {filterLoket === "" && <span className="material-symbols-outlined text-primary text-base">check</span>}
                  </button>
                  {filteredLoketList.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                  ) : (
                    filteredLoketList.map((l) => (
                      <button
                        key={l.loketCode}
                        type="button"
                        onClick={() => { setFilterLoket(l.loketCode); setLoketDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                          filterLoket === l.loketCode ? "text-primary font-bold bg-primary/5" : ""
                        }`}
                      >
                        <span>
                          {l.nama}
                          <span className="text-xs text-slate-400 ml-1.5">{l.loketCode}</span>
                        </span>
                        {filterLoket === l.loketCode && <span className="material-symbols-outlined text-primary text-base">check</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat riwayat...
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl block mb-2">inbox</span>
            Belum ada riwayat update saldo
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedHistory.map((h) => (
                <div key={h.id} className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      h.nominal > 0
                        ? "bg-emerald-50 dark:bg-emerald-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <span className={`material-symbols-outlined text-xl ${
                        h.nominal > 0 ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {h.nominal > 0 ? "arrow_upward" : "arrow_downward"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{h.loketNama || h.loketCode}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{h.requestCode}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">person</span>
                          {h.username}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          {formatTime(h.tanggal)}
                        </span>
                      </div>
                      {h.keterangan && (
                        <p className="text-xs text-slate-400 mt-1">{h.keterangan}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${h.nominal > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {h.nominal > 0 ? "+" : ""}{formatRupiah(h.nominal)}
                      </p>
                      {h.isVerified && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 font-bold">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Menampilkan {(page - 1) * perPage + 1}–{Math.min(page * perPage, history.length)} dari {history.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "..." ? (
                        <span key={`dots-${idx}`} className="px-2 text-slate-400 text-sm">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`min-w-[36px] px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            page === p
                              ? "bg-primary text-white"
                              : "border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="mt-12 py-10 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-slate-400 text-sm">
          © 2023 Pedami Payment. Layanan Pembayaran Terpadu Indonesia.
        </p>
      </footer>
    </>
  );
}
