"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/ui";
import { printReceipt, ReceiptPrintData } from "@/lib/print-receipt";

interface RiwayatItem {
  id: number;
  transactionCode: string;
  provider: string;
  productCode: string | null;
  kategori: string;
  idPelanggan: string;
  nama: string | null;
  periode: string | null;
  tagihan: number;
  admin: number;
  total: number;
  status: string;
  tanggal: string;
  paidAt: string | null;
  failedAt: string | null;
  loketCode: string;
  loketName: string;
  username: string;
}

interface PerKategori {
  kategori: string;
  count: number;
  total: number;
}

interface Summary {
  totalTransaksi: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
  firstTransaction: string | null;
  lastTransaction: string | null;
  perKategori: PerKategori[];
}

interface ApiResponse {
  ok: boolean;
  idPelanggan: string;
  nama: string | null;
  summary: Summary;
  items: RiwayatItem[];
}

function fmtRp(n: number): string {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}
function fmtDateTime(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RiwayatPelangganPage({ params }: { params: { idpel: string } }) {
  const idpel = decodeURIComponent(params.idpel);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"SUCCESS" | "ALL">("SUCCESS");
  const [kategoriFilter, setKategoriFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pelanggan/${encodeURIComponent(idpel)}/riwayat?status=${statusFilter}&limit=300`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal memuat data");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [idpel, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (!kategoriFilter) return data.items;
    return data.items.filter((it) => it.kategori === kategoriFilter);
  }, [data, kategoriFilter]);

  const handlePrintOne = async (code: string) => {
    if (!code) {
      alert("Kode transaksi kosong, struk tidak bisa dicetak.");
      return;
    }
    try {
      const res = await fetch(
        `/api/pembayaran/reprint?transactionCode=${encodeURIComponent(code)}&reason=riwayat-pelanggan`
      );
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Gagal mengambil data struk");
        return;
      }
      await printReceipt(json as ReceiptPrintData);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mencetak");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumb
        items={[
          { label: "Pelanggan & Loket" },
          { label: "Manajemen Pelanggan", href: "/pelanggan" },
          { label: `Riwayat ${idpel}` },
        ]}
      />

      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Transaksi Pelanggan</h1>
          <p className="text-sm text-slate-500 mt-1">
            ID Pelanggan: <span className="font-mono">{idpel}</span>
            {data?.nama ? ` · ${data.nama}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/pelanggan"
            className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Kembali
          </Link>
          <button
            onClick={() => void load()}
            className="px-3 py-2 text-sm rounded-md bg-primary text-white"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-xs uppercase text-slate-500 mb-1">Total Transaksi Sukses</div>
            <div className="text-xl font-bold">{data.summary.totalTransaksi.toLocaleString("id-ID")}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-xs uppercase text-slate-500 mb-1">Total Nominal</div>
            <div className="text-xl font-bold text-emerald-600">{fmtRp(data.summary.totalNominal)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-xs uppercase text-slate-500 mb-1">Transaksi Pertama</div>
            <div className="text-sm font-semibold">{fmtDateTime(data.summary.firstTransaction)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-xs uppercase text-slate-500 mb-1">Transaksi Terakhir</div>
            <div className="text-sm font-semibold">{fmtDateTime(data.summary.lastTransaction)}</div>
          </div>
        </div>
      )}

      {/* Per kategori chips */}
      {data && data.summary.perKategori.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-4">
          <div className="text-xs uppercase text-slate-500 mb-2">Breakdown Per Kategori</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setKategoriFilter("")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                kategoriFilter === ""
                  ? "bg-primary text-white border-primary"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Semua ({data.summary.totalTransaksi})
            </button>
            {data.summary.perKategori.map((k) => (
              <button
                key={k.kategori}
                onClick={() => setKategoriFilter(k.kategori === kategoriFilter ? "" : k.kategori)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                  kategoriFilter === k.kategori
                    ? "bg-primary text-white border-primary"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
                title={`${k.count} transaksi · ${fmtRp(k.total)}`}
              >
                {k.kategori} ({k.count}) · {fmtRp(k.total)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "SUCCESS" | "ALL")}
          className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="SUCCESS">Hanya sukses</option>
          <option value="ALL">Semua status</option>
        </select>
      </div>

      {/* Timeline / Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Kategori</th>
                <th className="px-3 py-2 text-left">Produk</th>
                <th className="px-3 py-2 text-left">Periode</th>
                <th className="px-3 py-2 text-right">Tagihan</th>
                <th className="px-3 py-2 text-right">Admin</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Loket / Kasir</th>
                <th className="px-3 py-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    Memuat...
                  </td>
                </tr>
              )}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    Tidak ada riwayat transaksi.
                  </td>
                </tr>
              )}
              {filteredItems.map((it) => (
                <tr
                  key={it.id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(it.tanggal)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800">
                      {it.kategori}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{it.productCode || it.provider}</td>
                  <td className="px-3 py-2">{it.periode || "-"}</td>
                  <td className="px-3 py-2 text-right">{fmtRp(it.tagihan)}</td>
                  <td className="px-3 py-2 text-right">{fmtRp(it.admin)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtRp(it.total)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        it.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : it.status === "FAILED"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {it.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{it.loketName}</div>
                    <div className="text-slate-400">{it.username}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {it.status === "SUCCESS" && (
                      <button
                        onClick={() => handlePrintOne(it.transactionCode)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Cetak ulang struk"
                      >
                        <span className="material-symbols-outlined text-sm">print</span>
                        Cetak
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredItems.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>{filteredItems.length} transaksi</span>
            <span>
              Total nilai ditampilkan:{" "}
              <strong>{fmtRp(filteredItems.reduce((s, it) => s + it.total, 0))}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
