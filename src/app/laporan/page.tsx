"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { printReceipt, ReceiptPrintData, ReceiptBillItem } from "@/lib/print-receipt";

interface SummaryData {
  pdam: { totalTrx: number; totalNominal: number };
  lunasin: { totalTrx: number; totalNominal: number };
  gabungan: { totalTrx: number; totalNominal: number };
  persentase: { pdam: number; lunasin: number };
}

interface RekapItem {
  loketCode: string;
  loketName: string;
  jumlahTrx: number;
  totalNominal: number;
  totalTagihan: number;
  totalAdmin: number;
  trxPdam: number;
  trxLunasin: number;
  jenisLoket: string;
}

interface LoketItem {
  nama: string;
  loketCode: string;
}

interface LoketUserItem {
  loketCode: string;
  username: string;
  jumlahTrx: number;
  totalNominal: number;
}

interface ProdukBreakdownItem {
  kategori: string;
  totalTrx: number;
  totalNominal: number;
}

interface ProdukPerLoketItem {
  loketCode: string;
  kategori: string;
  count: number;
}

interface DetailItem {
  id: number;
  jenis: string;
  transactionCode: string;
  idPelanggan: string;
  nama: string;
  periode: string;
  tagihan: number;
  admin: number;
  total: number;
  username: string;
  tanggal: string;
  status: string;
  processingStatus?: string | null;
  flagTransaksi?: string | null;
  providerErrorCode?: string | null;
  providerErrorMessage?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  kodeProduk?: string | null;
  providerDetail?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface GroupedDetail {
  key: string;
  jenis: string;
  transactionCode: string;
  idPelanggan: string;
  nama: string;
  tanggal: string;
  username: string;
  status: string;
  totalTagihan: number;
  totalAdmin: number;
  totalBayar: number;
  jumlahRekening: number;
  items: DetailItem[];
}

interface LaporanData {
  summary: SummaryData;
  rekap: RekapItem[];
  rekapLoketUser: LoketUserItem[];
  loketList: LoketItem[];
  produkBreakdown: ProdukBreakdownItem[];
  rekapProdukPerLoket: ProdukPerLoketItem[];
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString("id-ID");
}

function formatTanggal(dateStr: string): string {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProdukLabel(kodeProduk: string | null | undefined): string {
  if (!kodeProduk) return "Lunasin";
  const base = kodeProduk.replace(/-\d+$/, "");
  const map: Record<string, string> = {
    "pln-postpaid": "PLN Pascabayar",
    "pln-prepaid": "PLN Prabayar",
    "pln-prepaidk": "PLN Prabayar K",
    "pln-nonrek": "PLN Non-Rekening",
    "pln-plnmobile": "PLN Mobile",
    "bpjs-kes": "BPJS Kesehatan",
    "telkom-postpaid": "Telkom",
    "pdam-lunasin": "PDAM",
  };
  if (map[base]) return map[base];
  return kodeProduk
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function getStatusLabel(status: string | null | undefined): string {
  const normalized = (status || "").toUpperCase();
  if (normalized === "SUCCESS" || normalized === "LUNAS" || normalized === "1") return "Sukses";
  if (normalized === "FAILED" || normalized === "GAGAL") return "Gagal";
  if (normalized === "PENDING") return "Pending";
  if (normalized === "PARTIAL_SUCCESS") return "Partial";
  return status || "-";
}

function getStatusClass(status: string | null | undefined): string {
  const label = getStatusLabel(status);
  if (label === "Sukses") return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
  if (label === "Gagal") return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
  if (label === "Pending") return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  if (label === "Partial") return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
  return "bg-slate-100 dark:bg-slate-800 text-slate-500";
}

/* Helper: get a value from providerDetail first, then metadata, then fallback */
function pv(item: DetailItem, ...keys: string[]): string | null {
  const prov = item.providerDetail || {};
  const meta = item.metadata || {};
  for (const k of keys) {
    if (prov[k] != null && String(prov[k]) !== "") return String(prov[k]);
    if (meta[k] != null && String(meta[k]) !== "") return String(meta[k]);
  }
  return null;
}

/* Known field labels for Lunasin provider_response */
const LUNASIN_FIELDS: Array<{ key: string[]; label: string; format?: "rupiah" | "text" }> = [
  { key: ["tarif"], label: "Tarif" },
  { key: ["daya"], label: "Daya (VA)" },
  { key: ["stand_meter", "standMeter"], label: "Stand Meter" },
  { key: ["kwh"], label: "kWh" },
  { key: ["jum_bill", "jumBill"], label: "Jumlah Tagihan" },
  { key: ["rp_amount"], label: "Tagihan Listrik", format: "rupiah" },
  { key: ["rp_admin"], label: "Biaya Admin", format: "rupiah" },
  { key: ["rp_materai"], label: "Materai", format: "rupiah" },
  { key: ["rp_ppn"], label: "PPN", format: "rupiah" },
  { key: ["rp_pju"], label: "PPJ", format: "rupiah" },
  { key: ["rp_angsuran"], label: "Angsuran", format: "rupiah" },
  { key: ["rp_token"], label: "Nilai Token", format: "rupiah" },
  { key: ["rp_total"], label: "Total", format: "rupiah" },
  { key: ["saldo_terpotong"], label: "Saldo Terpotong", format: "rupiah" },
  { key: ["nometer"], label: "No. Meter" },
  { key: ["refnum"], label: "Ref Number" },
  { key: ["refnum_lunasin"], label: "Ref Lunasin" },
  { key: ["tgl_lunas"], label: "Tgl Lunas" },
  { key: ["pesan_biller"], label: "Pesan Biller" },
];

/* Known field labels for PDAM metadata */
const PDAM_FIELDS: Array<{ key: string[]; label: string; format?: "rupiah" | "text" }> = [
  { key: ["alamat"], label: "Alamat" },
  { key: ["gol", "idgol"], label: "Golongan" },
  { key: ["blth"], label: "Bulan/Tahun" },
  { key: ["harga", "harga_air", "hargaAir"], label: "Harga Air", format: "rupiah" },
  { key: ["abodemen"], label: "Abodemen", format: "rupiah" },
  { key: ["bebanTetap", "beban_tetap"], label: "Beban Tetap", format: "rupiah" },
  { key: ["materai"], label: "Materai", format: "rupiah" },
  { key: ["retribusi"], label: "Retribusi", format: "rupiah" },
  { key: ["limbah"], label: "Limbah", format: "rupiah" },
  { key: ["denda"], label: "Denda", format: "rupiah" },
  { key: ["diskon"], label: "Diskon", format: "rupiah" },
  { key: ["biayaMeter", "biaya_meter"], label: "Biaya Meter", format: "rupiah" },
  { key: ["standLalu", "stand_lalu"], label: "Stand Lalu" },
  { key: ["standKini", "stand_kini"], label: "Stand Kini" },
  { key: ["subTotal", "sub_total"], label: "Sub Total", format: "rupiah" },
  { key: ["jenis_loket", "jenisLoket"], label: "Jenis Loket" },
];

function getDetailFields(item: DetailItem): Array<{ label: string; value: string }> {
  const fields = item.jenis === "PDAM" ? PDAM_FIELDS : LUNASIN_FIELDS;
  const result: Array<{ label: string; value: string }> = [];
  for (const f of fields) {
    const raw = pv(item, ...f.key);
    if (raw == null) continue;
    const num = parseFloat(raw);
    // Skip zero-value rupiah fields
    if (f.format === "rupiah" && !isNaN(num) && num === 0) continue;
    const display = f.format === "rupiah" && !isNaN(num) ? formatRupiah(num) : raw;
    result.push({ label: f.label, value: display });
  }
  return result;
}

function exportCSV(rekap: RekapItem[], produkBreakdown: ProdukBreakdownItem[], summary: SummaryData | undefined) {
  const BOM = "\uFEFF";
  let csv = BOM;
  // Summary
  csv += "RINGKASAN LAPORAN\n";
  csv += `PDAM,${summary?.pdam.totalTrx ?? 0},${summary?.pdam.totalNominal ?? 0}\n`;
  csv += `Lunasin,${summary?.lunasin.totalTrx ?? 0},${summary?.lunasin.totalNominal ?? 0}\n`;
  csv += `Total,${summary?.gabungan.totalTrx ?? 0},${summary?.gabungan.totalNominal ?? 0}\n\n`;
  // Rekap per loket
  csv += "REKAP PER LOKET\n";
  csv += "Kode Loket,Nama Loket,Jenis Loket,Jumlah Trx,Total Tagihan,Total Admin,Total Nominal,Trx PDAM,Trx Lunasin\n";
  for (const r of rekap) {
    csv += `${r.loketCode},"${r.loketName}",${r.jenisLoket},${r.jumlahTrx},${r.totalTagihan},${r.totalAdmin},${r.totalNominal},${r.trxPdam},${r.trxLunasin}\n`;
  }
  csv += "\n";
  // Produk breakdown
  csv += "REKAP PER KATEGORI PRODUK\n";
  csv += "Kategori,Jumlah Trx,Total Nominal\n";
  for (const p of produkBreakdown) {
    csv += `${p.kategori},${p.totalTrx},${p.totalNominal}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `laporan_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportDetailCSV(details: DetailItem[], loketName: string) {
  const BOM = "\uFEFF";
  let csv = BOM;
  csv += `DETAIL TRANSAKSI - ${loketName}\n\n`;
  csv += "ID,Jenis,Kode Transaksi,ID Pelanggan,Nama,Periode,Tagihan,Admin,Total,Username,Tanggal,Status\n";
  for (const d of details) {
    csv += `${d.id},${d.jenis},${d.transactionCode},${d.idPelanggan},"${d.nama}",${d.periode},${d.tagihan},${d.admin},${d.total},${d.username},${d.tanggal},${d.status}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `detail_${loketName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LaporanPage() {
  const KATEGORI_CONFIG: Record<string, { icon: string; color: string; bgColor: string; badgeBg: string }> = {
    PLN: { icon: "bolt", color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-900/20", badgeBg: "bg-amber-50 dark:bg-amber-900/20 text-amber-600" },
    BPJS: { icon: "health_and_safety", color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/20", badgeBg: "bg-green-50 dark:bg-green-900/20 text-green-600" },
    Telkom: { icon: "call", color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-900/20", badgeBg: "bg-red-50 dark:bg-red-900/20 text-red-600" },
    Pulsa: { icon: "smartphone", color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-900/20", badgeBg: "bg-purple-50 dark:bg-purple-900/20 text-purple-600" },
    "Paket Data": { icon: "wifi", color: "text-cyan-600", bgColor: "bg-cyan-50 dark:bg-cyan-900/20", badgeBg: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600" },
    "PDAM Lunasin": { icon: "water_drop", color: "text-sky-600", bgColor: "bg-sky-50 dark:bg-sky-900/20", badgeBg: "bg-sky-50 dark:bg-sky-900/20 text-sky-600" },
    Lainnya: { icon: "more_horiz", color: "text-slate-600", bgColor: "bg-slate-50 dark:bg-slate-800", badgeBg: "bg-slate-100 dark:bg-slate-800 text-slate-600" },
  };
  const [activePage, setActivePage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loket, setLoket] = useState("Semua Loket");
  const [jenisFilter, setJenisFilter] = useState("semua");
  const [data, setData] = useState<LaporanData | null>(null);
  const [loading, setLoading] = useState(true);

  // Expanded loket rows for user breakdown
  const [expandedLokets, setExpandedLokets] = useState<Set<string>>(new Set());

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoket, setDetailLoket] = useState<RekapItem | null>(null);
  const [detailUser, setDetailUser] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailPage, setDetailPage] = useState(1);

  const detailPerPage = 10;

  // Selected transaction detail for modal
  const [selectedDetailGroup, setSelectedDetailGroup] = useState<GroupedDetail | null>(null);

  // Ref for scrolling to detail section
  const detailSectionRef = useRef<HTMLDivElement>(null);

  // Loket dropdown search
  const [loketDropdownOpen, setLoketDropdownOpen] = useState(false);
  const [loketSearch, setLoketSearch] = useState("");
  const loketDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (loketDropdownRef.current && !loketDropdownRef.current.contains(e.target as Node)) {
        setLoketDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const itemsPerPage = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Close detail section when re-fetching
    setDetailOpen(false);
    setDetailLoket(null);
    setDetailUser(null);
    setDetailData([]);
    setDetailError("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (loket && loket !== "Semua Loket") params.set("loket", loket);
      if (jenisFilter !== "semua") params.set("jenis", jenisFilter);

      const res = await fetch(`/api/laporan?${params.toString()}`);
      const json = await res.json();
      if (json.error) {
        console.error(json.error);
      } else {
        setData(json);
        setActivePage(1);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, loket, jenisFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = async (item: RekapItem) => {
    setDetailLoket(item);
    setDetailUser(null);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailPage(1);
    setTimeout(() => detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    try {
      const params = new URLSearchParams();
      params.set("loketCode", item.loketCode);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (jenisFilter !== "semua") params.set("jenis", jenisFilter);
      const res = await fetch(`/api/laporan/detail?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setDetailData([]);
        setDetailError(json.error || "Gagal mengambil detail transaksi per loket");
      } else {
        setDetailData(json.detail ?? []);
      }
    } catch (err) {
      console.error("Detail fetch error:", err);
      setDetailData([]);
      setDetailError("Gagal mengambil detail transaksi per loket");
    } finally {
      setDetailLoading(false);
    }
  };

  const openUserDetail = async (loketItem: RekapItem, user: LoketUserItem) => {
    setDetailLoket({ ...loketItem, jumlahTrx: user.jumlahTrx, totalNominal: user.totalNominal });
    setDetailUser(user.username);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailPage(1);
    setTimeout(() => detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    try {
      const params = new URLSearchParams();
      params.set("loketCode", loketItem.loketCode);
      params.set("username", user.username);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (jenisFilter !== "semua") params.set("jenis", jenisFilter);
      const res = await fetch(`/api/laporan/detail?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setDetailData([]);
        setDetailError(json.error || "Gagal mengambil detail transaksi");
      } else {
        setDetailData(json.detail ?? []);
      }
    } catch (err) {
      console.error("Detail fetch error:", err);
      setDetailData([]);
      setDetailError("Gagal mengambil detail transaksi");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailLoket(null);
    setDetailUser(null);
    setDetailData([]);
    setDetailError("");
  };

  const summary = data?.summary;
  const rekap = data?.rekap ?? [];
  const rekapLoketUser = data?.rekapLoketUser ?? [];
  const loketList: LoketItem[] = data?.loketList ?? [];
  const produkBreakdown = data?.produkBreakdown ?? [];
  const rekapProdukPerLoket = data?.rekapProdukPerLoket ?? [];

  const filteredLoketList = loketList.filter(
    (l) => l.nama.toLowerCase().includes(loketSearch.toLowerCase()) || l.loketCode.toLowerCase().includes(loketSearch.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(rekap.length / itemsPerPage));
  const paginatedRekap = rekap.slice(
    (activePage - 1) * itemsPerPage,
    activePage * itemsPerPage
  );

  // Group rekapLoketUser by loketCode for expandable rows
  const loketUserMap = React.useMemo(() => {
    const map = new Map<string, LoketUserItem[]>();
    for (const item of rekapLoketUser) {
      const arr = map.get(item.loketCode) || [];
      arr.push(item);
      map.set(item.loketCode, arr);
    }
    return map;
  }, [rekapLoketUser]);

  // Group rekapProdukPerLoket by loketCode
  const produkPerLoketMap = React.useMemo(() => {
    const map = new Map<string, ProdukPerLoketItem[]>();
    for (const item of rekapProdukPerLoket) {
      const arr = map.get(item.loketCode) || [];
      arr.push(item);
      map.set(item.loketCode, arr);
    }
    return map;
  }, [rekapProdukPerLoket]);

  const toggleLoketExpand = (loketCode: string) => {
    setExpandedLokets((prev) => {
      const next = new Set(prev);
      if (next.has(loketCode)) next.delete(loketCode);
      else next.add(loketCode);
      return next;
    });
  };

  // Group detail by transaction (idPelanggan + transactionCode)
  const groupedDetail: GroupedDetail[] = React.useMemo(() => {
    const map = new Map<string, GroupedDetail>();
    for (const d of detailData) {
      const key = d.transactionCode ? `${d.idPelanggan}-${d.transactionCode}` : `${d.jenis}-${d.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(d);
        existing.totalTagihan += d.tagihan;
        existing.totalAdmin += d.admin;
        existing.totalBayar += d.total;
        existing.jumlahRekening++;
      } else {
        map.set(key, {
          key,
          jenis: d.jenis,
          transactionCode: d.transactionCode,
          idPelanggan: d.idPelanggan,
          nama: d.nama,
          tanggal: d.tanggal,
          username: d.username,
          status: d.status,
          totalTagihan: d.tagihan,
          totalAdmin: d.admin,
          totalBayar: d.total,
          jumlahRekening: 1,
          items: [d],
        });
      }
    }
    return Array.from(map.values());
  }, [detailData]);

  // Detail pagination (based on grouped)
  const detailTotalPages = Math.max(1, Math.ceil(groupedDetail.length / detailPerPage));
  const paginatedDetail = groupedDetail.slice(
    (detailPage - 1) * detailPerPage,
    detailPage * detailPerPage
  );

  return (
    <>
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold">Laporan Transaksi PDAM & Lunasin</h2>
          <p className="text-slate-500">
            Monitoring rekapitulasi transaksi sukses per loket pembayaran.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
          </button>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Data Real-time
            </span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase">
              Database MariaDB
            </span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {/* PDAM */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-4">
          <div className="p-2.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 rounded-lg shrink-0">
            <span className="material-symbols-outlined text-2xl">water_drop</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium">PDAM</p>
            <p className="text-xl font-bold mt-0.5">
              {loading ? "..." : formatNumber(summary?.pdam.totalTrx ?? 0)} <span className="text-xs font-normal text-slate-400">Trx</span>
            </p>
            <p className="text-[11px] text-cyan-600 font-semibold mt-0.5 truncate">
              {loading ? "..." : formatRupiah(summary?.pdam.totalNominal ?? 0)}
            </p>
          </div>
        </div>

        {/* Semua kategori Lunasin (selalu tampil) */}
        {(["PLN", "BPJS", "Telkom", "Pulsa", "Paket Data", "PDAM Lunasin"] as const).map((kat) => {
          const cfg = KATEGORI_CONFIG[kat];
          const found = produkBreakdown.find((p) => p.kategori === kat);
          const trx = found?.totalTrx ?? 0;
          const nominal = found?.totalNominal ?? 0;
          return (
            <div key={kat} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-4">
              <div className={`p-2.5 ${cfg.bgColor} rounded-lg shrink-0`}>
                <span className={`material-symbols-outlined text-2xl ${cfg.color}`}>{cfg.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">{kat}</p>
                <p className="text-xl font-bold mt-0.5">
                  {loading ? "..." : formatNumber(trx)} <span className="text-xs font-normal text-slate-400">Trx</span>
                </p>
                <p className={`text-[11px] ${cfg.color} font-semibold mt-0.5 truncate`}>
                  {loading ? "..." : formatRupiah(nominal)}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Filter Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary">
                filter_alt
              </span>
              <h3 className="text-lg font-bold">Filter Laporan</h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {[
                { label: "Hari Ini", getValue: () => { const t = new Date().toISOString().slice(0,10); return [t, t]; } },
                { label: "Kemarin", getValue: () => { const d = new Date(); d.setDate(d.getDate()-1); const t = d.toISOString().slice(0,10); return [t, t]; } },
                { label: "7 Hari", getValue: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-6); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)]; } },
                { label: "Bulan Ini", getValue: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), 1); return [s.toISOString().slice(0,10), n.toISOString().slice(0,10)]; } },
                { label: "Bulan Lalu", getValue: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth()-1, 1); const e = new Date(n.getFullYear(), n.getMonth(), 0); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)]; } },
                { label: "Semua", getValue: () => ["", ""] },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => { const [s, e] = preset.getValue(); setStartDate(s); setEndDate(e); }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    (() => { const [s, e] = preset.getValue(); return s === startDate && e === endDate; })()
                      ? "bg-primary text-white border-primary"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Tanggal Mulai
                </label>
                <div className="relative">
                  <input
                    className="w-full h-11 pl-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-primary focus:border-primary outline-none"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
                    calendar_today
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Tanggal Akhir
                </label>
                <div className="relative">
                  <input
                    className="w-full h-11 pl-10 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-primary focus:border-primary outline-none"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
                    calendar_today
                  </span>
                </div>
              </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Pilih Loket
                  </label>
                  <div className="relative" ref={loketDropdownRef}>
                    <button
                      type="button"
                      onClick={() => { setLoketDropdownOpen(!loketDropdownOpen); setLoketSearch(""); }}
                      className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-3 pr-10 appearance-none cursor-pointer text-left flex items-center"
                    >
                      <span className="truncate">{loket}</span>
                    </button>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                    {loketDropdownOpen && (
                      <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
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
                            onClick={() => { setLoket("Semua Loket"); setLoketDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                              loket === "Semua Loket" ? "text-primary font-bold bg-primary/5" : ""
                            }`}
                          >
                            Semua Loket
                            {loket === "Semua Loket" && <span className="material-symbols-outlined text-primary text-base">check</span>}
                          </button>
                          {filteredLoketList.length === 0 ? (
                            <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                          ) : (
                            filteredLoketList.map((l) => (
                              <button
                                key={l.loketCode}
                                type="button"
                                onClick={() => { setLoket(l.nama); setLoketDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                                  loket === l.nama ? "text-primary font-bold bg-primary/5" : ""
                                }`}
                              >
                                <span>
                                  {l.nama}
                                  <span className="text-xs text-slate-400 ml-1.5">{l.loketCode}</span>
                                </span>
                                {loket === l.nama && <span className="material-symbols-outlined text-primary text-base">check</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Jenis
                </label>
                <select
                  className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm focus:ring-primary focus:border-primary outline-none"
                  value={jenisFilter}
                  onChange={(e) => setJenisFilter(e.target.value)}
                >
                  <option value="semua">Semua</option>
                  <option value="pdam">PDAM</option>
                  <option value="lunasin">Semua Lunasin</option>
                  <option disabled>──────────</option>
                  <option value="kat:PLN">PLN</option>
                  <option value="kat:BPJS">BPJS</option>
                  <option value="kat:Telkom">Telkom</option>
                  <option value="kat:Pulsa">Pulsa</option>
                  <option value="kat:Paket Data">Paket Data</option>
                  <option value="kat:PDAM Lunasin">PDAM Lunasin</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={fetchData}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">
                    search
                  </span>
                  <span>Terapkan</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">store</span>
                <h3 className="text-sm font-bold">Rekap Per Loket</h3>
                <span className="text-xs text-slate-400 ml-1">({rekap.length} loket)</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exportCSV(rekap, produkBreakdown, summary)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors"
                  title="Export CSV"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Export CSV
                </button>
                <button
                  onClick={fetchData}
                  className="p-2 border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-sm">
                    refresh
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-semibold w-8"></th>
                    <th className="px-6 py-4 font-semibold">Nama Loket</th>
                    <th className="px-6 py-4 font-semibold">Jenis Loket</th>
                    <th className="px-6 py-4 font-semibold">Jenis Transaksi</th>
                    <th className="px-6 py-4 font-semibold">Jumlah Trx</th>
                    <th className="px-6 py-4 font-semibold text-right">Total Pembayaran</th>
                    <th className="px-6 py-4 font-semibold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <span className="material-symbols-outlined animate-spin">progress_activity</span>
                          <span className="text-sm">Memuat data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedRekap.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                        Tidak ada data transaksi untuk filter ini.
                      </td>
                    </tr>
                  ) : (
                    paginatedRekap.map((item) => {
                      const isExpanded = expandedLokets.has(item.loketCode);
                      const users = loketUserMap.get(item.loketCode) || [];
                      const hasUsers = users.length > 0;
                      return (
                        <React.Fragment key={item.loketCode}>
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-6 py-4 text-center">
                              {hasUsers && (
                                <button onClick={() => toggleLoketExpand(item.loketCode)} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                                  <span className={`material-symbols-outlined text-sm text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                                    chevron_right
                                  </span>
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                                  <span className="material-symbols-outlined">store</span>
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{item.loketName || "—"}</p>
                                  <p className="text-xs text-slate-400">{item.loketCode || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-block px-2 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {item.jenisLoket}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.trxPdam > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600">
                                    <span className="material-symbols-outlined text-xs">water_drop</span>
                                    PDAM
                                  </span>
                                )}
                                {(produkPerLoketMap.get(item.loketCode) || []).map((p) => {
                                  const cfg = KATEGORI_CONFIG[p.kategori] || KATEGORI_CONFIG["Lainnya"];
                                  return (
                                    <span key={p.kategori} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full ${cfg.badgeBg}`} title={`${p.count} trx`}>
                                      <span className="material-symbols-outlined text-xs">{cfg.icon}</span>
                                      {p.kategori} <span className="opacity-60">({p.count})</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold">
                                {formatNumber(item.jumlahTrx)} <span className="text-xs font-normal text-slate-400 ml-1">Trx</span>
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <p className="text-sm font-bold">{formatRupiah(item.totalNominal)}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => openDetail(item)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-primary text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-all">
                                Detail
                              </button>
                            </td>
                          </tr>
                          {/* Expanded user rows */}
                          {isExpanded && users.map((u) => (
                            <tr key={`${item.loketCode}-${u.username}`} className="bg-slate-50/70 dark:bg-slate-800/30">
                              <td className="px-6 py-3"></td>
                              <td className="px-6 py-3" colSpan={2}>
                                <div className="flex items-center gap-2 pl-4">
                                  <span className="material-symbols-outlined text-xs text-slate-400">subdirectory_arrow_right</span>
                                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-sm">person</span>
                                  </div>
                                  <span className="text-sm font-medium">{u.username || "(kosong)"}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3"></td>
                              <td className="px-6 py-3">
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                  {formatNumber(u.jumlahTrx)} <span className="text-xs text-slate-400">Trx</span>
                                </p>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <p className="text-sm text-slate-600 dark:text-slate-400">{formatRupiah(u.totalNominal)}</p>
                              </td>
                              <td className="px-6 py-3 text-center">
                                <button onClick={() => openUserDetail(item, u)} className="px-2.5 py-1 bg-white dark:bg-slate-700 text-primary text-xs font-bold rounded-md border border-slate-200 dark:border-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all">
                                  Detail
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-400">{rekap.length} loket ditemukan</span>
              <nav className="flex items-center gap-1">
                <button className="p-2 text-slate-400 hover:text-primary disabled:opacity-30" disabled={activePage === 1} onClick={() => setActivePage((p) => Math.max(1, p - 1))}>
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - activePage) <= 1).map((page, idx, arr) => (
                  <React.Fragment key={page}>
                    {idx > 0 && arr[idx - 1] !== page - 1 && <span className="text-xs text-slate-400">…</span>}
                    <button onClick={() => setActivePage(page)} className={activePage === page ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold" : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"}>{page}</button>
                  </React.Fragment>
                ))}
                <button className="p-2 text-slate-400 hover:text-primary disabled:opacity-30" disabled={activePage === totalPages} onClick={() => setActivePage((p) => Math.min(totalPages, p + 1))}>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </nav>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Transaksi per Loket — Inline Section */}
      {detailOpen && (
        <div ref={detailSectionRef} className="mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">
                    {detailUser ? "person" : "storefront"}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">
                      {detailUser
                        ? `Detail Transaksi · ${detailUser}`
                        : `${detailLoket?.loketName || "—"} (${detailLoket?.loketCode || "—"})`
                      }
                    </h3>
                  </div>
                  {detailUser && (
                    <span className="text-xs text-slate-400">
                      Loket: {detailLoket?.loketName || "—"} ({detailLoket?.loketCode || "—"})
                    </span>
                  )}
                  {detailError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                      {detailError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportDetailCSV(detailData, detailLoket?.loketName || "detail")}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors"
                  title="Export Detail CSV"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  CSV
                </button>
                <button
                  onClick={closeDetail}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-auto">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-5 py-3 font-semibold w-8"></th>
                    <th className="px-5 py-3 font-semibold">Tanggal</th>
                    <th className="px-5 py-3 font-semibold">Jenis</th>
                    <th className="px-5 py-3 font-semibold">ID Pelanggan</th>
                    <th className="px-5 py-3 font-semibold">Nama</th>
                    <th className="px-5 py-3 font-semibold">Rekening</th>
                    <th className="px-5 py-3 font-semibold text-right">Tagihan</th>
                    <th className="px-5 py-3 font-semibold text-right">Admin</th>
                    <th className="px-5 py-3 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {detailLoading ? (
                    <tr>
                       <td colSpan={9} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <span className="material-symbols-outlined animate-spin">
                            progress_activity
                          </span>
                          <span className="text-sm">Memuat detail...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedDetail.length === 0 ? (
                    <tr>
                      <td
                         colSpan={9}
                        className="px-5 py-12 text-center text-slate-400 text-sm"
                      >
                        Tidak ada data transaksi detail.
                      </td>
                    </tr>
                  ) : (
                    paginatedDetail.map((group) => {
                      const hasMultiple = group.jumlahRekening > 1;
                      const firstItem = group.items[0];
                      return (
                        <React.Fragment key={group.key}>
                          {/* Group header row */}
                          <tr
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                            onClick={() => setSelectedDetailGroup(group)}
                          >
                            <td className="px-5 py-3 text-center">
                              <span className="material-symbols-outlined text-sm text-slate-400">
                                visibility
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {formatTanggal(group.tanggal)}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-bold ${
                                  group.jenis === "PDAM"
                                    ? "text-cyan-600"
                                    : "text-blue-600"
                                }`}
                              >
                                <span className="material-symbols-outlined text-sm">
                                  {group.jenis === "PDAM" ? "water_drop" : "electric_bolt"}
                                </span>
                                {group.jenis === "PDAM" ? "PDAM" : getProdukLabel(firstItem.kodeProduk)}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-mono text-xs">
                              {group.idPelanggan}
                            </td>
                            <td className="px-5 py-3 text-xs font-medium">
                              {group.nama}
                            </td>
                            <td className="px-5 py-3 text-xs">
                              {firstItem.kodeProduk?.replace(/-\d+$/, "") === "pln-prepaid" ? (
                                "-"
                              ) : hasMultiple ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold whitespace-nowrap">
                                  {group.jumlahRekening} Rekening
                                </span>
                              ) : (
                                firstItem.periode
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-right">
                              {formatRupiah(group.totalTagihan)}
                            </td>
                            <td className="px-5 py-3 text-xs text-right">
                              {formatRupiah(group.totalAdmin)}
                            </td>
                            <td className="px-5 py-3 text-xs text-right font-bold">
                              {formatRupiah(group.totalBayar)}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {detailTotalPages > 1 && (
              <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <span className="text-xs text-slate-400">
                  {groupedDetail.length} transaksi · Halaman {detailPage} dari{" "}
                  {detailTotalPages}
                </span>
                <nav className="flex items-center gap-1">
                  <button
                    className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30"
                    disabled={detailPage === 1}
                    onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                  >
                    <span className="material-symbols-outlined text-sm">
                      chevron_left
                    </span>
                  </button>
                  {Array.from({ length: detailTotalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === detailTotalPages ||
                        Math.abs(p - detailPage) <= 1
                    )
                    .map((page, idx, arr) => (
                      <React.Fragment key={page}>
                        {idx > 0 && arr[idx - 1] !== page - 1 && (
                          <span className="text-xs text-slate-400">…</span>
                        )}
                        <button
                          onClick={() => setDetailPage(page)}
                          className={
                            detailPage === page
                              ? "w-7 h-7 rounded-md bg-primary text-white text-xs font-bold"
                              : "w-7 h-7 rounded-md text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                          }
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30"
                    disabled={detailPage === detailTotalPages}
                    onClick={() =>
                      setDetailPage((p) => Math.min(detailTotalPages, p + 1))
                    }
                  >
                    <span className="material-symbols-outlined text-sm">
                      chevron_right
                    </span>
                  </button>
                </nav>
              </div>
            )}

            {/* Summary */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">receipt</span>
                <span className="font-semibold">{formatNumber(detailLoket?.jumlahTrx ?? 0)}</span> Transaksi
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">payments</span>
                Total <span className="font-semibold text-primary">{formatRupiah(detailLoket?.totalNominal ?? 0)}</span>
              </span>
            </div>
        </div>
      )}

      {/* Detail Transaction Modal */}
      {selectedDetailGroup && (() => {
        const group = selectedDetailGroup;
        const firstItem = group.items[0];
        const hasMultiple = group.jumlahRekening > 1;
        const isLunasin = group.jenis !== "PDAM";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedDetailGroup(null)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">
                      {group.jenis === "PDAM" ? "water_drop" : "electric_bolt"}
                    </span>
                    Detail Pembayaran {group.jenis === "PDAM" ? "PDAM" : getProdukLabel(firstItem.kodeProduk)}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {group.idPelanggan} · {group.nama}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDetailGroup(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-auto p-5 space-y-4">
                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <div className="text-slate-400 mb-0.5">ID Pelanggan</div>
                    <div className="font-mono font-bold">{group.idPelanggan}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Nama</div>
                    <div className="font-medium">{group.nama}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Kasir</div>
                    <div className="font-medium">{group.username}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Tanggal</div>
                    <div>{formatTanggal(group.tanggal)}</div>
                  </div>
                  {isLunasin && firstItem.kodeProduk && (
                    <div>
                      <div className="text-slate-400 mb-0.5">Produk</div>
                      <div className="font-medium">{getProdukLabel(firstItem.kodeProduk)}</div>
                    </div>
                  )}
                </div>

                {/* Token PLN — prominent display */}
                {(() => {
                  const tokenVal = pv(firstItem, "token", "tokenPln", "token_pln");
                  return tokenVal ? (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
                      <span className="material-symbols-outlined text-amber-500">key</span>
                      <div>
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">Token PLN</div>
                        <div className="font-mono font-bold text-sm text-amber-700 dark:text-amber-300 tracking-widest">{tokenVal}</div>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* PDAM: detail per periode */}
                {group.jenis === "PDAM" ? (
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const fields = getDetailFields(item);
                      if (fields.length === 0) return null;
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                          <div className="px-3 py-2 bg-cyan-50/60 dark:bg-cyan-900/10 flex items-center justify-between">
                            <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm">calendar_month</span>
                              Periode: {item.periode || "-"}
                            </span>
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {formatRupiah(item.total)}
                            </span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                              {fields.map((f, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-800/30"}>
                                  <td className="px-3 py-2 text-slate-400 font-medium w-1/3">{f.label}</td>
                                  <td className="px-3 py-2 font-medium">{f.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                    {hasMultiple && (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-500 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">summarize</span>
                            Total {group.jumlahRekening} Periode
                          </span>
                          <div className="flex gap-4">
                            <span className="text-slate-500">Tagihan: <span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(group.totalTagihan)}</span></span>
                            <span className="text-slate-500">Admin: <span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(group.totalAdmin)}</span></span>
                            <span className="text-slate-500">Total: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(group.totalBayar)}</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Lunasin: detail fields */
                  (() => {
                    const fields = getDetailFields(firstItem);
                    if (fields.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {fields.map((f, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-800/30"}>
                                <td className="px-3 py-2 text-slate-400 font-medium w-1/3">{f.label}</td>
                                <td className="px-3 py-2 font-medium">{f.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                )}

                {/* Multi-rekening breakdown (Lunasin only) */}
                {hasMultiple && isLunasin && (
                  <div>
                    <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">receipt</span>
                      Rincian {group.jumlahRekening} Rekening
                    </div>
                    <div className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-slate-400 font-semibold">Periode</th>
                            <th className="px-3 py-2 text-right text-slate-400 font-semibold">Tagihan</th>
                            <th className="px-3 py-2 text-right text-slate-400 font-semibold">Admin</th>
                            <th className="px-3 py-2 text-right text-slate-400 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {group.items.map((d) => (
                            <tr key={d.id}>
                              <td className="px-3 py-2 font-medium">{firstItem.kodeProduk?.replace(/-\d+$/, "") === "pln-prepaid" ? "-" : d.periode}</td>
                              <td className="px-3 py-2 text-right">{formatRupiah(d.tagihan)}</td>
                              <td className="px-3 py-2 text-right">{formatRupiah(d.admin)}</td>
                              <td className="px-3 py-2 text-right font-bold">{formatRupiah(d.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50">
                          <tr className="font-bold">
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(group.totalTagihan)}</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(group.totalAdmin)}</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(group.totalBayar)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <span className="text-xs text-slate-400">
                  {group.jumlahRekening} {group.jenis === "PDAM" ? "Periode" : "Rekening"} · Total{" "}
                  <span className="font-bold text-primary">{formatRupiah(group.totalBayar)}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const bills: ReceiptBillItem[] = group.items.map((item) => {
                        const isPdam = item.jenis === "PDAM";
                        const meta = item.metadata || {};
                        const prov = item.providerDetail || {};
                        const get = (...keys: string[]) => {
                          for (const k of keys) {
                            if (prov[k] != null && String(prov[k]) !== "") return prov[k];
                            if (meta[k] != null && String(meta[k]) !== "") return meta[k];
                          }
                          return undefined;
                        };
                        if (isPdam) {
                          return {
                            idpel: item.idPelanggan,
                            nama: item.nama,
                            alamat: String(get("alamat") ?? ""),
                            gol: String(get("gol", "idgol") ?? ""),
                            periode: item.periode,
                            standLalu: Number(get("standLalu", "stand_lalu") ?? 0),
                            standKini: Number(get("standKini", "stand_kini") ?? 0),
                            hargaAir: Number(get("harga", "harga_air", "hargaAir") ?? 0),
                            denda: Number(get("denda") ?? 0),
                            materai: Number(get("materai") ?? 0),
                            limbah: Number(get("limbah") ?? 0),
                            retribusi: Number(get("retribusi") ?? 0),
                            bebanTetap: Number(get("bebanTetap", "beban_tetap") ?? 0),
                            biayaMeter: Number(get("biayaMeter", "biaya_meter") ?? 0),
                            diskon: Number(get("diskon") ?? 0),
                            tagihan: item.tagihan,
                            admin: item.admin,
                            total: item.total,
                            transactionCode: item.transactionCode,
                          };
                        }
                        return {
                          type: "pln" as const,
                          idpel: item.idPelanggan,
                          nama: item.nama,
                          periode: item.periode,
                          kodeProduk: item.kodeProduk || "",
                          tarif: String(get("tarif") ?? ""),
                          daya: String(get("daya") ?? ""),
                          standMeter: String(get("stand_meter", "standMeter") ?? ""),
                          noMeter: String(get("nometer") ?? ""),
                          jumBill: String(get("jum_bill", "jumBill") ?? ""),
                          tokenPln: String(get("token", "tokenPln", "token_pln") ?? ""),
                          kwh: String(get("kwh") ?? ""),
                          rpAmount: Number(get("rp_amount") ?? 0),
                          rpAdmin: Number(get("rp_admin") ?? 0),
                          rpMaterai: Number(get("rp_materai") ?? 0),
                          rpPpn: Number(get("rp_ppn") ?? 0),
                          rpPju: Number(get("rp_pju") ?? 0),
                          rpAngsuran: Number(get("rp_angsuran") ?? 0),
                          rpToken: Number(get("rp_token") ?? 0),
                          rpTotal: Number(get("rp_total") ?? 0),
                          saldoTerpotong: Number(get("saldo_terpotong") ?? 0),
                          refnum: String(get("refnum") ?? ""),
                          refnumLunasin: String(get("refnum_lunasin") ?? ""),
                          tglLunas: String(get("tgl_lunas") ?? ""),
                          pesanBiller: String(get("pesan_biller") ?? ""),
                          tagihan: item.tagihan,
                          admin: item.admin,
                          total: item.total,
                          transactionCode: item.transactionCode,
                        };
                      });
                      const printData: ReceiptPrintData = {
                        loketName: detailLoket?.loketName || "-",
                        loketCode: detailLoket?.loketCode || "-",
                        kasir: group.username,
                        tanggal: group.tanggal,
                        bills,
                        totalTagihan: group.totalTagihan,
                        totalAdmin: group.totalAdmin,
                        totalBayar: group.totalBayar,
                        tunai: group.totalBayar,
                        kembalian: 0,
                      };
                      printReceipt(printData);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">print</span>
                    Cetak Struk
                  </button>
                  <button
                    onClick={() => setSelectedDetailGroup(null)}
                    className="px-4 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
