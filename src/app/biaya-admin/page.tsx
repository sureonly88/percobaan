"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";

interface LoketBiaya {
  loketCode: string;
  nama: string;
  jenis: string;
  status: "aktif" | "nonaktif";
  biayaAdmin: number;
  plnAdminTier: number;
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

const PRESET_VALUES = [0, 1500, 2000, 2500, 3000, 3500, 5000];
const PLN_ADMIN_PRESETS = [2000, 2500, 3000, 3500, 4000, 5000];

export default function BiayaAdminPage() {
  const [lokets, setLokets] = useState<LoketBiaya[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  // Search & pagination
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 6;

  // Bulk
  const [bulkValue, setBulkValue] = useState(2500);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState("");

  // PLN Admin Tier
  const [plnTierValue, setPlnTierValue] = useState(3000);
  const [plnTierSaving, setPlnTierSaving] = useState(false);
  const [plnTierSuccess, setPlnTierSuccess] = useState("");

  const fetchLokets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/loket");
      const json = await res.json();
      const data: LoketBiaya[] = (json.lokets ?? []).map((l: LoketBiaya) => ({
        loketCode: l.loketCode,
        nama: l.nama,
        jenis: l.jenis,
        status: l.status,
        biayaAdmin: l.biayaAdmin,
        plnAdminTier: l.plnAdminTier ?? 3000,
      }));
      setLokets(data);
      const vals: Record<string, number> = {};
      for (const l of data) vals[l.loketCode] = l.biayaAdmin;
      setEditValues(vals);
      // Set PLN tier from first loket (global setting)
      if (data.length > 0) setPlnTierValue(data[0].plnAdminTier);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLokets();
  }, [fetchLokets]);

  const filtered = useMemo(() => {
    if (!search.trim()) return lokets;
    const q = search.toLowerCase();
    return lokets.filter(
      (l) => l.nama.toLowerCase().includes(q) || l.loketCode.toLowerCase().includes(q)
    );
  }, [lokets, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * perPage, currentPage * perPage),
    [filtered, currentPage]
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const saveOne = async (loketCode: string) => {
    setSavingCode(loketCode);
    setSuccessCode(null);
    try {
      const res = await fetch("/api/loket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loketCode, biayaAdmin: editValues[loketCode] }),
      });
      if (res.ok) {
        setSuccessCode(loketCode);
        setTimeout(() => setSuccessCode(null), 2000);
        // Update local state
        setLokets((prev) =>
          prev.map((l) =>
            l.loketCode === loketCode ? { ...l, biayaAdmin: editValues[loketCode] } : l
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setSavingCode(null);
    }
  };

  const saveBulk = async () => {
    setBulkSaving(true);
    setBulkSuccess("");
    try {
      const promises = lokets.map((l) =>
        fetch("/api/loket", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loketCode: l.loketCode, biayaAdmin: bulkValue }),
        })
      );
      await Promise.all(promises);
      setBulkSuccess("Semua loket berhasil diperbarui");
      setTimeout(() => setBulkSuccess(""), 3000);
      // Update local
      setLokets((prev) => prev.map((l) => ({ ...l, biayaAdmin: bulkValue })));
      const vals: Record<string, number> = {};
      for (const l of lokets) vals[l.loketCode] = bulkValue;
      setEditValues(vals);
    } catch {
      // ignore
    } finally {
      setBulkSaving(false);
    }
  };

