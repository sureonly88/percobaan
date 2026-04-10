"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { canWrite, normalizeRole } from "@/lib/rbac";

interface TransaksiData {
  id: number;
  transactionCode: string;
  transactionDate: string;
  custId: string;
  nama: string;
  alamat: string;
  blth: string;
  hargaAir: number;
  abodemen: number;
  materai: number;
  limbah: number;
  retribusi: number;
  denda: number;
  standLalu: number;
  standKini: number;
  subTotal: number;
  admin: number;
  total: number;
  username: string;
  loketName: string;
  loketCode: string;
  idgol: string;
  jenisLoket: string;
  bebanTetap: number;
  biayaMeter: number;
  flagTransaksi: string;
  diskon: number;
}

interface PlnTransaksiData {
  id: number;
  transactionCode: string;
  transactionDate: string;
  custId: string;
  nama: string;
  kodeProduk: string;
  idTrx: string;
  periode: string;
  jumBill: number;
  tarif: string;
  daya: string;
  standMeter: string;
  rpAmount: number;
  rpAdmin: number;
  rpTotal: number;
  refnumLunasin: string;
  tokenPln: string;
  username: string;
  loketName: string;
  loketCode: string;
  jenisLoket: string;
  flagTransaksi: string;
  processingStatus: string;
  paidAt: string | null;
  failedAt: string | null;
  providerDetail?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface SummaryData {
  totalTransaksi: number;
  totalNominal: number;
  totalSubtotal?: number;
  totalTagihan?: number;
  totalAdmin: number;
  uniqueCustomers: number;
}

interface LoketOption {
  nama: string;
  loketCode: string;
}

const emptyForm = {
  id: 0, custId: "", nama: "", alamat: "", blth: "", hargaAir: 0, abodemen: 0,
  materai: 0, limbah: 0, retribusi: 0, denda: 0, standLalu: 0, standKini: 0,
  subTotal: 0, admin: 0, total: 0, username: "", loketName: "", loketCode: "",
  idgol: "", jenisLoket: "SWITCHING", bebanTetap: 0, biayaMeter: 0,
};

const emptyPlnForm = {
  id: 0, custId: "", nama: "", kodeProduk: "", periode: "",
  rpAmount: 0, rpAdmin: 0, rpTotal: 0, username: "", loketName: "", loketCode: "",
};

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString("id-ID");
}

