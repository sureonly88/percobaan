"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { canWrite, normalizeRole } from "@/lib/rbac";

interface LoketPerf {
  trx: number;
  nominal: number;
}

interface LoketData {
  loketCode: string;
  nama: string;
  alamat: string;
  status: "aktif" | "nonaktif";
  jenis: string;
  pulsa: number;
  biayaAdmin: number;
  isBlok: boolean;
  blokMessage: string;
  byadmin: string;
  createdAt: string;
  bulanIni: LoketPerf;
  bulanLalu: LoketPerf;
  total: LoketPerf;
  growth: number;
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString("id-ID");
}

export default function LoketPage() {
  const { data: session } = useSession();
  const userRole = normalizeRole((session?.user as { role?: string })?.role || "");
  const isWritable = canWrite(userRole);

  const [lokets, setLokets] = useState<LoketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"semua" | "aktif" | "nonaktif">("semua");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    loketCode: "", nama: "", alamat: "", jenis: "KASIR", pulsa: 0, biayaAdmin: 2500,
    isBlok: false, blokMessage: "", byadmin: "",
  });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoket, setDetailLoket] = useState<LoketData | null>(null);
  const [detailTrx, setDetailTrx] = useState<Array<{
    id: number; jenis: string; idPelanggan: string; nama: string;
    periode: string; tagihan: number; admin: number; total: number;
    username: string; tanggal: string; status: string;
  }>>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const detailPerPage = 10;

  const fetchLokets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/loket");
      const json = await res.json();
      setLokets(json.lokets ?? []);
    } catch (err) {
      console.error("Fetch loket error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLokets();
  }, [fetchLokets]);

  // Filtered data
  const filtered = lokets.filter((l) => {
    const matchSearch =
      l.nama.toLowerCase().includes(search.toLowerCase()) ||
      l.loketCode.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "semua" || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * perPage, currentPage * perPage),
    [filtered, currentPage]
  );

  // Reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus]);

  // Summary
  const totalLoket = lokets.length;
  const loketAktif = lokets.filter((l) => l.status === "aktif").length;
  const totalTrxBulanIni = lokets.reduce((a, l) => a + l.bulanIni.trx, 0);
  const totalNominalBulanIni = lokets.reduce((a, l) => a + l.bulanIni.nominal, 0);

  // Modal handlers
  const openAdd = () => {
    setEditMode(false);
    setFormData({ loketCode: "", nama: "", alamat: "", jenis: "KASIR", pulsa: 0, biayaAdmin: 2500, isBlok: false, blokMessage: "", byadmin: "" });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (l: LoketData) => {
    setEditMode(true);
    setFormData({
      loketCode: l.loketCode, nama: l.nama, alamat: l.alamat,
      jenis: l.jenis || "KASIR", pulsa: l.pulsa || 0, biayaAdmin: l.biayaAdmin ?? 2500,
      isBlok: l.isBlok || false, blokMessage: l.blokMessage || "", byadmin: l.byadmin || "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);

    try {
      const res = await fetch("/api/loket", {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Terjadi kesalahan");
      } else {
        setModalOpen(false);
        fetchLokets();
      }
    } catch {
      setFormError("Gagal menyimpan data");
    } finally {
      setFormLoading(false);
    }
  };

  const toggleStatus = async (l: LoketData) => {
    const newStatus = l.status === "aktif" ? "nonaktif" : "aktif";
    try {
      await fetch("/api/loket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loketCode: l.loketCode, status: newStatus }),
      });
      fetchLokets();
    } catch (err) {
      console.error("Toggle status error:", err);
    }
  };

  // Detail handler
  const openDetail = async (l: LoketData) => {
    setDetailLoket(l);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailPage(1);
    try {
      const params = new URLSearchParams({ loketCode: l.loketCode });
      const res = await fetch(`/api/laporan/detail?${params.toString()}`);
      const json = await res.json();
      setDetailTrx(json.detail ?? []);
    } catch {
      setDetailTrx([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailTotalPages = Math.max(1, Math.ceil(detailTrx.length / detailPerPage));
  const paginatedDetail = detailTrx.slice(
    (detailPage - 1) * detailPerPage,
    detailPage * detailPerPage
  );

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold">Manajemen Loket</h2>
          <p className="text-slate-500">Kelola daftar loket pembayaran dan pantau performa.</p>
        </div>
        {isWritable && (
        <button
          onClick={openAdd}
          className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-primary/20 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Tambah Loket
        </button>
        )}
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <span className="material-symbols-outlined text-2xl">store</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Loket</p>
            <p className="text-xl font-bold">{totalLoket}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">check_circle</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Loket Aktif</p>
            <p className="text-xl font-bold">{loketAktif}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">receipt_long</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Trx Bulan Ini</p>
            <p className="text-xl font-bold">{formatNumber(totalTrxBulanIni)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">payments</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Nominal Bulan Ini</p>
            <p className="text-xl font-bold">{formatRupiah(totalNominalBulanIni)}</p>
          </div>
        </div>
      </section>

      {/* Filter */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Cari nama atau kode loket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <select
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "semua" | "aktif" | "nonaktif")}
          >
            <option value="semua">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
        </div>
        <button
          onClick={fetchLokets}
          className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh
        </button>
      </div>

      {/* Result count */}
      {!loading && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-slate-400">
            Menampilkan <span className="font-bold text-slate-600 dark:text-slate-300">{filtered.length}</span> dari {lokets.length} loket
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Loket</th>
                <th className="px-6 py-4 font-semibold">Jenis</th>
                <th className="px-6 py-4 font-semibold">Saldo</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Trx Bulan Ini</th>
                <th className="px-6 py-4 font-semibold">Nominal Bulan Ini</th>
                <th className="px-6 py-4 font-semibold">Growth</th>
                <th className="px-6 py-4 font-semibold">Total Trx</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      <span className="text-sm">Memuat data...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada loket ditemukan.
                  </td>
                </tr>
              ) : (
                paginated.map((l) => (
                  <tr key={l.loketCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                          <span className="material-symbols-outlined">store</span>
                        </div>
                        <div>
                          <p className="font-bold text-sm">{l.nama}</p>
                          <p className="text-xs text-slate-400">{l.loketCode}</p>
                          {l.alamat && <p className="text-xs text-slate-400 mt-0.5">{l.alamat}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] font-black rounded uppercase ${
                        l.jenis === "ANDROID"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : l.jenis === "PM"
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                          : l.jenis === "SWITCHER"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}>
                        {l.jenis || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{formatRupiah(l.pulsa)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] font-black rounded uppercase ${
                        l.status === "aktif"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{formatNumber(l.bulanIni.trx)} <span className="text-xs font-normal text-slate-400">trx</span></p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{formatRupiah(l.bulanIni.nominal)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {l.growth !== 0 && (
                          <span className={`material-symbols-outlined text-sm ${l.growth > 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {l.growth > 0 ? "trending_up" : "trending_down"}
                          </span>
                        )}
                        <span className={`text-sm font-bold ${
                          l.growth > 0 ? "text-emerald-600" : l.growth < 0 ? "text-red-600" : "text-slate-400"
                        }`}>
                          {l.growth > 0 ? "+" : ""}{l.growth}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{formatNumber(l.total.trx)}</p>
                      <p className="text-xs text-slate-400">{formatRupiah(l.total.nominal)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDetail(l)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Detail transaksi"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        {isWritable && (<>
                        <button
                          onClick={() => openEdit(l)}
                          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit loket"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => toggleStatus(l)}
                          className={`p-2 rounded-lg transition-colors ${
                            l.status === "aktif"
                              ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          }`}
                          title={l.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                        >
                          <span className="material-symbols-outlined text-lg">
                            {l.status === "aktif" ? "block" : "check_circle"}
                          </span>
                        </button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > perPage && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Halaman <span className="font-bold text-slate-700 dark:text-slate-300">{currentPage}</span> dari {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Halaman pertama"
              >
                <span className="material-symbols-outlined text-lg">first_page</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Sebelumnya"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  typeof p === "string" ? (
                    <span key={`dot-${i}`} className="px-2 text-slate-400">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                        currentPage === p
                          ? "bg-primary text-white shadow-md shadow-primary/20"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Selanjutnya"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Halaman terakhir"
              >
                <span className="material-symbols-outlined text-lg">last_page</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center rounded-t-2xl sticky top-0 z-10">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editMode ? "Edit Loket" : "Tambah Loket Baru"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">error</span>
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Kode Loket
                </label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
                  value={formData.loketCode}
                  onChange={(e) => setFormData({ ...formData, loketCode: e.target.value.toUpperCase() })}
                  placeholder="Contoh: LKT003"
                  required
                  disabled={editMode}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Nama Loket
                </label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Nama loket pembayaran"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Alamat <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  placeholder="Alamat loket"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Jenis Loket
                  </label>
                  <div className="relative">
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-10 py-3 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      value={formData.jenis}
                      onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                    >
                      <option value="KASIR">KASIR</option>
                      <option value="ANDROID">ANDROID</option>
                      <option value="PM">PM</option>
                      <option value="SWITCHER">SWITCHER</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Saldo / Pulsa
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-500 cursor-not-allowed"
                    value={formatRupiah(formData.pulsa)}
                    readOnly
                    disabled
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">info</span>
                    Gunakan menu <span className="font-bold text-primary">Update Saldo Loket</span> untuk mengubah saldo
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Biaya Admin <span className="font-normal text-slate-400">per tagihan</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">Rp</span>
                  <input
                    type="text"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-500 cursor-not-allowed"
                    value={formData.biayaAdmin.toLocaleString("id-ID")}
                    readOnly
                    disabled
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">info</span>
                  Biaya admin dikelola melalui menu khusus
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Dikelola oleh <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={formData.byadmin}
                  onChange={(e) => setFormData({ ...formData, byadmin: e.target.value })}
                  placeholder="Nama admin pengelola"
                />
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Blokir Loket
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isBlok: !formData.isBlok, blokMessage: !formData.isBlok ? formData.blokMessage : "" })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      formData.isBlok ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.isBlok ? "translate-x-5" : ""
                    }`} />
                  </button>
                </div>
                {formData.isBlok && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Pesan Blokir
                    </label>
                    <input
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400"
                      value={formData.blokMessage}
                      onChange={(e) => setFormData({ ...formData, blokMessage: e.target.value })}
                      placeholder="Alasan pemblokiran..."
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-md shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {formLoading ? (
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">{editMode ? "save" : "add"}</span>
                      {editMode ? "Simpan" : "Tambah"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailOpen && detailLoket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Detail Transaksi — {detailLoket.nama}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Kode: {detailLoket.loketCode}</p>
              </div>
              <button
                onClick={() => setDetailOpen(false)}
                className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium">Bulan Ini</p>
                <p className="text-lg font-bold mt-1">{formatNumber(detailLoket.bulanIni.trx)} trx</p>
                <p className="text-sm text-primary font-semibold">{formatRupiah(detailLoket.bulanIni.nominal)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium">Bulan Lalu</p>
                <p className="text-lg font-bold mt-1">{formatNumber(detailLoket.bulanLalu.trx)} trx</p>
                <p className="text-sm text-slate-500 font-semibold">{formatRupiah(detailLoket.bulanLalu.nominal)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium">Total Keseluruhan</p>
                <p className="text-lg font-bold mt-1">{formatNumber(detailLoket.total.trx)} trx</p>
                <p className="text-sm text-emerald-600 font-semibold">{formatRupiah(detailLoket.total.nominal)}</p>
              </div>
            </div>

            {/* Transaction table */}
            <div className="overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="flex flex-col items-center gap-2 text-slate-400 py-12">
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span className="text-sm">Memuat transaksi...</span>
                </div>
              ) : paginatedDetail.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-12">
                  Belum ada transaksi untuk loket ini.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Jenis</th>
                      <th className="px-6 py-3 font-semibold">Pelanggan</th>
                      <th className="px-6 py-3 font-semibold">Periode</th>
                      <th className="px-6 py-3 font-semibold">Tagihan</th>
                      <th className="px-6 py-3 font-semibold">Admin</th>
                      <th className="px-6 py-3 font-semibold">Total</th>
                      <th className="px-6 py-3 font-semibold">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    {paginatedDetail.map((t, i) => (
                      <tr key={`${t.id}-${t.jenis}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 text-[10px] font-black rounded ${
                            t.jenis === "PDAM"
                              ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}>
                            {t.jenis}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <p className="font-medium">{t.nama}</p>
                          <p className="text-xs text-slate-400">{t.idPelanggan}</p>
                        </td>
                        <td className="px-6 py-3 text-slate-500">{t.periode}</td>
                        <td className="px-6 py-3">{formatRupiah(t.tagihan)}</td>
                        <td className="px-6 py-3 text-slate-500">{formatRupiah(t.admin)}</td>
                        <td className="px-6 py-3 font-bold">{formatRupiah(t.total)}</td>
                        <td className="px-6 py-3 text-slate-500 text-xs">
                          {t.tanggal ? new Date(t.tanggal).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          }) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {detailTotalPages > 1 && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
                <span className="text-xs text-slate-400">{detailTrx.length} transaksi</span>
                <nav className="flex items-center gap-1">
                  <button
                    className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                    disabled={detailPage === 1}
                    onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>
                  {Array.from({ length: detailTotalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === detailTotalPages || Math.abs(p - detailPage) <= 1)
                    .map((page, idx, arr) => (
                      <React.Fragment key={page}>
                        {idx > 0 && arr[idx - 1] !== page - 1 && (
                          <span className="text-xs text-slate-400">…</span>
                        )}
                        <button
                          onClick={() => setDetailPage(page)}
                          className={detailPage === page
                            ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold"
                            : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                          }
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                    disabled={detailPage === detailTotalPages}
                    onClick={() => setDetailPage((p) => Math.min(detailTotalPages, p + 1))}
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