  const savePlnTier = async () => {
    setPlnTierSaving(true);
    setPlnTierSuccess("");
    try {
      const promises = lokets.map((l) =>
        fetch("/api/loket", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loketCode: l.loketCode, plnAdminTier: plnTierValue }),
        })
      );
      await Promise.all(promises);
      setPlnTierSuccess("Admin PLN berhasil diperbarui ke semua loket");
      setTimeout(() => setPlnTierSuccess(""), 3000);
      setLokets((prev) => prev.map((l) => ({ ...l, plnAdminTier: plnTierValue })));
    } catch {
      // ignore
    } finally {
      setPlnTierSaving(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold">Biaya Admin</h2>
          <p className="text-slate-500">Atur biaya administrasi PDAM per loket dan admin PLN (Lunasin).</p>
        </div>
      </header>

      {/* Bulk Update */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <span className="material-symbols-outlined text-2xl">tune</span>
          </div>
          <div>
            <h3 className="font-bold">Atur Semua Sekaligus</h3>
            <p className="text-sm text-slate-500 mt-0.5">Terapkan biaya admin yang sama ke seluruh loket.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {PRESET_VALUES.map((val) => (
              <button
                key={val}
                onClick={() => setBulkValue(val)}
                className={`py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all ${
                  bulkValue === val
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary/40"
                }`}
              >
                {formatRupiah(val)}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rp</span>
            <input
              type="number"
              className="w-32 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary"
              value={bulkValue}
              onChange={(e) => setBulkValue(Math.max(0, Number(e.target.value)))}
              min={0}
              step={500}
            />
          </div>
          <button
            onClick={saveBulk}
            disabled={bulkSaving}
            className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2 rounded-lg shadow-md shadow-primary/20 transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {bulkSaving ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base">published_with_changes</span>
            )}
            Terapkan Semua
          </button>
        </div>
        {bulkSuccess && (
          <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {bulkSuccess}
          </div>
        )}
      </div>

      {/* PLN Admin Tier */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">bolt</span>
          </div>
          <div>
            <h3 className="font-bold">Admin PLN (Lunasin)</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Pilih tier biaya admin PLN yang menentukan kode produk Lunasin.
              Contoh: tier 3000 → <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">pln-postpaid-3000</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {PLN_ADMIN_PRESETS.map((val) => (
              <button
                key={val}
                onClick={() => setPlnTierValue(val)}
                className={`py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all ${
                  plnTierValue === val
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-amber-400/40"
                }`}
              >
                {formatRupiah(val)}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rp</span>
            <input
              type="number"
              className="w-32 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              value={plnTierValue}
              onChange={(e) => setPlnTierValue(Math.max(0, Number(e.target.value)))}
              min={0}
              step={500}
            />
          </div>
          <button
            onClick={savePlnTier}
            disabled={plnTierSaving}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2 rounded-lg shadow-md shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {plnTierSaving ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base">published_with_changes</span>
            )}
            Terapkan Semua
          </button>
        </div>
        {plnTierSuccess && (
          <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {plnTierSuccess}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            type="text"
            placeholder="Cari nama atau kode loket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
        <p className="text-sm text-slate-400">
          Menampilkan <span className="font-bold text-slate-600 dark:text-slate-300">{filtered.length}</span> dari {lokets.length} loket
        </p>
      </div>

      {/* Loket Cards */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 text-slate-400 py-12">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          <span className="text-sm">Memuat data loket...</span>
        </div>
      ) : lokets.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-12">
          Belum ada loket terdaftar.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-12">
          <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
          Tidak ada loket yang cocok dengan &ldquo;{search}&rdquo;
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((l) => {
            const isEdited = editValues[l.loketCode] !== l.biayaAdmin;
            const isSaving = savingCode === l.loketCode;
            const isSuccess = successCode === l.loketCode;

            return (
              <div
                key={l.loketCode}
                className={`bg-white dark:bg-slate-900 rounded-xl border p-5 transition-all ${
                  isSuccess
                    ? "border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-200 dark:ring-emerald-800"
                    : isEdited
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* Loket header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                      <span className="material-symbols-outlined">{l.jenis === "ANDROID" ? "phone_android" : "store"}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">{l.nama}</p>
                      <p className="text-xs text-slate-400">{l.loketCode} &middot; {l.jenis || "-"}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase ${
                    l.status === "aktif"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {l.status}
                  </span>
                </div>

                {/* Current value */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-3">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Biaya Admin Saat Ini</p>
                  <p className="text-xl font-bold text-primary mt-0.5">{formatRupiah(l.biayaAdmin)}</p>
                  <p className="text-[10px] text-slate-400">per tagihan</p>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PRESET_VALUES.map((val) => (
                    <button
                      key={val}
                      onClick={() => setEditValues({ ...editValues, [l.loketCode]: val })}
                      className={`py-1 px-2 rounded-md text-[10px] font-bold border transition-all ${
                        editValues[l.loketCode] === val
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary/40"
                      }`}
                    >
                      {formatRupiah(val)}
                    </button>
                  ))}
                </div>

                {/* Manual input + save */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rp</span>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary"
                      value={editValues[l.loketCode] ?? l.biayaAdmin}
                      onChange={(e) =>
                        setEditValues({ ...editValues, [l.loketCode]: Math.max(0, Number(e.target.value)) })
                      }
                      min={0}
                      step={500}
                    />
                  </div>
                  <button
                    onClick={() => saveOne(l.loketCode)}
                    disabled={isSaving || !isEdited}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1 ${
                      isSuccess
                        ? "bg-emerald-500 text-white"
                        : isEdited
                        ? "bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    {isSaving ? (
                      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                    ) : isSuccess ? (
                      <span className="material-symbols-outlined text-base">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-base">save</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > perPage && (
        <div className="flex items-center justify-between mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-3">
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

      {/* Info */}
      <div className="mt-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl p-5 flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-500 text-xl mt-0.5">info</span>
        <div>
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Informasi</p>
          <p className="text-sm text-amber-600 dark:text-amber-400/80 mt-1">
            Biaya admin dikenakan per tagihan yang diproses melalui loket tersebut.
            Contoh: jika loket memiliki biaya admin Rp 2.500 dan memproses 3 tagihan, biaya admin total = 3 × Rp 2.500 = Rp 7.500.
          </p>
        </div>
      </div>
    </>
  );
}