function formatPeriode(blth: string): string {
  if (!blth || blth.length < 6) return blth || "-";
  const y = blth.substring(0, 4);
  const m = parseInt(blth.substring(4, 6), 10);
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${bulan[m - 1] || m} ${y}`;
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
  return map[base] || kodeProduk;
}

/* Helper: get a value from providerDetail first, then metadata */
function pvLunasin(item: PlnTransaksiData, ...keys: string[]): string | null {
  const prov = item.providerDetail || {};
  const meta = item.metadata || {};
  for (const k of keys) {
    if (prov[k] != null && String(prov[k]) !== "") return String(prov[k]);
    if (meta[k] != null && String(meta[k]) !== "") return String(meta[k]);
  }
  return null;
}

const LUNASIN_FIELDS: Array<{ key: string[]; label: string; format?: "rupiah" | "text" }> = [
  { key: ["tarif"], label: "Tarif" },
  { key: ["daya"], label: "Daya (VA)" },
  { key: ["stand_meter", "standMeter", "nometer"], label: "Stand Meter / No Meter" },
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

function getLunasinDetailFields(item: PlnTransaksiData): Array<{ label: string; value: string }> {
  const result: Array<{ label: string; value: string }> = [];
  for (const f of LUNASIN_FIELDS) {
    const raw = pvLunasin(item, ...f.key);
    if (raw == null) continue;
    const num = parseFloat(raw);
    if (f.format === "rupiah" && !isNaN(num) && num === 0) continue;
    const display = f.format === "rupiah" && !isNaN(num) ? formatRupiah(num) : raw;
    result.push({ label: f.label, value: display });
  }
  return result;
}

type LunasinTab = "pln" | "bpjs" | "telkom" | "pulsa" | "paketdata" | "pdam-lunasin";
type ActiveTab = "pdam" | LunasinTab;

const LUNASIN_TABS: { key: LunasinTab; label: string; icon: string }[] = [
  { key: "pln", label: "PLN", icon: "bolt" },
  { key: "bpjs", label: "BPJS", icon: "health_and_safety" },
  { key: "telkom", label: "Telkom", icon: "call" },
  { key: "pulsa", label: "Pulsa", icon: "smartphone" },
  { key: "paketdata", label: "Paket Data", icon: "language" },
  { key: "pdam-lunasin", label: "PDAM Lunasin", icon: "water_drop" },
];

export default function PelangganPage() {
  const { data: session } = useSession();
  const userRole = normalizeRole((session?.user as { role?: string })?.role || "");
  const isWritable = canWrite(userRole);
  const isPrivilegedUser = userRole === "admin" || userRole === "supervisor";
  const currentLoketCode = (session?.user as { loketCode?: string })?.loketCode || "";
  const currentLoketName = (session?.user as { loketName?: string })?.loketName || currentLoketCode;

  const [activeTab, setActiveTab] = useState<ActiveTab>("pdam");

  // === PDAM state ===
  const [transaksi, setTransaksi] = useState<TransaksiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGolongan, setFilterGolongan] = useState("semua");
  const [filterLoket, setFilterLoket] = useState("semua");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [golonganList, setGolonganList] = useState<string[]>([]);
  const [loketList, setLoketList] = useState<LoketOption[]>([]);

  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<TransaksiData | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<TransaksiData | null>(null);

  // === PLN state ===
  const [plnTransaksi, setPlnTransaksi] = useState<PlnTransaksiData[]>([]);
  const [plnLoading, setPlnLoading] = useState(true);
  const [plnSearch, setPlnSearch] = useState("");
  const [plnFilterLoket, setPlnFilterLoket] = useState("semua");
  const [plnStartDate, setPlnStartDate] = useState("");
  const [plnEndDate, setPlnEndDate] = useState("");
  const [plnPage, setPlnPage] = useState(1);
  const [plnTotalPages, setPlnTotalPages] = useState(1);
  const [plnTotalCount, setPlnTotalCount] = useState(0);
  const [plnSummary, setPlnSummary] = useState<SummaryData | null>(null);
  const [plnLoketList, setPlnLoketList] = useState<LoketOption[]>([]);

  // PLN form modal
  const [plnModalOpen, setPlnModalOpen] = useState(false);
  const [plnEditMode, setPlnEditMode] = useState(false);
  const [plnFormData, setPlnFormData] = useState({ ...emptyPlnForm });
  const [plnFormError, setPlnFormError] = useState("");
  const [plnFormLoading, setPlnFormLoading] = useState(false);

  // PLN detail modal
  const [plnDetailOpen, setPlnDetailOpen] = useState(false);
  const [plnDetailData, setPlnDetailData] = useState<PlnTransaksiData | null>(null);

  // PLN delete confirm
  const [plnDeleteConfirm, setPlnDeleteConfirm] = useState<PlnTransaksiData | null>(null);

  // Searchable loket dropdown (filter)
  const [filterLoketOpen, setFilterLoketOpen] = useState(false);
  const [filterLoketSearch, setFilterLoketSearch] = useState("");
  const filterLoketRef = useRef<HTMLDivElement>(null);

  // Searchable loket dropdown (form)
  const [formLoketOpen, setFormLoketOpen] = useState(false);
  const [formLoketSearch, setFormLoketSearch] = useState("");
  const formLoketRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterGolongan !== "semua") params.set("golongan", filterGolongan);
      if (filterLoket !== "semua") params.set("loketCode", filterLoket);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/pelanggan?${params.toString()}`);
      const json = await res.json();
      setTransaksi(json.transaksi ?? []);
      setTotalPages(json.totalPages ?? 1);
      setTotalCount(json.total ?? 0);
      setSummary(json.summary ?? null);
      if (json.golonganList) setGolonganList(json.golonganList);
      if (json.loketList) setLoketList(json.loketList);
    } catch (err) {
      console.error("Fetch transaksi error:", err);
    } finally {
      setLoading(false);
    }
  }, [search, filterGolongan, filterLoket, startDate, endDate, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!isPrivilegedUser && currentLoketCode) {
      setFilterLoket(currentLoketCode);
      setPlnFilterLoket(currentLoketCode);
    }
  }, [isPrivilegedUser, currentLoketCode]);

  // === PLN fetch ===
  const fetchPlnData = useCallback(async () => {
    setPlnLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", "pln");
      // Send aktif lunasin tab as kategori filter
      if (activeTab !== "pdam") params.set("kategori", activeTab);
      if (plnSearch) params.set("search", plnSearch);
      if (plnFilterLoket !== "semua") params.set("loketCode", plnFilterLoket);
      if (plnStartDate) params.set("startDate", plnStartDate);
      if (plnEndDate) params.set("endDate", plnEndDate);
      params.set("page", String(plnPage));
      params.set("limit", "20");

      const res = await fetch(`/api/pelanggan?${params.toString()}`);
      const json = await res.json();
      setPlnTransaksi(json.transaksi ?? []);
      setPlnTotalPages(json.totalPages ?? 1);
      setPlnTotalCount(json.total ?? 0);
      setPlnSummary(json.summary ?? null);
      if (json.loketList) setPlnLoketList(json.loketList);
    } catch (err) {
      console.error("Fetch PLN error:", err);
    } finally {
      setPlnLoading(false);
    }
  }, [activeTab, plnSearch, plnFilterLoket, plnStartDate, plnEndDate, plnPage]);

  useEffect(() => { fetchPlnData(); }, [fetchPlnData]);

  // Reset PLN pagination when switching between Lunasin tabs
  useEffect(() => {
    if (activeTab !== "pdam") {
      setPlnPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Close loket dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterLoketRef.current && !filterLoketRef.current.contains(e.target as Node)) setFilterLoketOpen(false);
      if (formLoketRef.current && !formLoketRef.current.contains(e.target as Node)) setFormLoketOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredLoketList = loketList.filter((l) =>
    l.nama.toLowerCase().includes(filterLoketSearch.toLowerCase()) ||
    l.loketCode.toLowerCase().includes(filterLoketSearch.toLowerCase())
  );

  const filteredFormLoketList = loketList.filter((l) =>
    l.nama.toLowerCase().includes(formLoketSearch.toLowerCase()) ||
    l.loketCode.toLowerCase().includes(formLoketSearch.toLowerCase())
  );

  // Modal handlers
  const openAdd = () => {
    setEditMode(false);
    setFormData({ ...emptyForm });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (t: TransaksiData) => {
    setEditMode(true);
    setFormData({
      id: t.id, custId: t.custId, nama: t.nama, alamat: t.alamat,
      blth: t.blth, hargaAir: t.hargaAir, abodemen: t.abodemen,
      materai: t.materai, limbah: t.limbah, retribusi: t.retribusi,
      denda: t.denda, standLalu: t.standLalu, standKini: t.standKini,
      subTotal: t.subTotal, admin: t.admin, total: t.total,
      username: t.username, loketName: t.loketName, loketCode: t.loketCode,
      idgol: t.idgol, jenisLoket: t.jenisLoket,
      bebanTetap: t.bebanTetap, biayaMeter: t.biayaMeter,
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    try {
      const res = await fetch("/api/pelanggan", {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Terjadi kesalahan");
      } else {
        setModalOpen(false);
        fetchData();
      }
    } catch {
      setFormError("Gagal menyimpan data");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await fetch(`/api/pelanggan?id=${deleteConfirm.id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const openDetail = (t: TransaksiData) => {
    setDetailData(t);
    setDetailOpen(true);
  };

  // Update form number field
  const setNum = (field: string, val: string) => {
    setFormData({ ...formData, [field]: val === "" ? 0 : Number(val) });
  };

  // === PLN handlers ===
  const openPlnAdd = () => {
    setPlnEditMode(false);
    setPlnFormData({ ...emptyPlnForm });
    setPlnFormError("");
    setPlnModalOpen(true);
  };

  const openPlnEdit = (t: PlnTransaksiData) => {
    setPlnEditMode(true);
    setPlnFormData({
      id: t.id, custId: t.custId, nama: t.nama,
      kodeProduk: t.kodeProduk, periode: t.periode,
      rpAmount: t.rpAmount, rpAdmin: t.rpAdmin, rpTotal: t.rpTotal,
      username: t.username,
      loketName: t.loketName, loketCode: t.loketCode,
    });
    setPlnFormError("");
    setPlnModalOpen(true);
  };

  const handlePlnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlnFormError("");
    setPlnFormLoading(true);
    try {
      const res = await fetch("/api/pelanggan", {
        method: plnEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plnFormData, type: "pln" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPlnFormError(json.error || "Terjadi kesalahan");
      } else {
        setPlnModalOpen(false);
        fetchPlnData();
      }
    } catch {
      setPlnFormError("Gagal menyimpan data");
    } finally {
      setPlnFormLoading(false);
    }
  };

  const handlePlnDelete = async () => {
    if (!plnDeleteConfirm) return;
    try {
      await fetch(`/api/pelanggan?id=${plnDeleteConfirm.id}&type=pln`, { method: "DELETE" });
      setPlnDeleteConfirm(null);
      fetchPlnData();
    } catch (err) {
      console.error("Delete PLN error:", err);
    }
  };

  const setPlnNum = (field: string, val: string) => {
    setPlnFormData({ ...plnFormData, [field]: val === "" ? 0 : Number(val) });
  };

  // PLN loket dropdown refs
  const plnFilterLoketRef = useRef<HTMLDivElement>(null);
  const [plnFilterLoketOpen, setPlnFilterLoketOpen] = useState(false);
  const [plnFilterLoketSearch, setPlnFilterLoketSearch] = useState("");
  const plnFormLoketRef = useRef<HTMLDivElement>(null);
  const [plnFormLoketOpen, setPlnFormLoketOpen] = useState(false);
  const [plnFormLoketSearch, setPlnFormLoketSearch] = useState("");

  const filteredPlnLoketList = plnLoketList.filter((l) =>
    l.nama.toLowerCase().includes(plnFilterLoketSearch.toLowerCase()) ||
    l.loketCode.toLowerCase().includes(plnFilterLoketSearch.toLowerCase())
  );
  const filteredPlnFormLoketList = plnLoketList.filter((l) =>
    l.nama.toLowerCase().includes(plnFormLoketSearch.toLowerCase()) ||
    l.loketCode.toLowerCase().includes(plnFormLoketSearch.toLowerCase())
  );

  // Close PLN loket dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plnFilterLoketRef.current && !plnFilterLoketRef.current.contains(e.target as Node)) setPlnFilterLoketOpen(false);
      if (plnFormLoketRef.current && !plnFormLoketRef.current.contains(e.target as Node)) setPlnFormLoketOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Manajemen Pelanggan</h2>
          <p className="text-slate-500">Data transaksi pelanggan PDAM, PLN, BPJS, dan lainnya.</p>
        </div>
        {isWritable && (
        <button
          onClick={activeTab === "pdam" ? openAdd : openPlnAdd}
          className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-primary/20 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Tambah Transaksi
        </button>
        )}
      </header>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5">
        <button
          onClick={() => { setActiveTab("pdam"); setPlnPage(1); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === "pdam"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span className="material-symbols-outlined text-lg">water_drop</span>
          PDAM
        </button>
        <div className="w-px bg-slate-200 dark:bg-slate-700 my-1" />
        {LUNASIN_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPlnPage(1); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== PDAM TAB ===== */}
      {activeTab === "pdam" && (
      <>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <span className="material-symbols-outlined text-2xl">receipt_long</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Transaksi</p>
            <p className="text-xl font-bold">{formatNumber(summary?.totalTransaksi ?? 0)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">payments</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Nominal</p>
            <p className="text-xl font-bold">{formatRupiah(summary?.totalNominal ?? 0)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Admin</p>
            <p className="text-xl font-bold">{formatRupiah(summary?.totalAdmin ?? 0)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
            <span className="material-symbols-outlined text-2xl">group</span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Pelanggan Unik</p>
            <p className="text-xl font-bold">{formatNumber(summary?.uniqueCustomers ?? 0)}</p>
          </div>
        </div>
      </section>

      {/* Filter + Search */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Cari ID pelanggan, nama, alamat, kode transaksi..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="relative">
            <select
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              value={filterGolongan}
              onChange={(e) => { setFilterGolongan(e.target.value); setPage(1); }}
            >
              <option value="semua">Semua Golongan</option>
              {golonganList.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))} 
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
          </div>
          {isPrivilegedUser ? (
            <div className="relative" ref={filterLoketRef}>
              <button
                type="button"
                onClick={() => { setFilterLoketOpen(!filterLoketOpen); setFilterLoketSearch(""); }}
                className="h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-4 pr-10 appearance-none cursor-pointer text-left flex items-center min-w-[180px]"
              >
                <span className="truncate">
                  {filterLoket === "semua" ? "Semua Loket" : loketList.find((l) => l.loketCode === filterLoket)?.nama || filterLoket}
                </span>
              </button>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
              {filterLoketOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden min-w-[260px]">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                      <input
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                        placeholder="Cari loket..."
                        value={filterLoketSearch}
                        onChange={(e) => setFilterLoketSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setFilterLoket("semua"); setFilterLoketOpen(false); setPage(1); }}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                        filterLoket === "semua" ? "text-primary font-bold bg-primary/5" : ""
                      }`}
                    >
                      Semua Loket
                      {filterLoket === "semua" && <span className="material-symbols-outlined text-primary text-base">check</span>}
                    </button>
                    {filteredLoketList.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                    ) : (
                      filteredLoketList.map((l) => (
                        <button
                          type="button"
                          key={l.loketCode}
                          onClick={() => { setFilterLoket(l.loketCode); setFilterLoketOpen(false); setPage(1); }}
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
          ) : (
            <div className="h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm font-medium flex items-center min-w-[180px] text-slate-600 dark:text-slate-300">
              {currentLoketName || "Loket belum terhubung"}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="material-symbols-outlined text-lg">date_range</span>
            <span>Periode:</span>
          </div>
          <input
            type="date"
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          />
          <span className="text-slate-400 text-sm text-center">s/d</span>
          <input
            type="date"
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              Reset Tanggal
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-4 font-semibold">Tanggal</th>
                <th className="px-4 py-4 font-semibold">Pelanggan</th>
                <th className="px-4 py-4 font-semibold">Periode</th>
                <th className="px-4 py-4 font-semibold">Gol</th>
                <th className="px-4 py-4 font-semibold">Stand Meter</th>
                <th className="px-4 py-4 font-semibold text-right">Sub Total</th>
                <th className="px-4 py-4 font-semibold text-right">Admin</th>
                <th className="px-4 py-4 font-semibold text-right">Total</th>
                <th className="px-4 py-4 font-semibold">Loket</th>
                <th className="px-4 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      <span className="text-sm">Memuat data...</span>
                    </div>
                  </td>
                </tr>
              ) : transaksi.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada transaksi ditemukan.
                  </td>
                </tr>
              ) : (
                transaksi.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {t.transactionDate ? new Date(t.transactionDate).toLocaleDateString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                        }) : "-"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t.transactionDate ? new Date(t.transactionDate).toLocaleTimeString("id-ID", {
                          hour: "2-digit", minute: "2-digit",
                        }) : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 text-xs">
                          {t.nama.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate max-w-[160px]">{t.nama}</p>
                          <p className="text-[10px] text-slate-400">{t.custId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{formatPeriode(t.blth)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-[10px] font-black rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                        {t.idgol}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <span className="text-slate-400">{formatNumber(t.standLalu)}</span>
                        <span className="material-symbols-outlined text-xs text-slate-300 mx-1 align-middle">arrow_forward</span>
                        <span className="font-bold">{formatNumber(t.standKini)}</span>
                      </div>
                      <p className="text-[10px] text-primary font-medium mt-0.5">
                        Pakai: {formatNumber(t.standKini - t.standLalu)} m³
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-medium">{formatRupiah(t.subTotal)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm text-slate-500">{formatRupiah(t.admin)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(t.total)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-500 truncate max-w-[120px]">{t.loketName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => openDetail(t)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Detail transaksi"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        {isWritable && (<>
                        <button
                          onClick={() => openEdit(t)}
                          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit transaksi"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(t)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Hapus transaksi"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
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
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs text-slate-400">{formatNumber(totalCount)} transaksi</span>
            <nav className="flex items-center gap-1">
              <button
                className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((pg, idx, arr) => (
                  <React.Fragment key={pg}>
                    {idx > 0 && arr[idx - 1] !== pg - 1 && (
                      <span className="text-xs text-slate-400">…</span>
                    )}
                    <button
                      onClick={() => setPage(pg)}
                      className={page === pg
                        ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold"
                        : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                      }
                    >
                      {pg}
                    </button>
                  </React.Fragment>
                ))}
              <button
                className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center rounded-t-2xl shrink-0">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editMode ? "Edit Transaksi" : "Tambah Transaksi Baru"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">error</span>
                  {formError}
                </div>
              )}

              {/* Info Pelanggan */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Info Pelanggan</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">ID Pelanggan *</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.custId}
                      onChange={(e) => setFormData({ ...formData, custId: e.target.value })}
                      placeholder="ID Pelanggan"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nama *</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.nama}
                      onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                      placeholder="Nama pelanggan"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Alamat</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.alamat}
                      onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                      placeholder="Alamat pelanggan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Golongan</label>
                    <div className="relative">
                      <select
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                        value={formData.idgol}
                        onChange={(e) => setFormData({ ...formData, idgol: e.target.value })}
                      >
                        <option value="">Pilih Golongan</option>
                        {golonganList.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Periode (YYYYMM)</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.blth}
                      onChange={(e) => setFormData({ ...formData, blth: e.target.value })}
                      placeholder="cth: 202603"
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>

              {/* Stand Meter */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Stand Meter</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Stand Lalu</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.standLalu || ""}
                      onChange={(e) => setNum("standLalu", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Stand Kini</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.standKini || ""}
                      onChange={(e) => setNum("standKini", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Rincian Tagihan */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rincian Tagihan</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {([
                    ["hargaAir", "Harga Air"],
                    ["abodemen", "Abonemen"],
                    ["limbah", "Limbah"],
                    ["retribusi", "Retribusi"],
                    ["materai", "Materai"],
                    ["denda", "Denda"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={formData[key] || ""}
                        onChange={(e) => setNum(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Total</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Sub Total</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.subTotal || ""}
                      onChange={(e) => setNum("subTotal", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Admin</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.admin || ""}
                      onChange={(e) => setNum("admin", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Total</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.total || ""}
                      onChange={(e) => setNum("total", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Loket */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Info Loket</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Loket</label>
                    <div className="relative" ref={formLoketRef}>
                      <button
                        type="button"
                        onClick={() => { setFormLoketOpen(!formLoketOpen); setFormLoketSearch(""); }}
                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-4 pr-10 appearance-none cursor-pointer text-left flex items-center"
                      >
                        <span className={`truncate ${!formData.loketCode ? "text-slate-400" : ""}`}>
                          {formData.loketCode ? (loketList.find((l) => l.loketCode === formData.loketCode)?.nama || formData.loketCode) : "Pilih Loket"}
                        </span>
                      </button>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                      {formLoketOpen && (
                        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                              <input
                                type="text"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                placeholder="Cari loket..."
                                value={formLoketSearch}
                                onChange={(e) => setFormLoketSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredFormLoketList.length === 0 ? (
                              <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                            ) : (
                              filteredFormLoketList.map((l) => (
                                <button
                                  type="button"
                                  key={l.loketCode}
                                  onClick={() => {
                                    setFormData({ ...formData, loketCode: l.loketCode, loketName: l.nama });
                                    setFormLoketOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                                    formData.loketCode === l.loketCode ? "text-primary font-bold bg-primary/5" : ""
                                  }`}
                                >
                                  <span>
                                    {l.nama}
                                    <span className="text-xs text-slate-400 ml-1.5">{l.loketCode}</span>
                                  </span>
                                  {formData.loketCode === l.loketCode && <span className="material-symbols-outlined text-primary text-base">check</span>}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Username</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Username operator"
                    />
                  </div>
                </div>
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
                      <span className="material-symbols-outlined text-lg">{editMode ? "save" : "add_circle"}</span>
                      {editMode ? "Simpan" : "Tambah"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <h3 className="font-bold text-lg mb-2">Hapus Transaksi?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Transaksi <strong>{deleteConfirm.nama}</strong> ({deleteConfirm.custId}) periode {formatPeriode(deleteConfirm.blth)} akan dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailOpen && detailData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center rounded-t-2xl shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Detail Transaksi</h3>
                <p className="text-xs text-slate-400 mt-0.5">{detailData.transactionCode}</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Pelanggan Info */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {detailData.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold">{detailData.nama}</p>
                  <p className="text-sm text-slate-400">ID: {detailData.custId} &middot; Gol: {detailData.idgol}</p>
                  <p className="text-xs text-slate-400">{detailData.alamat}</p>
                </div>
              </div>

              {/* Periode & Meter */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-medium">Periode</p>
                  <p className="text-lg font-bold mt-1">{formatPeriode(detailData.blth)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-medium">Stand Meter</p>
                  <p className="text-lg font-bold mt-1">
                    {formatNumber(detailData.standLalu)} → {formatNumber(detailData.standKini)}
                  </p>
                  <p className="text-xs text-primary font-medium">Pakai: {formatNumber(detailData.standKini - detailData.standLalu)} m³</p>
                </div>
              </div>

              {/* Rincian */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rincian Tagihan</p>
                <div className="space-y-2">
                  {([
                    ["Harga Air", detailData.hargaAir],
                    ["Abonemen", detailData.abodemen],
                    ["Limbah", detailData.limbah],
                    ["Retribusi", detailData.retribusi],
                    ["Materai", detailData.materai],
                    ["Denda", detailData.denda],
                    ["Beban Tetap", detailData.bebanTetap],
                    ["Biaya Meter", detailData.biayaMeter],
                    ["Diskon", detailData.diskon],
                  ] as const).map(([label, val]) => val > 0 && (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-medium">{formatRupiah(val)}</span>
                    </div>
                  ))}
                  <hr className="border-slate-200 dark:border-slate-700" />
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Sub Total</span>
                    <span className="font-bold">{formatRupiah(detailData.subTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Admin</span>
                    <span className="font-medium">{formatRupiah(detailData.admin)}</span>
                  </div>
                  <hr className="border-slate-200 dark:border-slate-700" />
                  <div className="flex justify-between">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{formatRupiah(detailData.total)}</span>
                  </div>
                </div>
              </div>

              {/* Info Loket */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Loket</span>
                  <span className="font-medium">{detailData.loketName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kode Loket</span>
                  <span className="font-medium">{detailData.loketCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Username</span>
                  <span className="font-medium">{detailData.username || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Jenis Loket</span>
                  <span className="font-medium">{detailData.jenisLoket}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal</span>
                  <span className="font-medium">
                    {detailData.transactionDate ? new Date(detailData.transactionDate).toLocaleString("id-ID", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    }) : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      </>
      )}

      {/* ===== PLN TAB ===== */}
      {activeTab !== "pdam" && (
      <>
        {/* PLN Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
              <span className="material-symbols-outlined text-2xl">receipt_long</span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Transaksi {LUNASIN_TABS.find(t => t.key === activeTab)?.label || "Lunasin"}</p>
              <p className="text-xl font-bold">{formatNumber(plnSummary?.totalTransaksi ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg">
              <span className="material-symbols-outlined text-2xl">payments</span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Nominal</p>
              <p className="text-xl font-bold">{formatRupiah(plnSummary?.totalNominal ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 rounded-lg">
              <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Admin</p>
              <p className="text-xl font-bold">{formatRupiah(plnSummary?.totalAdmin ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
              <span className="material-symbols-outlined text-2xl">group</span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Pelanggan Unik</p>
              <p className="text-xl font-bold">{formatNumber(plnSummary?.uniqueCustomers ?? 0)}</p>
            </div>
          </div>
        </section>

        {/* PLN Filter + Search */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Cari ID pelanggan, nama, loket..."
                value={plnSearch}
                onChange={(e) => { setPlnSearch(e.target.value); setPlnPage(1); }}
              />
            </div>
            {isPrivilegedUser ? (
              <div className="relative" ref={plnFilterLoketRef}>
                <button
                  type="button"
                  onClick={() => { setPlnFilterLoketOpen(!plnFilterLoketOpen); setPlnFilterLoketSearch(""); }}
                  className="h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-4 pr-10 appearance-none cursor-pointer text-left flex items-center min-w-[180px]"
                >
                  <span className="truncate">
                    {plnFilterLoket === "semua" ? "Semua Loket" : plnLoketList.find((l) => l.loketCode === plnFilterLoket)?.nama || plnFilterLoket}
                  </span>
                </button>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                {plnFilterLoketOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden min-w-[260px]">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                        <input
                          type="text"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                          placeholder="Cari loket..."
                          value={plnFilterLoketSearch}
                          onChange={(e) => setPlnFilterLoketSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setPlnFilterLoket("semua"); setPlnFilterLoketOpen(false); setPlnPage(1); }}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                          plnFilterLoket === "semua" ? "text-primary font-bold bg-primary/5" : ""
                        }`}
                      >
                        Semua Loket
                        {plnFilterLoket === "semua" && <span className="material-symbols-outlined text-primary text-base">check</span>}
                      </button>
                      {filteredPlnLoketList.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                      ) : (
                        filteredPlnLoketList.map((l) => (
                          <button
                            type="button"
                            key={l.loketCode}
                            onClick={() => { setPlnFilterLoket(l.loketCode); setPlnFilterLoketOpen(false); setPlnPage(1); }}
                            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                              plnFilterLoket === l.loketCode ? "text-primary font-bold bg-primary/5" : ""
                            }`}
                          >
                            <span>
                              {l.nama}
                              <span className="text-xs text-slate-400 ml-1.5">{l.loketCode}</span>
                            </span>
                            {plnFilterLoket === l.loketCode && <span className="material-symbols-outlined text-primary text-base">check</span>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm font-medium flex items-center min-w-[180px] text-slate-600 dark:text-slate-300">
                {currentLoketName || "Loket belum terhubung"}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="material-symbols-outlined text-lg">date_range</span>
              <span>Periode:</span>
            </div>
            <input
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              value={plnStartDate}
              onChange={(e) => { setPlnStartDate(e.target.value); setPlnPage(1); }}
            />
            <span className="text-slate-400 text-sm text-center">s/d</span>
            <input
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              value={plnEndDate}
              onChange={(e) => { setPlnEndDate(e.target.value); setPlnPage(1); }}
            />
            {(plnStartDate || plnEndDate) && (
              <button
                onClick={() => { setPlnStartDate(""); setPlnEndDate(""); setPlnPage(1); }}
                className="text-xs text-red-500 hover:text-red-600 font-medium"
              >
                Reset Tanggal
              </button>
            )}
          </div>
        </div>

        {/* PLN/Lunasin Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-4 font-semibold">Tanggal</th>
                  <th className="px-4 py-4 font-semibold">Pelanggan</th>
                  <th className="px-4 py-4 font-semibold">Produk</th>
                  <th className="px-4 py-4 font-semibold">Periode</th>
                  <th className="px-4 py-4 font-semibold text-right">Tagihan</th>
                  <th className="px-4 py-4 font-semibold text-right">Admin</th>
                  <th className="px-4 py-4 font-semibold text-right">Total</th>
                  <th className="px-4 py-4 font-semibold">Loket</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {plnLoading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <span className="material-symbols-outlined animate-spin">progress_activity</span>
                        <span className="text-sm">Memuat data...</span>
                      </div>
                    </td>
                  </tr>
                ) : plnTransaksi.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-sm">
                      Tidak ada transaksi {LUNASIN_TABS.find(t => t.key === activeTab)?.label || "Lunasin"} ditemukan.
                    </td>
                  </tr>
                ) : (
                  plnTransaksi.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {t.transactionDate ? new Date(t.transactionDate).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                          }) : "-"}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {t.transactionDate ? new Date(t.transactionDate).toLocaleTimeString("id-ID", {
                            hour: "2-digit", minute: "2-digit",
                          }) : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 font-bold shrink-0 text-xs">
                            <span className="material-symbols-outlined text-lg">bolt</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate max-w-[160px]">{t.nama}</p>
                            <p className="text-[10px] text-slate-400">{t.custId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{getProdukLabel(t.kodeProduk)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium">{t.kodeProduk?.replace(/-\d+$/, "") === "pln-prepaid" ? "-" : (t.periode || "-")}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-medium">{formatRupiah(t.rpAmount)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm text-slate-500">{formatRupiah(t.rpAdmin)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(t.rpTotal)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-500 truncate max-w-[120px]">{t.loketName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          (t.processingStatus === "SUCCESS" || t.flagTransaksi === "1" || t.flagTransaksi === "LUNAS")
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : (t.processingStatus === "FAILED" || t.flagTransaksi === "GAGAL")
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : t.processingStatus === "PENDING"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {t.processingStatus || t.flagTransaksi || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => { setPlnDetailData(t); setPlnDetailOpen(true); }}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Detail transaksi"
                          >
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                          {isWritable && (<>
                          <button
                            onClick={() => openPlnEdit(t)}
                            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit transaksi"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={() => setPlnDeleteConfirm(t)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Hapus transaksi"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
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

          {/* PLN Pagination */}
          {plnTotalPages > 1 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-400">{formatNumber(plnTotalCount)} transaksi</span>
              <nav className="flex items-center gap-1">
                <button
                  className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                  disabled={plnPage === 1}
                  onClick={() => setPlnPage((p) => Math.max(1, p - 1))}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                {Array.from({ length: plnTotalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === plnTotalPages || Math.abs(p - plnPage) <= 1)
                  .map((pg, idx, arr) => (
                    <React.Fragment key={pg}>
                      {idx > 0 && arr[idx - 1] !== pg - 1 && (
                        <span className="text-xs text-slate-400">…</span>
                      )}
                      <button
                        onClick={() => setPlnPage(pg)}
                        className={plnPage === pg
                          ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold"
                          : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                        }
                      >
                        {pg}
                      </button>
                    </React.Fragment>
                  ))}
                <button
                  className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                  disabled={plnPage === plnTotalPages}
                  onClick={() => setPlnPage((p) => Math.min(plnTotalPages, p + 1))}
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* PLN/Lunasin Add/Edit Modal */}
        {plnModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPlnModalOpen(false)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
              <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center rounded-t-2xl shrink-0">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {plnEditMode ? `Edit Transaksi ${LUNASIN_TABS.find(t => t.key === activeTab)?.label || "Lunasin"}` : `Tambah Transaksi ${LUNASIN_TABS.find(t => t.key === activeTab)?.label || "Lunasin"}`}
                </h3>
                <button onClick={() => setPlnModalOpen(false)} className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-500">close</span>
                </button>
              </div>
              <form onSubmit={handlePlnSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                {plnFormError && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">error</span>
                    {plnFormError}
                  </div>
                )}

                {/* Info Pelanggan */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Info Pelanggan</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">ID Pelanggan *</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.custId}
                        onChange={(e) => setPlnFormData({ ...plnFormData, custId: e.target.value })}
                        placeholder="ID Pelanggan"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nama *</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.nama}
                        onChange={(e) => setPlnFormData({ ...plnFormData, nama: e.target.value })}
                        placeholder="Nama pelanggan"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Kode Produk</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.kodeProduk}
                        onChange={(e) => setPlnFormData({ ...plnFormData, kodeProduk: e.target.value })}
                        placeholder="cth: PLNPASCH"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Periode</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.periode}
                        onChange={(e) => setPlnFormData({ ...plnFormData, periode: e.target.value })}
                        placeholder="cth: 202603"
                      />
                    </div>
                  </div>
                </div>

                {/* Rincian Tagihan */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rincian Tagihan</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tagihan</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.rpAmount || ""}
                        onChange={(e) => setPlnNum("rpAmount", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Biaya Admin</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.rpAdmin || ""}
                        onChange={(e) => setPlnNum("rpAdmin", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Total</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.rpTotal || ""}
                        onChange={(e) => setPlnNum("rpTotal", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Loket PLN */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Info Loket</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Loket</label>
                      <div className="relative" ref={plnFormLoketRef}>
                        <button
                          type="button"
                          onClick={() => { setPlnFormLoketOpen(!plnFormLoketOpen); setPlnFormLoketSearch(""); }}
                          className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none pl-4 pr-10 appearance-none cursor-pointer text-left flex items-center"
                        >
                          <span className={`truncate ${!plnFormData.loketCode ? "text-slate-400" : ""}`}>
                            {plnFormData.loketCode ? (plnLoketList.find((l) => l.loketCode === plnFormData.loketCode)?.nama || plnFormData.loketCode) : "Pilih Loket"}
                          </span>
                        </button>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                        {plnFormLoketOpen && (
                          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                              <div className="relative">
                                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                                <input
                                  type="text"
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                  placeholder="Cari loket..."
                                  value={plnFormLoketSearch}
                                  onChange={(e) => setPlnFormLoketSearch(e.target.value)}
                                  autoFocus
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredPlnFormLoketList.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                              ) : (
                                filteredPlnFormLoketList.map((l) => (
                                  <button
                                    type="button"
                                    key={l.loketCode}
                                    onClick={() => {
                                      setPlnFormData({ ...plnFormData, loketCode: l.loketCode, loketName: l.nama });
                                      setPlnFormLoketOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${
                                      plnFormData.loketCode === l.loketCode ? "text-primary font-bold bg-primary/5" : ""
                                    }`}
                                  >
                                    <span>
                                      {l.nama}
                                      <span className="text-xs text-slate-400 ml-1.5">{l.loketCode}</span>
                                    </span>
                                    {plnFormData.loketCode === l.loketCode && <span className="material-symbols-outlined text-primary text-base">check</span>}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Username</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={plnFormData.username}
                        onChange={(e) => setPlnFormData({ ...plnFormData, username: e.target.value })}
                        placeholder="Username operator"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setPlnModalOpen(false)}
                    className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={plnFormLoading}
                    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-md shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {plnFormLoading ? (
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">{plnEditMode ? "save" : "add_circle"}</span>
                        {plnEditMode ? "Simpan" : "Tambah"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* PLN/Lunasin Delete Confirmation Modal */}
        {plnDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPlnDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl">delete_forever</span>
              </div>
              <h3 className="font-bold text-lg mb-2">Hapus Transaksi {LUNASIN_TABS.find(t => t.key === activeTab)?.label || "Lunasin"}?</h3>
              <p className="text-sm text-slate-500 mb-6">
                Transaksi <strong>{plnDeleteConfirm.nama}</strong> ({plnDeleteConfirm.custId}) produk {plnDeleteConfirm.kodeProduk || "-"} akan dihapus permanen.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPlnDeleteConfirm(null)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handlePlnDelete}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PLN/Lunasin Detail Modal */}
        {plnDetailOpen && plnDetailData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPlnDetailOpen(false)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
              <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center rounded-t-2xl shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Detail Transaksi {getProdukLabel(plnDetailData.kodeProduk)}</h3>
                  {plnDetailData.transactionCode && (
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{plnDetailData.transactionCode}</p>
                  )}
                </div>
                <button onClick={() => setPlnDetailOpen(false)} className="size-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-500">close</span>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-6 space-y-5">
                {/* Pelanggan Info */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-600">
                    <span className="material-symbols-outlined text-2xl">{LUNASIN_TABS.find(t => t.key === activeTab)?.icon || "bolt"}</span>
                  </div>
                  <div>
                    <p className="font-bold">{plnDetailData.nama}</p>
                    <p className="text-sm text-slate-400">ID: {plnDetailData.custId}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                      {getProdukLabel(plnDetailData.kodeProduk)}
                    </p>
                  </div>
                </div>

                {/* Produk & Periode */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Produk</p>
                    <p className="text-sm font-bold mt-1">{getProdukLabel(plnDetailData.kodeProduk)}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{plnDetailData.kodeProduk || "-"}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Periode</p>
                    <p className="text-sm font-bold mt-1">{plnDetailData.kodeProduk?.replace(/-\d+$/, "") === "pln-prepaid" ? "-" : (plnDetailData.periode || "-")}</p>
                    {plnDetailData.kodeProduk?.replace(/-\d+$/, "") !== "pln-prepaid" && plnDetailData.jumBill > 0 && (
                      <p className="text-[10px] text-primary font-medium mt-0.5">{plnDetailData.jumBill} bulan tagihan</p>
                    )}
                  </div>
                </div>

                {/* Token PLN (prominent) */}
                {(() => {
                  const tokenVal = pvLunasin(plnDetailData, "token", "tokenPln", "token_pln");
                  return tokenVal ? (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-300 dark:border-amber-700">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-500 text-2xl">key</span>
                        <div>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">Token PLN</p>
                          <p className="font-mono font-bold text-lg text-amber-700 dark:text-amber-300 tracking-[0.2em]">{tokenVal}</p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Detail dari Provider Response (data-driven) */}
                {(() => {
                  const fields = getLunasinDetailFields(plnDetailData);
                  return fields.length > 0 ? (
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detail Provider</p>
                      <div className="space-y-2">
                        {fields.map((f) => (
                          <div key={f.label} className="flex justify-between text-sm">
                            <span className="text-slate-500">{f.label}</span>
                            <span className="font-medium text-right max-w-[60%] break-all">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Rincian Tagihan */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Rincian Tagihan</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Tagihan</span>
                      <span className="font-medium">{formatRupiah(plnDetailData.rpAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Biaya Admin</span>
                      <span className="font-medium">{formatRupiah(plnDetailData.rpAdmin)}</span>
                    </div>
                    <hr className="border-slate-200 dark:border-slate-700" />
                    <div className="flex justify-between">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{formatRupiah(plnDetailData.rpTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Info Loket & Status */}
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Loket</span>
                    <span className="font-medium">{plnDetailData.loketName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kode Loket</span>
                    <span className="font-medium">{plnDetailData.loketCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Username</span>
                    <span className="font-medium">{plnDetailData.username || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status</span>
                    <span className={`font-bold ${
                      plnDetailData.processingStatus === "SUCCESS" ? "text-emerald-600" :
                      plnDetailData.processingStatus === "FAILED" ? "text-red-600" :
                      plnDetailData.processingStatus === "PENDING" ? "text-amber-600" : ""
                    }`}>{plnDetailData.processingStatus || plnDetailData.flagTransaksi || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tanggal</span>
                    <span className="font-medium">
                      {plnDetailData.transactionDate ? new Date(plnDetailData.transactionDate).toLocaleString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      }) : "-"}
                    </span>
                  </div>
                  {plnDetailData.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dibayar</span>
                      <span className="font-medium text-emerald-600">
                        {new Date(plnDetailData.paidAt).toLocaleString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {plnDetailData.failedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gagal</span>
                      <span className="font-medium text-red-600">
                        {new Date(plnDetailData.failedAt).toLocaleString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
      )}
    </>
  );
}
