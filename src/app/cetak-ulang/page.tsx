"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb } from "@/ui";
import { normalizeRole } from "@/lib/rbac";
import { printReceipt, ReceiptPrintData } from "@/lib/print-receipt";

interface ReprintItem {
  id: number;
  transactionCode: string;
  provider: string;
  productCode: string | null;
  idPelanggan: string;
  nama: string | null;
  periode: string | null;
  tagihan: number;
  admin: number;
  total: number;
  tanggal: string;
  loketCode: string;
  loketName: string;
  username: string;
}

interface LoketOption {
  loketCode: string;
  nama: string;
}

function todayLocalStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtRp(n: number): string {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s || "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CetakUlangPage() {
  const { data: session } = useSession();
  const role = normalizeRole((session?.user as { role?: string })?.role || "");
  const canSeeAll = role === "admin" || role === "supervisor";

  const today = todayLocalStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loketCode, setLoketCode] = useState("");
  const [provider, setProvider] = useState("");
  const [idpel, setIdpel] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<ReprintItem[]>([]);
  const [lokets, setLokets] = useState<LoketOption[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadLokets = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const res = await fetch("/api/loket");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.items || []);
      setLokets(
        list
          .map((l: { loket_code?: string; loketCode?: string; nama?: string }) => ({
            loketCode: l.loket_code || l.loketCode || "",
            nama: l.nama || l.loket_code || l.loketCode || "",
          }))
          .filter((l: LoketOption) => l.loketCode)
      );
    } catch {
      /* ignore */
    }
  }, [canSeeAll]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (loketCode) params.set("loketCode", loketCode);
      if (provider) params.set("provider", provider);
      if (idpel) params.set("idpel", idpel);
      if (search) params.set("search", search);
      const res = await fetch(`/api/cetak-ulang/list?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memuat data");
        setItems([]);
      } else {
        setItems(data.items || []);
        setSelected({});
        if ((data.items || []).length === 0) {
          setInfo("Tidak ada transaksi sesuai filter.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, loketCode, provider, idpel, search]);

  useEffect(() => {
    loadLokets();
  }, [loadLokets]);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    // Group by transactionCode (one struk per transactionCode)
    const map = new Map<string, ReprintItem[]>();
    items.forEach((it) => {
      const key = it.transactionCode || `id:${it.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries()).map(([code, list]) => {
      const first = list[0];
      return {
        transactionCode: code,
        items: list,
        provider: first.provider,
        idPelanggan: first.idPelanggan,
        nama: first.nama,
        loketCode: first.loketCode,
        loketName: first.loketName,
        username: first.username,
        tanggal: first.tanggal,
        totalTagihan: list.reduce((s, x) => s + Number(x.tagihan || 0), 0),
        totalAdmin: list.reduce((s, x) => s + Number(x.admin || 0), 0),
        total: list.reduce((s, x) => s + Number(x.total || 0), 0),
        itemCount: list.length,
      };
    });
  }, [items]);

  const allSelected = grouped.length > 0 && grouped.every((g) => selected[g.transactionCode]);
  const someSelected = grouped.some((g) => selected[g.transactionCode]);

  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      grouped.forEach((g) => {
        next[g.transactionCode] = true;
      });
      setSelected(next);
    }
  };

  const handleBulkPrint = async () => {
    const codes = grouped.filter((g) => selected[g.transactionCode]).map((g) => g.transactionCode);
    if (codes.length === 0) {
      setError("Pilih minimal 1 transaksi untuk dicetak.");
      return;
    }
    setPrinting(true);
    setError(null);
    setInfo(null);
    setPrintProgress({ done: 0, total: codes.length });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      try {
        const res = await fetch(
          `/api/pembayaran/reprint?transactionCode=${encodeURIComponent(code)}&reason=cetak-ulang-bulk`
        );
        const data = await res.json();
        if (!res.ok) {
          failed++;
        } else {
          await printReceipt(data as ReceiptPrintData);
          success++;
        }
      } catch {
        failed++;
      }
      setPrintProgress({ done: i + 1, total: codes.length });
      // Jeda kecil antar print agar tidak race ke print-bridge
      await new Promise((r) => setTimeout(r, 350));
    }
    setPrinting(false);
    setPrintProgress(null);
    setInfo(`Selesai cetak: ${success} sukses, ${failed} gagal dari ${codes.length} transaksi.`);
  };

  const handlePrintOne = async (code: string) => {
    try {
      const res = await fetch(
        `/api/pembayaran/reprint?transactionCode=${encodeURIComponent(code)}&reason=cetak-ulang-single`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengambil data struk");
        return;
      }
      await printReceipt(data as ReceiptPrintData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencetak");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumb items={[{ label: "Kasir & Laporan" }, { label: "Cetak Ulang Struk" }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cetak Ulang Struk (Bulk)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pilih beberapa transaksi sukses lalu cetak ulang struk sekaligus. Setiap cetak akan dicatat di audit log.
        </p>
      </div>

      {/* Filter form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tanggal Mulai</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tanggal Akhir</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">Semua</option>
              <option value="PDAM">PDAM</option>
              <option value="LUNASIN">Lunasin (PLN/BPJS/dll)</option>
            </select>
          </div>
          {canSeeAll && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Loket</label>
              <select
                value={loketCode}
                onChange={(e) => setLoketCode(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">Semua loket</option>
                {lokets.map((l) => (
                  <option key={l.loketCode} value={l.loketCode}>
                    {l.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">ID Pelanggan</label>
            <input
              type="text"
              value={idpel}
              onChange={(e) => setIdpel(e.target.value)}
              placeholder="opsional"
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cari Nama/Kode</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="nama, idpel, atau kode trx"
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={loadItems}
            disabled={loading}
            className="h-11 px-5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
          >
            {loading ? "Memuat..." : "Cari"}
          </button>
          <button
            onClick={handleBulkPrint}
            disabled={printing || !someSelected}
            className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition-all"
          >
            <span className="material-symbols-outlined text-base">print</span>
            {printing
              ? `Mencetak ${printProgress?.done || 0}/${printProgress?.total || 0}...`
              : `Cetak Pilihan (${grouped.filter((g) => selected[g.transactionCode]).length})`}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300">
          {info}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={grouped.length === 0}
                  />
                </th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Kode Transaksi</th>
                <th className="px-3 py-2 text-left">Provider</th>
                <th className="px-3 py-2 text-left">ID Pelanggan</th>
                <th className="px-3 py-2 text-left">Nama</th>
                <th className="px-3 py-2 text-center">Item</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Loket / Kasir</th>
                <th className="px-3 py-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    Tidak ada data.
                  </td>
                </tr>
              )}
              {grouped.map((g) => (
                <tr
                  key={g.transactionCode}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!selected[g.transactionCode]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [g.transactionCode]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(g.tanggal)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{g.transactionCode || "-"}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800">
                      {g.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{g.idPelanggan}</td>
                  <td className="px-3 py-2">{g.nama || "-"}</td>
                  <td className="px-3 py-2 text-center">{g.itemCount}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtRp(g.total)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>{g.loketName}</div>
                    <div className="text-slate-400">{g.username}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handlePrintOne(g.transactionCode)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                      title="Cetak struk"
                    >
                      <span className="material-symbols-outlined text-sm">print</span>
                      Cetak
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {grouped.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>{grouped.length} transaksi ditampilkan (max 500 item).</span>
            <span>
              Total nilai: <strong>{fmtRp(grouped.reduce((s, g) => s + g.total, 0))}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
