"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";
import { formatRupiah } from "@/data/mock";
import { printReceipt } from "@/lib/print-receipt";
import type { CustomerFavorite, FavoriteGroup } from "@/types";
import { PULSA_OPERATORS, DATA_OPERATORS, PULSA_NOMINALS, DATA_PACKAGES, PDAM_KALIMANTAN } from "@/data/lunasin-products";

// PDAM bill item from inquiry API
interface PdamBill {
  idpel: string;
  nama: string;
  alamat: string;
  gol: string;
  thbln: string;
  harga: number;
  denda: number;
  materai: number;
  limbah: number;
  retribusi: number;
  standLalu: number;
  standKini: number;
  subTotal: number;
  biayaMeter: number;
  bebanTetap: number;
  abodemen: number;
  total: number;
  pakai: number;
  diskon: number;
}

// Lunasin multi-product bill item
type LunasinProduk =
  | "pln-postpaid" | "pln-prepaid" | "pln-nonrek"
  | "bpjs-kesehatan" | "telkom-telepon" | "pdam-kota-banjarmasin";

type ProdukCategory = "PLN" | "BPJS" | "Telkom" | "PDAM Lunasin";

const LUNASIN_PRODUK_OPTIONS: { value: LunasinProduk; label: string; icon: string; needsNominal: boolean; category: ProdukCategory; activeClass: string }[] = [
  // PLN
  { value: "pln-postpaid", label: "Pascabayar", icon: "electric_meter", needsNominal: false, category: "PLN", activeClass: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold shadow-sm" },
  { value: "pln-prepaid", label: "Prabayar (Token)", icon: "bolt", needsNominal: true, category: "PLN", activeClass: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold shadow-sm" },
  { value: "pln-nonrek", label: "Non-Rekening", icon: "receipt_long", needsNominal: false, category: "PLN", activeClass: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold shadow-sm" },
  // BPJS
  { value: "bpjs-kesehatan", label: "BPJS Kesehatan", icon: "health_and_safety", needsNominal: false, category: "BPJS", activeClass: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 font-bold shadow-sm" },
  // Telkom
  { value: "telkom-telepon", label: "Telkom Telepon", icon: "call", needsNominal: false, category: "Telkom", activeClass: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 font-bold shadow-sm" },
  // PDAM (via Lunasin)
  { value: "pdam-kota-banjarmasin", label: "PDAM Banjarmasin", icon: "water_drop", needsNominal: false, category: "PDAM Lunasin", activeClass: "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-bold shadow-sm" },
];

const PLN_NOMINAL_OPTIONS = [20000, 50000, 100000, 200000, 500000, 1000000];

// Tab configuration
type LayananTab = "PDAM" | "PLN" | "BPJS" | "TELKOM" | "PULSA" | "PAKET_DATA" | "PDAM_KAL";

const LAYANAN_TABS: { value: LayananTab; label: string; icon: string; color: string; defaultProduk: string }[] = [
  { value: "PDAM", label: "PDAM", icon: "water_drop", color: "text-primary", defaultProduk: "pln-postpaid" },
  { value: "PLN", label: "PLN", icon: "bolt", color: "text-amber-600", defaultProduk: "pln-postpaid" },
  { value: "BPJS", label: "BPJS", icon: "health_and_safety", color: "text-green-600", defaultProduk: "bpjs-kesehatan" },
  { value: "TELKOM", label: "Telkom", icon: "call", color: "text-red-600", defaultProduk: "telkom-telepon" },
  { value: "PULSA", label: "Pulsa", icon: "smartphone", color: "text-purple-600", defaultProduk: "" },
  { value: "PAKET_DATA", label: "Paket Data", icon: "wifi", color: "text-cyan-600", defaultProduk: "" },
  { value: "PDAM_KAL", label: "PDAM Lunasin", icon: "water_drop", color: "text-sky-600", defaultProduk: "" },
];

const TAB_THEME: Record<LayananTab, { bg: string; text: string; btnBg: string; btnHover: string; shadow: string }> = {
  PDAM: { bg: "bg-primary", text: "text-primary", btnBg: "bg-primary", btnHover: "hover:bg-primary/90", shadow: "shadow-primary/20" },
  PLN: { bg: "bg-amber-600", text: "text-amber-600", btnBg: "bg-amber-600", btnHover: "hover:bg-amber-700", shadow: "shadow-amber-600/20" },
  BPJS: { bg: "bg-green-600", text: "text-green-600", btnBg: "bg-green-600", btnHover: "hover:bg-green-700", shadow: "shadow-green-600/20" },
  TELKOM: { bg: "bg-red-600", text: "text-red-600", btnBg: "bg-red-600", btnHover: "hover:bg-red-700", shadow: "shadow-red-600/20" },
  PULSA: { bg: "bg-purple-600", text: "text-purple-600", btnBg: "bg-purple-600", btnHover: "hover:bg-purple-700", shadow: "shadow-purple-600/20" },
  PAKET_DATA: { bg: "bg-cyan-600", text: "text-cyan-600", btnBg: "bg-cyan-600", btnHover: "hover:bg-cyan-700", shadow: "shadow-cyan-600/20" },
  PDAM_KAL: { bg: "bg-sky-600", text: "text-sky-600", btnBg: "bg-sky-600", btnHover: "hover:bg-sky-700", shadow: "shadow-sky-600/20" },
};

interface LunasinBill {
  idpel: string;
  nama: string;
  kodeProduk: string;
  idTrx: string;
  rpAmount: number;
  rpAdmin: number;
  rpTotal: number;
  periode: string;
  jumBill: string;
  tarif: string;
  daya: string;
  standMeter: string;
  tokenPln: string;
  input2: string;
  detail: Array<{ periode?: string; stand_meter?: string; rp_amount?: string; [key: string]: unknown }>;
  // PLN Non-Rekening specific
  noreg: string;
  tgl_reg: string;
  jenis_reg: string;
  // BPJS-specific
  nova: string;
  novaKepalaKeluarga: string;
  jumPeserta: string;
  kodeCabang: string;
  namaCabang: string;
  sisaSaldoBpjs: string;
  // Telkom & general Lunasin fields
  refnum: string;
  tglLunas: string;
  // Pulsa & Paket Data specific
  nomor: string;
  denom: string;
  namaProduk: string;
  serialNumber: string;
  masaBerlaku: string;
}

interface UnifiedCartItem {
  itemCode: string;
  provider: "PDAM" | "LUNASIN";
  serviceType: string;
  customerId: string;
  customerName: string;
  productCode: string;
  periodLabel: string;
  providerRef?: string;
  amount: number;
  adminFee: number;
  total: number;
  metadata: Record<string, unknown>;
}

interface PaymentResult {
  itemCode?: string;
  idpel: string;
  transactionCode: string;
  success: boolean;
  error?: string;
  total: number;
  nama: string;
  blth: string;
  provider?: "PDAM" | "LUNASIN";
  serviceType?: string;
  adminFee?: number;
  finalStatus?: string;
  kodeProduk?: string;
  providerData?: Record<string, unknown>;
}

interface ReceiptData {
  results: PaymentResult[];
  loketCode: string;
  loketName: string;
  biayaAdmin: number;
  totalAdmin: number;
  paidAt: string;
  totalBayar: number;
  tunai: number;
  kembalian: number;
  allSuccess: boolean;
  partialSuccess: boolean;
  message: string;
}

type FocusTarget = "customer" | "payment";

export default function PembayaranPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const [activeTab, setActiveTab] = useState<LayananTab>("PDAM");
  const isLunasinTab = activeTab !== "PDAM";
  const tabTheme = TAB_THEME[activeTab];
  const currentTabConfig = LAYANAN_TABS.find((t) => t.value === activeTab)!;
  const [nomorPelanggan, setNomorPelanggan] = useState("");
  const [daftarTagihan, setDaftarTagihan] = useState<PdamBill[]>([]);
  const [paymentInput, setPaymentInput] = useState("");
  const [paymentIntentKey, setPaymentIntentKey] = useState<string | null>(null);
  const [multiPayIntentKey, setMultiPayIntentKey] = useState<string | null>(null);
  const [biayaAdminPerTagihan, setBiayaAdminPerTagihan] = useState(0);
  const [loketInfo, setLoketInfo] = useState<{ loketCode: string; nama: string; biayaAdmin: number; pulsa: number; plnAdminTier: number } | null>(null);
  const [loketLoading, setLoketLoading] = useState(true);

  // Lunasin multi-product state
  const [plnNomorPelanggan, setPlnNomorPelanggan] = useState("");
  const [plnProduk, setPlnProduk] = useState<string>("pln-postpaid");
  const [plnNominal, setPlnNominal] = useState<number>(0);
  const [daftarTagihanPln, setDaftarTagihanPln] = useState<LunasinBill[]>([]);
  const [plnPaymentInput, setPlnPaymentInput] = useState("");
  const [plnPaymentIntentKey, setPlnPaymentIntentKey] = useState<string | null>(null);

  // Pulsa & Paket Data state
  const [selectedOperator, setSelectedOperator] = useState("");
  const [selectedPulsaNominal, setSelectedPulsaNominal] = useState<number>(0);
  const [selectedDataPackage, setSelectedDataPackage] = useState("");
  const [dataSearchQuery, setDataSearchQuery] = useState("");
  const [dataCategory, setDataCategory] = useState("");
  const [selectedPdamKal, setSelectedPdamKal] = useState("");
  const [pdamKalSearch, setPdamKalSearch] = useState("");
  const [pdamDropdownOpen, setPdamDropdownOpen] = useState(false);
  const [dataDropdownOpen, setDataDropdownOpen] = useState(false);

  const selectedPlnProduk = LUNASIN_PRODUK_OPTIONS.find((p) => p.value === plnProduk) ?? null;

  // Loading & error states
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receipt modal
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [daftarTagihanSnapshot, setDaftarTagihanSnapshot] = useState<PdamBill[]>([]);
  const [scannerHint, setScannerHint] = useState("");

  // Cetak ulang struk
  const [reprintIdpel, setReprintIdpel] = useState("");
  const [reprintLoading, setReprintLoading] = useState(false);
  const [reprintError, setReprintError] = useState("");

  // Favorit pelanggan
  const [favorites, setFavorites] = useState<CustomerFavorite[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [favoriteSavingId, setFavoriteSavingId] = useState<string | null>(null);
  const [favoriteDeletingId, setFavoriteDeletingId] = useState<number | null>(null);

  // Grup favorit
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDeletingId, setGroupDeletingId] = useState<number | null>(null);
  const [saveGroupModalOpen, setSaveGroupModalOpen] = useState(false);
  const [saveGroupName, setSaveGroupName] = useState("");
  const [saveGroupLoading, setSaveGroupLoading] = useState(false);
  const [groupInquiryLoading, setGroupInquiryLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLInputElement>(null);
  const scanSubmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load loket from logged-in user's profile
  useEffect(() => {
    if (!userId) return;
    setLoketLoading(true);
    Promise.all([
      fetch(`/api/pengaturan/profil?userId=${userId}`).then((r) => r.json()),
      fetch("/api/loket").then((r) => r.json()),
    ])
      .then(([profile, loketData]) => {
        if (profile?.loket) {
          const lokets = loketData.lokets ?? [];
          const matched = lokets.find(
            (l: { loketCode: string }) => l.loketCode === profile.loket.loketCode
          );
          const info = {
            loketCode: profile.loket.loketCode,
            nama: profile.loket.nama,
            biayaAdmin: matched?.biayaAdmin ?? 0,
            pulsa: matched?.pulsa ?? 0,
            plnAdminTier: matched?.plnAdminTier ?? 3000,
          };
          setLoketInfo(info);
          setBiayaAdminPerTagihan(info.biayaAdmin);
        }
      })
      .catch(() => {})
      .finally(() => setLoketLoading(false));
  }, [userId]);

  async function fetchFavorites(serviceType: LayananTab = activeTab) {
    if (!userId) return;
    setFavoritesLoading(true);
    setFavoritesError("");

    try {
      const params = new URLSearchParams({ serviceType });
      const res = await fetch(`/api/favorites?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setFavoritesError(data.error || "Gagal memuat favorit pelanggan");
        return;
      }

      setFavorites(data.favorites || []);
    } catch {
      setFavoritesError("Gagal memuat favorit pelanggan");
    } finally {
      setFavoritesLoading(false);
    }
  }

  useEffect(() => {
    void fetchFavorites(activeTab);
  }, [userId, activeTab]);

  async function fetchFavoriteGroups() {
    if (!userId) return;
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/favorites/groups");
      const data = await res.json();
      if (res.ok) setFavoriteGroups(data.groups || []);
    } catch { /* silent */ }
    finally { setGroupsLoading(false); }
  }

  useEffect(() => {
    void fetchFavoriteGroups();
  }, [userId]);

  function focusField(target: FocusTarget = "customer") {
    window.requestAnimationFrame(() => {
      const element = target === "customer" ? inputRef.current : paymentRef.current;
      element?.focus();
      element?.select();
    });
  }

  useEffect(() => {
    if (receipt) return;
    focusField((daftarTagihan.length > 0 || daftarTagihanPln.length > 0) ? "payment" : "customer");
  }, [receipt, daftarTagihan.length, daftarTagihanPln.length]);

  const totalTagihan = useMemo(
    () => daftarTagihan.reduce((sum, t) => sum + t.total, 0),
    [daftarTagihan]
  );
  const biayaAdmin = daftarTagihan.length * biayaAdminPerTagihan;
  const totalBayar = totalTagihan + biayaAdmin;

  const parsedPayment = useMemo(() => {
    const num = Number(paymentInput.replace(/\./g, "").replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
  }, [paymentInput]);

  const kembalian = useMemo(
    () => (parsedPayment > totalBayar ? parsedPayment - totalBayar : 0),
    [parsedPayment, totalBayar]
  );

  // PLN computed values
  const totalTagihanPln = useMemo(
    () => daftarTagihanPln.reduce((sum, t) => sum + t.rpTotal, 0),
    [daftarTagihanPln]
  );
  const biayaAdminPln = useMemo(
    () => daftarTagihanPln.reduce((sum, t) => sum + t.rpAdmin, 0),
    [daftarTagihanPln]
  );
  const totalBayarPln = totalTagihanPln;

  const unifiedCart = useMemo<UnifiedCartItem[]>(() => {
    const pdamItems: UnifiedCartItem[] = daftarTagihan.map((bill, idx) => ({
      itemCode: `PDAM-${bill.idpel}-${bill.thbln}-${idx}`,
      provider: "PDAM",
      serviceType: "PDAM_NATIVE",
      customerId: bill.idpel,
      customerName: bill.nama,
      productCode: "PDAM_NATIVE",
      periodLabel: bill.thbln,
      amount: bill.total,
      adminFee: biayaAdminPerTagihan,
      total: bill.total + biayaAdminPerTagihan,
      metadata: {
        nama: bill.nama,
        alamat: bill.alamat,
        blth: bill.thbln,
        gol: bill.gol,
        idgol: bill.gol,
        harga: bill.harga,
        denda: bill.denda,
        materai: bill.materai,
        limbah: bill.limbah,
        retribusi: bill.retribusi,
        standLalu: bill.standLalu,
        standKini: bill.standKini,
        subTotal: bill.subTotal,
        biayaMeter: bill.biayaMeter,
        bebanTetap: bill.bebanTetap,
        abodemen: bill.abodemen,
        total: bill.total,
        diskon: bill.diskon,
        pakai: bill.pakai,
      },
    }));

    const lunasinItems: UnifiedCartItem[] = daftarTagihanPln.map((bill, idx) => ({
      itemCode: `LUNASIN-${bill.idpel}-${bill.kodeProduk}-${idx}`,
      provider: "LUNASIN",
      serviceType: getLunasinServiceType(bill.kodeProduk),
      customerId: bill.idpel,
      customerName: bill.nama,
      productCode: bill.kodeProduk,
      periodLabel: bill.periode || bill.jenis_reg || bill.kodeProduk,
      providerRef: bill.idTrx,
      amount: bill.rpAmount,
      adminFee: bill.rpAdmin,
      total: bill.rpTotal,
      metadata: {
        nama: bill.nama,
        kodeProduk: bill.kodeProduk,
        idTrx: bill.idTrx,
        periode: bill.periode,
        tarif: bill.tarif,
        daya: bill.daya,
        jumBill: bill.jumBill,
        input2: bill.input2,
        detail: bill.detail,
        standMeter: bill.standMeter,
        noreg: bill.noreg,
        tgl_reg: bill.tgl_reg,
        jenis_reg: bill.jenis_reg,
      },
    }));

    return [...pdamItems, ...lunasinItems];
  }, [daftarTagihan, daftarTagihanPln, biayaAdminPerTagihan]);

  // Unified totals across all providers
  const grandTotalBayar = useMemo(
    () => unifiedCart.reduce((sum, item) => sum + item.total, 0),
    [unifiedCart]
  );
  const hasPdamBills = unifiedCart.some((item) => item.provider === "PDAM");
  const hasPlnBills = unifiedCart.some((item) => item.provider === "LUNASIN");
  const hasMultiProvider = hasPdamBills && hasPlnBills;
  const hasAnyBills = unifiedCart.length > 0;

  // Single unified tunai input
  const [unifiedPaymentInput, setUnifiedPaymentInput] = useState("");

  const parsedUnifiedPayment = useMemo(() => {
    const num = Number(unifiedPaymentInput.replace(/\./g, "").replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
  }, [unifiedPaymentInput]);

  const unifiedKembalian = useMemo(
    () => (parsedUnifiedPayment > grandTotalBayar ? parsedUnifiedPayment - grandTotalBayar : 0),
    [parsedUnifiedPayment, grandTotalBayar]
  );

  const parsedPlnPayment = useMemo(() => {
    const num = Number(plnPaymentInput.replace(/\./g, "").replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
  }, [plnPaymentInput]);

  const kembalianPln = useMemo(
    () => (parsedPlnPayment > totalBayarPln ? parsedPlnPayment - totalBayarPln : 0),
    [parsedPlnPayment, totalBayarPln]
  );

  function generateIdempotencyKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // Reset payment intent key when payload changes
  useEffect(() => {
    setPaymentIntentKey(null);
  }, [daftarTagihan, loketInfo?.loketCode, biayaAdminPerTagihan]);

  useEffect(() => {
    setMultiPayIntentKey(null);
  }, [daftarTagihan, daftarTagihanPln, loketInfo?.loketCode, biayaAdminPerTagihan]);

  useEffect(() => {
    setPlnPaymentIntentKey(null);
  }, [daftarTagihanPln, loketInfo?.loketCode]);

  function getLunasinServiceType(kodeProduk: string): string {
    if (kodeProduk.startsWith("pln-postpaid")) return "PLN_POSTPAID";
    if (kodeProduk.startsWith("pln-prepaid")) return "PLN_PREPAID";
    if (kodeProduk.startsWith("pln-nonrek")) return "PLN_NONREK";
    if (kodeProduk.startsWith("bpjs")) return "BPJS";
    if (kodeProduk.startsWith("telkom")) return "TELKOM";
    if (kodeProduk.startsWith("pulsa")) return "PULSA";
    if (kodeProduk.startsWith("paketdata")) return "PAKET_DATA";
    if (kodeProduk.startsWith("pdam")) return "PDAM_LUNASIN";
    return "LUNASIN_SERVICE";
  }

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if (event.key === "Escape" && receipt) {
        event.preventDefault();
        handleCloseReceipt();
        return;
      }

      if (receipt) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTypingField =
        tagName === "input" ||
        tagName === "textarea" ||
        target?.getAttribute("contenteditable") === "true";

      if (event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        focusField("customer");
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        focusField("payment");
        return;
      }

      if (event.key === "F8") {
        event.preventDefault();
        if (!paymentLoading && hasAnyBills && loketInfo && parsedUnifiedPayment >= grandTotalBayar) {
          void handleBayarSemua();
        }
        return;
      }

      if (!isTypingField && event.key === "F2") {
        event.preventDefault();
        if (activeTab === "PDAM") void handleInquiry();
        else void handlePlnInquiry();
      }
    }

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [receipt, paymentLoading, daftarTagihan.length, loketInfo, parsedPayment, totalBayar, nomorPelanggan]);

  useEffect(() => {
    return () => {
      if (scanSubmitTimeoutRef.current) {
        clearTimeout(scanSubmitTimeoutRef.current);
      }
    };
  }, []);

  // PDAM inquiry via API
  async function handleInquiry(customerId?: string) {
    const targetCustomerId = (customerId ?? nomorPelanggan).trim();
    if (!targetCustomerId) return;

    // Check for duplicate
    if (daftarTagihan.some((t) => t.idpel === targetCustomerId)) {
      setInquiryError("Pelanggan ini sudah ada di daftar tagihan");
      return;
    }

    setInquiryLoading(true);
    setInquiryError("");

    try {
      const res = await fetch("/api/pembayaran/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idpel: targetCustomerId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setInquiryError(data.error || "Gagal melakukan inquiry");
        return;
      }

      // Map API response items to PdamBill
      const items: PdamBill[] = (data.data || []).map((item: Record<string, string>) => ({
        idpel: targetCustomerId,
        nama: item.nama || "",
        alamat: item.alamat || "",
        gol: item.gol || "",
        thbln: item.thbln || "",
        harga: Number(item.harga) || 0,
        denda: Number(item.denda) || 0,
        materai: Number(item.materai) || 0,
        limbah: Number(item.limbah) || 0,
        retribusi: Number(item.retribusi) || 0,
        standLalu: Number(item.stand_l) || 0,
        standKini: Number(item.stand_i) || 0,
        subTotal: Number(item.total) || 0,
        biayaMeter: Number(item.biaya_meter) || 0,
        bebanTetap: Number(item.biaya_tetap) || 0,
        abodemen: Number(item.byadmin) || 0,
        total: Number(item.total) || 0,
        pakai: Number(item.pakai) || 0,
        diskon: Number(item.diskon) || 0,
      }));

      if (items.length === 0) {
        setInquiryError("Tidak ada tagihan ditemukan");
        return;
      }

      setDaftarTagihan((prev) => [...prev, ...items]);
      setNomorPelanggan("");
      setScannerHint("");
      focusField("customer");
    } catch {
      setInquiryError("Gagal menghubungi server PDAM");
    } finally {
      setInquiryLoading(false);
    }
  }

  // PLN inquiry via Lunasin API
  async function handlePlnInquiry(customerId?: string) {
    const targetCustomerId = (customerId ?? plnNomorPelanggan).trim();
    if (!targetCustomerId) return;

    // Determine kodeProduk and input2 based on active tab
    let kodeProduk = plnProduk;
    let input2 = "";

    // For PLN products, append admin tier from loket settings
    const prodOpt = LUNASIN_PRODUK_OPTIONS.find((p) => p.value === plnProduk);
    if (prodOpt?.category === "PLN") {
      kodeProduk = `${plnProduk}-${loketInfo?.plnAdminTier ?? 3000}`;
    }

    if (activeTab === "PULSA") {
      if (!selectedOperator) {
        setInquiryError("Pilih operator terlebih dahulu");
        return;
      }
      if (!selectedPulsaNominal || selectedPulsaNominal <= 0) {
        setInquiryError("Pilih nominal pulsa terlebih dahulu");
        return;
      }
      kodeProduk = `pulsa-${selectedOperator}-${selectedPulsaNominal}K`;
    } else if (activeTab === "PAKET_DATA") {
      if (!selectedOperator) {
        setInquiryError("Pilih operator terlebih dahulu");
        return;
      }
      if (!selectedDataPackage) {
        setInquiryError("Pilih paket data terlebih dahulu");
        return;
      }
      kodeProduk = selectedDataPackage;
    } else if (activeTab === "PDAM_KAL") {
      if (!selectedPdamKal) {
        setInquiryError("Pilih PDAM terlebih dahulu");
        return;
      }
      kodeProduk = selectedPdamKal;
    } else if (selectedPlnProduk?.needsNominal) {
      if (!plnNominal || plnNominal <= 0) {
        setInquiryError("Pilih nominal token terlebih dahulu");
        return;
      }
      input2 = String(plnNominal);
    }

    if (daftarTagihanPln.some((t) => t.idpel === targetCustomerId && t.kodeProduk === kodeProduk)) {
      setInquiryError("Pelanggan ini sudah ada di daftar tagihan");
      return;
    }

    setInquiryLoading(true);
    setInquiryError("");

    try {
      const res = await fetch("/api/pembayaran/lunasin/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idpel: targetCustomerId,
          kodeProduk,
          input2,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setInquiryError(data.error || "Gagal melakukan inquiry");
        return;
      }

      const d = data.data;
      if (!d) {
        setInquiryError("Tidak ada data tagihan ditemukan");
        return;
      }

      const bill: LunasinBill = {
        idpel: d.idpel || targetCustomerId,
        nama: d.nama || "",
        kodeProduk,
        idTrx: data.idTrx || "",
        rpAmount: Number(d.rp_amount) || 0,
        rpAdmin: Number(d.rp_admin) || 0,
        rpTotal: Number(d.rp_total) || 0,
        periode: d.periode || "",
        jumBill: d.jum_bill || "1",
        tarif: d.tarif || "",
        daya: d.daya || "",
        standMeter: d.stand_meter || "",
        tokenPln: d.token || "",
        input2,
        detail: d.detail || [],
        // PLN Non-Rekening specific
        noreg: d.noreg || "",
        tgl_reg: d.tgl_reg || "",
        jenis_reg: d.jenis_reg || "",
        // BPJS-specific
        nova: d.nova || "",
        novaKepalaKeluarga: d.nova_kepala_keluarga || "",
        jumPeserta: d.jum_peserta || "",
        kodeCabang: d.kode_cabang || "",
        namaCabang: d.nama_cabang || "",
        sisaSaldoBpjs: d.sisa || "",
        // Telkom & general Lunasin
        refnum: d.refnum || "",
        tglLunas: d.tgl_lunas || "",
        // Pulsa & Paket Data
        nomor: d.nomor || "",
        denom: d.denom || "",
        namaProduk: d.nama_produk || "",
        serialNumber: d.serial_number || "",
        masaBerlaku: d.masa_berlaku || "",
      };

      setDaftarTagihanPln((prev) => [...prev, bill]);
      setPlnNomorPelanggan("");
      setScannerHint("");
      focusField("customer");
    } catch {
      setInquiryError("Gagal menghubungi server provider");
    } finally {
      setInquiryLoading(false);
    }
  }

  // PLN payment via multipay API (unified)
  async function handleBayarPln() {
    if (daftarTagihanPln.length === 0 || !loketInfo || paymentLoading) return;
    if (parsedPlnPayment < totalBayarPln) {
      alert("Nilai pembayaran kurang dari total tagihan");
      return;
    }

    setPaymentLoading(true);
    const lunasinSnapshot = [...daftarTagihanPln];
    try {
      const idempotencyKey = plnPaymentIntentKey ?? generateIdempotencyKey();
      if (!plnPaymentIntentKey) {
        setPlnPaymentIntentKey(idempotencyKey);
      }

      const items: UnifiedCartItem[] = daftarTagihanPln.map((bill, idx) => ({
        itemCode: `LUNASIN-${bill.idpel}-${bill.kodeProduk}-${idx}`,
        provider: "LUNASIN",
        serviceType: getLunasinServiceType(bill.kodeProduk),
        customerId: bill.idpel,
        customerName: bill.nama,
        productCode: bill.kodeProduk,
        periodLabel: (() => {
          if (bill.kodeProduk.startsWith("bpjs")) return `${bill.jumBill} Bulan`;
          if (bill.kodeProduk.startsWith("telkom")) {
            const n = Number(bill.jumBill) || 1;
            return n > 1 ? `${n} Tagihan` : (bill.periode || bill.kodeProduk);
          }
          if (bill.kodeProduk.startsWith("pulsa") || bill.kodeProduk.startsWith("paketdata")) {
            return bill.namaProduk || bill.denom ? `${bill.namaProduk || bill.kodeProduk}` : bill.kodeProduk;
          }
          return bill.jenis_reg || bill.periode || bill.kodeProduk;
        })(),
        providerRef: bill.idTrx,
        amount: bill.rpAmount,
        adminFee: bill.rpAdmin,
        total: bill.rpTotal,
        metadata: {
          nama: bill.nama, kodeProduk: bill.kodeProduk, idTrx: bill.idTrx,
          periode: bill.periode, tarif: bill.tarif, daya: bill.daya,
          jumBill: bill.jumBill, input2: bill.input2, detail: bill.detail,
          standMeter: bill.standMeter,
          // PLN Non-Rekening
          noreg: bill.noreg, tgl_reg: bill.tgl_reg, jenis_reg: bill.jenis_reg,
          // BPJS
          nova: bill.nova, nova_kepala_keluarga: bill.novaKepalaKeluarga,
          jum_peserta: bill.jumPeserta, kode_cabang: bill.kodeCabang,
          nama_cabang: bill.namaCabang, sisa: bill.sisaSaldoBpjs,
          // Telkom & general
          refnum: bill.refnum, tgl_lunas: bill.tglLunas,
          // Pulsa & Paket Data
          nomor: bill.nomor, denom: bill.denom, nama_produk: bill.namaProduk,
          serial_number: bill.serialNumber, masa_berlaku: bill.masaBerlaku,
        },
      }));

      const res = await fetch("/api/pembayaran/multipay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          loketCode: loketInfo.loketCode,
          loketName: loketInfo.nama,
          paidAmount: parsedPlnPayment,
          items,
        }),
      });
      const data = await res.json();

      // Always reset intent key so next attempt gets fresh UUID
      setPlnPaymentIntentKey(null);

      if (!res.ok) {
        alert(data.error || "Pembayaran gagal");
        focusField("payment");
        return;
      }

      const itemLookup = new Map(items.map((item) => [item.itemCode, item]));
      const allResults: PaymentResult[] = (data.results || []).map((result: Record<string, unknown>) => {
        const item = itemLookup.get(String(result.itemCode || ""));
        return {
          itemCode: String(result.itemCode || item?.itemCode || ""),
          idpel: String(result.customerId || item?.customerId || ""),
          transactionCode: String(result.transactionCode || ""),
          success: Boolean(result.success),
          error: result.error ? String(result.error) : undefined,
          total: Number(item?.total || 0),
          nama: String(result.customerName || item?.customerName || ""),
          blth: String(item?.productCode || item?.periodLabel || "Lunasin"),
          provider: "LUNASIN" as const,
          serviceType: String(result.serviceType || item?.serviceType || ""),
          adminFee: Number(item?.adminFee || 0),
          finalStatus: String(result.status || (result.success ? "SUCCESS" : "FAILED")),
          kodeProduk: String(item?.productCode || "") || undefined,
          providerData: (result.providerData as Record<string, unknown> | undefined) || undefined,
        };
      });

      const allSuccess = data.success === true;
      const partialSuccess = data.partialSuccess === true;

      setDaftarTagihanSnapshot([]);
      setReceipt({
        results: allResults,
        loketCode: data.loketCode || loketInfo.loketCode,
        loketName: data.loketName || loketInfo.nama,
        biayaAdmin: 0,
        totalAdmin: Number(data.totalAdmin || 0),
        paidAt: data.paidAt || new Date().toISOString(),
        totalBayar: Number(data.grandTotal || totalBayarPln),
        tunai: parsedPlnPayment,
        kembalian: kembalianPln,
        allSuccess,
        partialSuccess,
        message: data.message || "",
      });

      const successTotal = allResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.total, 0);
      if (successTotal > 0 && loketInfo) {
        setLoketInfo({ ...loketInfo, pulsa: loketInfo.pulsa - successTotal });
      }

      if (allSuccess) {
        setDaftarTagihanPln([]);
        setPlnPaymentInput("");
      } else {
        const failedCodes = new Set(
          allResults.filter((r) => !r.success).map((r) => r.itemCode).filter(Boolean)
        );

        const pendingAdvice = allResults.filter(
          (r) => !r.success && r.finalStatus === "PENDING_ADVICE"
        );

        const failedBills = lunasinSnapshot.filter((bill, idx) =>
          failedCodes.has(`LUNASIN-${bill.idpel}-${bill.kodeProduk}-${idx}`)
        );

        if (pendingAdvice.length > 0) {
          setDaftarTagihanPln(failedBills);
        } else {
          const refreshed: typeof daftarTagihanPln = [];
          for (const bill of failedBills) {
            try {
              const inqRes = await fetch("/api/pembayaran/lunasin/inquiry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idpel: bill.idpel,
                  kodeProduk: bill.kodeProduk,
                  input2: bill.input2 || "",
                }),
              });
              const inqData = await inqRes.json();
              if (inqRes.ok && inqData.data) {
                const d = inqData.data;
                refreshed.push({
                  ...bill,
                  idTrx: inqData.idTrx || "",
                  rpAmount: Number(d.rp_amount) || bill.rpAmount,
                  rpAdmin: Number(d.rp_admin) || bill.rpAdmin,
                  rpTotal: Number(d.rp_total) || bill.rpTotal,
                });
              }
            } catch {
              // Skip — bill cannot be retried without fresh inquiry
            }
          }
          setDaftarTagihanPln(refreshed);
        }
      }
    } catch {
      alert("Gagal menghubungi server pembayaran PLN");
      focusField("payment");
    } finally {
      setPaymentLoading(false);
    }
  }

  // Unified multi-provider payment
  async function handleBayarSemua() {
    if (!hasAnyBills || !loketInfo || paymentLoading) return;
    if (parsedUnifiedPayment < grandTotalBayar) {
      alert("Nilai pembayaran kurang dari total tagihan");
      return;
    }

    setPaymentLoading(true);
    const pdamSnapshot = [...daftarTagihan];
    const lunasinSnapshot = [...daftarTagihanPln];

    try {
      const idempotencyKey = multiPayIntentKey ?? generateIdempotencyKey();
      if (!multiPayIntentKey) {
        setMultiPayIntentKey(idempotencyKey);
      }

      const items = unifiedCart;

      const itemLookup = new Map(items.map((item) => [item.itemCode, item]));

      const res = await fetch("/api/pembayaran/multipay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          loketCode: loketInfo.loketCode,
          loketName: loketInfo.nama,
          paidAmount: parsedUnifiedPayment,
          items,
        }),
      });
      const data = await res.json();

      // Always reset intent key so next attempt gets fresh UUID
      setMultiPayIntentKey(null);

      if (!res.ok) {
        alert(data.error || "Pembayaran multi-provider gagal");
        focusField("payment");
        return;
      }

      const allResults: PaymentResult[] = (data.results || []).map((result: Record<string, unknown>) => {
        const item = itemLookup.get(String(result.itemCode || ""));
        const provider = String(result.provider || item?.provider || "") === "LUNASIN" ? "LUNASIN" : "PDAM";
        const itemMetadata = (item?.metadata || {}) as Record<string, unknown>;
        return {
          itemCode: String(result.itemCode || item?.itemCode || ""),
          idpel: String(result.customerId || item?.customerId || ""),
          transactionCode: String(result.transactionCode || ""),
          success: Boolean(result.success),
          error: result.error ? String(result.error) : undefined,
          total: Number(item?.total || 0),
          nama: String(result.customerName || item?.customerName || ""),
          blth: provider === "PDAM"
            ? String(item?.periodLabel || itemMetadata.blth || "")
            : String(item?.productCode || item?.periodLabel || "Lunasin"),
          provider,
          serviceType: String(result.serviceType || item?.serviceType || ""),
          adminFee: Number(item?.adminFee || 0),
          finalStatus: String(result.status || (result.success ? "SUCCESS" : "FAILED")),
          kodeProduk: String(item?.productCode || "") || undefined,
          providerData: (result.providerData as Record<string, unknown> | undefined) || undefined,
        };
      });

      const successCount = allResults.filter((r) => r.success).length;
      const allSuccess = data.success === true;
      const partialSuccess = data.partialSuccess === true;

      setDaftarTagihanSnapshot(pdamSnapshot);
      setReceipt({
        results: allResults,
        loketCode: data.loketCode || loketInfo.loketCode,
        loketName: data.loketName || loketInfo.nama,
        biayaAdmin: biayaAdminPerTagihan,
        totalAdmin: Number(data.totalAdmin || 0),
        paidAt: data.paidAt || new Date().toISOString(),
        totalBayar: Number(data.grandTotal || grandTotalBayar),
        tunai: parsedUnifiedPayment,
        kembalian: unifiedKembalian,
        allSuccess,
        partialSuccess,
        message:
          data.message ||
          (allSuccess
            ? `Semua ${allResults.length} tagihan berhasil dibayar`
            : partialSuccess
              ? `${successCount}/${allResults.length} tagihan berhasil`
              : `Semua ${allResults.length} tagihan gagal`),
      });

      const totalSaldoDeducted = allResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.total, 0);
      if (totalSaldoDeducted > 0 && loketInfo) {
        setLoketInfo({ ...loketInfo, pulsa: loketInfo.pulsa - totalSaldoDeducted });
      }

      if (allSuccess) {
        setDaftarTagihan([]);
        setDaftarTagihanPln([]);
        setUnifiedPaymentInput("");
        setPaymentInput("");
        setPlnPaymentInput("");
      } else {
        const failedCodes = new Set(
          allResults
            .filter((r) => !r.success)
            .map((r) => r.itemCode)
            .filter(Boolean)
        );

        setDaftarTagihan(
          pdamSnapshot.filter((bill, idx) => failedCodes.has(`PDAM-${bill.idpel}-${bill.thbln}-${idx}`))
        );

        const failedLunasin = lunasinSnapshot.filter((bill, idx) =>
          failedCodes.has(`LUNASIN-${bill.idpel}-${bill.kodeProduk}-${idx}`)
        );

        const pendingLunasin = allResults.filter(
          (r) => !r.success && r.provider === "LUNASIN" && r.finalStatus === "PENDING_ADVICE"
        );

        if (pendingLunasin.length > 0) {
          setDaftarTagihanPln(failedLunasin);
        } else {
          const refreshed: typeof daftarTagihanPln = [];
          for (const bill of failedLunasin) {
            try {
              const inqRes = await fetch("/api/pembayaran/lunasin/inquiry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idpel: bill.idpel,
                  kodeProduk: bill.kodeProduk,
                  input2: bill.input2 || "",
                }),
              });
              const inqData = await inqRes.json();
              if (inqRes.ok && inqData.data) {
                const d = inqData.data;
                refreshed.push({
                  ...bill,
                  idTrx: inqData.idTrx || "",
                  rpAmount: Number(d.rp_amount) || bill.rpAmount,
                  rpAdmin: Number(d.rp_admin) || bill.rpAdmin,
                  rpTotal: Number(d.rp_total) || bill.rpTotal,
                });
              } else {
                refreshed.push(bill);
              }
            } catch {
              refreshed.push(bill);
            }
          }
          setDaftarTagihanPln(refreshed);
        }
      }
    } catch {
      alert("Gagal menghubungi server pembayaran");
      focusField("payment");
    } finally {
      setPaymentLoading(false);
    }
  }

  function mergeFavorite(nextFavorite: CustomerFavorite | null) {
    if (!nextFavorite) return;

    setFavorites((prev) => {
      const filtered = prev.filter((item) => item.id !== nextFavorite.id);
      return [nextFavorite, ...filtered];
    });
  }

  async function saveFavorite(input: {
    customerId: string;
    customerName?: string | null;
    address?: string | null;
    aliasName?: string | null;
  }) {
    const customerId = input.customerId.trim();
    if (!customerId) return false;

    setFavoriteSavingId(customerId);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: activeTab,
          customerId,
          customerName: input.customerName,
          address: input.address,
          aliasName: input.aliasName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menyimpan pelanggan favorit");
        return false;
      }

      mergeFavorite(data.favorite || null);
      return true;
    } catch {
      alert("Gagal menyimpan pelanggan favorit");
      return false;
    } finally {
      setFavoriteSavingId(null);
    }
  }

  async function handleSaveFavoriteFromBill(bill: PdamBill) {
    await saveFavorite({
      customerId: bill.idpel,
      customerName: bill.nama,
      address: bill.alamat,
    });
  }

  async function handleDeleteFavorite(id: number) {
    setFavoriteDeletingId(id);
    try {
      const params = new URLSearchParams({ id: String(id) });
      const res = await fetch(`/api/favorites?${params.toString()}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Gagal menghapus favorit");
        return;
      }

      setFavorites((prev) => prev.filter((item) => item.id !== id));
    } catch {
      alert("Gagal menghapus favorit");
    } finally {
      setFavoriteDeletingId(null);
    }
  }

  async function handleUseFavorite(favorite: CustomerFavorite) {
    setFavoritesModalOpen(false);
    setFavoriteSearch("");
    setInquiryError("");
    setScannerHint("");
    setNomorPelanggan(favorite.customerId);

    await saveFavorite({
      customerId: favorite.customerId,
      customerName: favorite.customerName,
      address: favorite.address,
      aliasName: favorite.aliasName,
    });

    await handleInquiry(favorite.customerId);
  }

  // ── Grup Favorit functions ──

  async function handleUseGroup(group: FavoriteGroup) {
    setGroupsModalOpen(false);
    setGroupSearch("");
    setInquiryError("");
    setScannerHint("");
    setGroupInquiryLoading(true);

    const newPdamBills: PdamBill[] = [];
    const newLunasinBills: LunasinBill[] = [];
    const errors: string[] = [];

    for (const item of group.items) {
      try {
        if (item.serviceType === "PDAM" && !item.productCode) {
          // PDAM native inquiry
          const res = await fetch("/api/pembayaran/inquiry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idpel: item.customerId }),
          });
          const data = await res.json();
          if (!res.ok) {
            errors.push(`${item.customerId}: ${data.error || "Gagal inquiry PDAM"}`);
            continue;
          }
          const bills: PdamBill[] = (data.data || []).map((r: Record<string, string>) => ({
            idpel: item.customerId,
            nama: r.nama || "",
            alamat: r.alamat || "",
            gol: r.gol || "",
            thbln: r.thbln || "",
            harga: Number(r.harga) || 0,
            denda: Number(r.denda) || 0,
            materai: Number(r.materai) || 0,
            limbah: Number(r.limbah) || 0,
            retribusi: Number(r.retribusi) || 0,
            standLalu: Number(r.stand_l) || 0,
            standKini: Number(r.stand_i) || 0,
            subTotal: Number(r.total) || 0,
            biayaMeter: Number(r.biaya_meter) || 0,
            bebanTetap: Number(r.biaya_tetap) || 0,
            abodemen: Number(r.byadmin) || 0,
            total: Number(r.total) || 0,
            pakai: Number(r.pakai) || 0,
            diskon: Number(r.diskon) || 0,
          }));
          newPdamBills.push(...bills);
        } else {
          // Lunasin inquiry
          const kodeProduk = item.productCode;
          const res = await fetch("/api/pembayaran/lunasin/inquiry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idpel: item.customerId, kodeProduk, input2: item.input2 || "" }),
          });
          const data = await res.json();
          if (!res.ok) {
            errors.push(`${item.customerId}: ${data.error || "Gagal inquiry"}`);
            continue;
          }
          const d = data.data;
          if (!d) { errors.push(`${item.customerId}: Tidak ada data tagihan`); continue; }
          newLunasinBills.push({
            idpel: d.idpel || item.customerId,
            nama: d.nama || "",
            kodeProduk,
            idTrx: data.idTrx || "",
            rpAmount: Number(d.rp_amount) || 0,
            rpAdmin: Number(d.rp_admin) || 0,
            rpTotal: Number(d.rp_total) || 0,
            periode: d.periode || "",
            jumBill: d.jum_bill || "1",
            tarif: d.tarif || "",
            daya: d.daya || "",
            standMeter: d.stand_meter || "",
            tokenPln: d.token || "",
            input2: item.input2 || "",
            detail: d.detail || [],
            // PLN Non-Rekening
            noreg: d.noreg || "",
            tgl_reg: d.tgl_reg || "",
            jenis_reg: d.jenis_reg || "",
            // BPJS
            nova: d.nova || "",
            novaKepalaKeluarga: d.nova_kepala_keluarga || "",
            jumPeserta: d.jum_peserta || "",
            kodeCabang: d.kode_cabang || "",
            namaCabang: d.nama_cabang || "",
            sisaSaldoBpjs: d.sisa || "",
            // Telkom & general
            refnum: d.refnum || "",
            tglLunas: d.tgl_lunas || "",
            // Pulsa & Paket Data
            nomor: d.nomor || "",
            denom: d.denom || "",
            namaProduk: d.nama_produk || "",
            serialNumber: d.serial_number || "",
            masaBerlaku: d.masa_berlaku || "",
          });
        }
      } catch {
        errors.push(`${item.customerId}: Gagal menghubungi server`);
      }
    }

    // Append results, filtering duplicates against existing bills
    if (newPdamBills.length > 0) {
      setDaftarTagihan((prev) => {
        const existing = new Set(prev.map((t) => t.idpel));
        return [...prev, ...newPdamBills.filter((b) => !existing.has(b.idpel))];
      });
    }
    if (newLunasinBills.length > 0) {
      setDaftarTagihanPln((prev) => {
        const existing = new Set(prev.map((t) => `${t.idpel}:${t.kodeProduk}`));
        return [...prev, ...newLunasinBills.filter((b) => !existing.has(`${b.idpel}:${b.kodeProduk}`))];
      });
    }

    if (errors.length > 0) {
      setInquiryError(`Gagal inquiry ${errors.length} item: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} lainnya)` : ""}`);
    }

    setGroupInquiryLoading(false);

    // Bump usage count
    try {
      await fetch(`/api/favorites/groups?id=${group.id}`, { method: "PATCH" });
      setFavoriteGroups((prev) =>
        prev.map((g) => g.id === group.id ? { ...g, usageCount: g.usageCount + 1, lastUsedAt: new Date().toISOString() } : g)
      );
    } catch { /* non-critical */ }
  }

  function getServiceTypeLabel(serviceType: string, productCode: string) {
    if (serviceType === "PDAM" && !productCode) return "PDAM";
    if (productCode.startsWith("pln-")) return "PLN";
    if (productCode.startsWith("bpjs-")) return "BPJS";
    if (productCode.startsWith("telkom-")) return "Telkom";
    if (productCode.startsWith("pulsa-")) return "Pulsa";
    if (productCode.startsWith("pdam-")) return "PDAM Lunasin";
    return serviceType;
  }

  async function handleSaveCartAsGroup() {
    const name = saveGroupName.trim();
    if (!name) return;

    const items: Array<{ serviceType: string; customerId: string; customerName?: string; productCode?: string; input2?: string }> = [];

    // Collect PDAM items — deduplicated by idpel
    const seenPdam = new Set<string>();
    for (const bill of daftarTagihan) {
      if (seenPdam.has(bill.idpel)) continue;
      seenPdam.add(bill.idpel);
      items.push({ serviceType: "PDAM", customerId: bill.idpel, customerName: bill.nama });
    }

    // Collect Lunasin items — deduplicated by idpel+kodeProduk
    const seenLunasin = new Set<string>();
    for (const bill of daftarTagihanPln) {
      const key = `${bill.idpel}:${bill.kodeProduk}`;
      if (seenLunasin.has(key)) continue;
      seenLunasin.add(key);
      items.push({
        serviceType: getServiceTypeLabel("LUNASIN", bill.kodeProduk),
        customerId: bill.idpel,
        customerName: bill.nama,
        productCode: bill.kodeProduk,
        input2: bill.input2 || "",
      });
    }

    if (items.length === 0) return;

    setSaveGroupLoading(true);
    try {
      const res = await fetch("/api/favorites/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: name, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menyimpan grup");
        return;
      }
      if (data.group) {
        setFavoriteGroups((prev) => [data.group, ...prev]);
      }
      setSaveGroupModalOpen(false);
      setSaveGroupName("");
    } catch {
      alert("Gagal menyimpan grup favorit");
    } finally {
      setSaveGroupLoading(false);
    }
  }

  async function handleDeleteGroup(id: number) {
    setGroupDeletingId(id);
    try {
      const res = await fetch(`/api/favorites/groups?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal menghapus grup");
        return;
      }
      setFavoriteGroups((prev) => prev.filter((g) => g.id !== id));
    } catch {
      alert("Gagal menghapus grup");
    } finally {
      setGroupDeletingId(null);
    }
  }

  // Payment via multipay API (unified)
  async function handleBayar() {
    if (daftarTagihan.length === 0 || !loketInfo || paymentLoading) return;
    if (parsedPayment < totalBayar) {
      alert("Nilai pembayaran kurang dari total tagihan");
      return;
    }

    setPaymentLoading(true);
    const pdamSnapshot = [...daftarTagihan];
    try {
      const idempotencyKey = paymentIntentKey ?? generateIdempotencyKey();
      if (!paymentIntentKey) {
        setPaymentIntentKey(idempotencyKey);
      }

      const items: UnifiedCartItem[] = daftarTagihan.map((bill, idx) => ({
        itemCode: `PDAM-${bill.idpel}-${bill.thbln}-${idx}`,
        provider: "PDAM",
        serviceType: "PDAM_NATIVE",
        customerId: bill.idpel,
        customerName: bill.nama,
        productCode: "PDAM_NATIVE",
        periodLabel: bill.thbln,
        amount: bill.total,
        adminFee: biayaAdminPerTagihan,
        total: bill.total + biayaAdminPerTagihan,
        metadata: {
          nama: bill.nama, alamat: bill.alamat, blth: bill.thbln, gol: bill.gol,
          harga: bill.harga, denda: bill.denda, materai: bill.materai,
          limbah: bill.limbah, retribusi: bill.retribusi, standLalu: bill.standLalu,
          standKini: bill.standKini, subTotal: bill.subTotal, biayaMeter: bill.biayaMeter,
          bebanTetap: bill.bebanTetap, abodemen: bill.abodemen, total: bill.total,
          diskon: bill.diskon, pakai: bill.pakai,
        },
      }));

      const res = await fetch("/api/pembayaran/multipay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          loketCode: loketInfo.loketCode,
          loketName: loketInfo.nama,
          paidAmount: parsedPayment,
          items,
        }),
      });
      const data = await res.json();

      // Always reset intent key so next attempt gets fresh UUID
      setPaymentIntentKey(null);

      if (!res.ok) {
        alert(data.error || "Pembayaran gagal");
        focusField("payment");
        return;
      }

      const itemLookup = new Map(items.map((item) => [item.itemCode, item]));
      const allResults: PaymentResult[] = (data.results || []).map((result: Record<string, unknown>) => {
        const item = itemLookup.get(String(result.itemCode || ""));
        const itemMetadata = (item?.metadata || {}) as Record<string, unknown>;
        return {
          itemCode: String(result.itemCode || item?.itemCode || ""),
          idpel: String(result.customerId || item?.customerId || ""),
          transactionCode: String(result.transactionCode || ""),
          success: Boolean(result.success),
          error: result.error ? String(result.error) : undefined,
          total: Number(item?.total || 0),
          nama: String(result.customerName || item?.customerName || ""),
          blth: String(item?.periodLabel || itemMetadata.blth || ""),
          provider: "PDAM" as const,
          serviceType: "PDAM_NATIVE",
          adminFee: biayaAdminPerTagihan,
          finalStatus: String(result.status || (result.success ? "SUCCESS" : "FAILED")),
        };
      });

      const allSuccess = data.success === true;
      const partialSuccess = data.partialSuccess === true;
      const successCount = allResults.filter((r) => r.success).length;

      setDaftarTagihanSnapshot(pdamSnapshot);
      setReceipt({
        results: allResults,
        loketCode: data.loketCode || loketInfo.loketCode,
        loketName: data.loketName || loketInfo.nama,
        biayaAdmin: biayaAdminPerTagihan,
        totalAdmin: Number(data.totalAdmin || 0),
        paidAt: data.paidAt || new Date().toISOString(),
        totalBayar: Number(data.grandTotal || totalBayar),
        tunai: parsedPayment,
        kembalian,
        allSuccess,
        partialSuccess,
        message: data.message || (allSuccess
          ? `Semua ${allResults.length} tagihan berhasil dibayar`
          : partialSuccess
            ? `${successCount}/${allResults.length} tagihan berhasil`
            : `Semua ${allResults.length} tagihan gagal`),
      });

      const successTotal = allResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.total, 0);
      if (successTotal > 0 && loketInfo) {
        setLoketInfo({ ...loketInfo, pulsa: loketInfo.pulsa - successTotal });
      }

      if (allSuccess) {
        setDaftarTagihan([]);
        setPaymentInput("");
      } else {
        const failedCodes = new Set(
          allResults.filter((r) => !r.success).map((r) => r.itemCode).filter(Boolean)
        );
        setDaftarTagihan(
          pdamSnapshot.filter((bill, idx) => failedCodes.has(`PDAM-${bill.idpel}-${bill.thbln}-${idx}`))
        );
      }
    } catch {
      alert("Gagal menghubungi server pembayaran");
      focusField("payment");
    } finally {
      setPaymentLoading(false);
    }
  }

  function handleCloseReceipt() {
    const hasRemainingPdam = daftarTagihan.length > 0;
    const hasRemainingPln = daftarTagihanPln.length > 0;
    setReceipt(null);
    // Reset idempotency keys so failed bills can be retried with fresh key
    if (hasRemainingPdam) setPaymentIntentKey(null);
    if (hasRemainingPln) setPlnPaymentIntentKey(null);
    if (hasRemainingPdam || hasRemainingPln) setMultiPayIntentKey(null);
    focusField((hasRemainingPdam || hasRemainingPln) ? "payment" : "customer");
  }



  async function handleReprint() {
    if (!reprintIdpel.trim()) return;
    setReprintLoading(true);
    setReprintError("");
    try {
      const params = new URLSearchParams({ idPelanggan: reprintIdpel.trim() });
      const res = await fetch(`/api/pembayaran/reprint?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setReprintError(data.error || "Transaksi tidak ditemukan");
        return;
      }
      printReceipt({
        loketName: data.loketName,
        loketCode: data.loketCode,
        kasir: data.kasir,
        tanggal: data.tanggal,
        bills: data.bills,
        totalTagihan: data.totalTagihan,
        totalAdmin: data.totalAdmin,
        totalBayar: data.totalBayar,
        tunai: data.totalBayar,
        kembalian: 0,
      });
      setReprintError("");
    } catch {
      setReprintError("Gagal mencetak ulang struk");
    } finally {
      setReprintLoading(false);
    }
  }

  // Group bills by idpel for accumulated display
  const groupedBills = useMemo(() => {
    const map = new Map<string, { info: PdamBill; bills: PdamBill[]; totalAkumulasi: number }>();
    for (const bill of daftarTagihan) {
      const existing = map.get(bill.idpel);
      if (existing) {
        existing.bills.push(bill);
        existing.totalAkumulasi += bill.total;
      } else {
        map.set(bill.idpel, { info: bill, bills: [bill], totalAkumulasi: bill.total });
      }
    }
    return Array.from(map.values());
  }, [daftarTagihan]);

  const tabItemCounts = useMemo(() => {
    const counts: Record<LayananTab, number> = {
      PDAM: daftarTagihan.length,
      PLN: 0,
      BPJS: 0,
      TELKOM: 0,
      PULSA: 0,
      PAKET_DATA: 0,
      PDAM_KAL: 0,
    };

    for (const bill of daftarTagihanPln) {
      if (bill.kodeProduk.startsWith("pln-")) counts.PLN += 1;
      else if (bill.kodeProduk.startsWith("bpjs")) counts.BPJS += 1;
      else if (bill.kodeProduk.startsWith("telkom")) counts.TELKOM += 1;
      else if (bill.kodeProduk.startsWith("pulsa")) counts.PULSA += 1;
      else if (bill.kodeProduk.startsWith("paketdata")) counts.PAKET_DATA += 1;
      else if (bill.kodeProduk.startsWith("pdam")) counts.PDAM_KAL += 1;
    }

    return counts;
  }, [daftarTagihan.length, daftarTagihanPln]);

  // Which customer detail is expanded
  const [expandedPel, setExpandedPel] = useState<string | null>(null);

  const filteredFavorites = useMemo(() => {
    const q = favoriteSearch.trim().toLowerCase();
    if (!q) return favorites;

    return favorites.filter((item) =>
      [item.aliasName, item.customerName, item.customerId, item.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [favoriteSearch, favorites]);

  const quickFavorites = useMemo(() => favorites.slice(0, 5), [favorites]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return favoriteGroups;
    return favoriteGroups.filter((g) =>
      g.groupName.toLowerCase().includes(q) ||
      g.items.some((i) =>
        [i.customerName, i.customerId, i.productCode].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      )
    );
  }, [groupSearch, favoriteGroups]);

  const hasCartItems = daftarTagihan.length > 0 || daftarTagihanPln.length > 0;

  function isFavoriteCustomer(customerId: string) {
    return favorites.some((item) => item.customerId === customerId && item.serviceType === activeTab);
  }

  function handleHapusPelanggan(idpel: string) {
    setDaftarTagihan((prev) => prev.filter((t) => t.idpel !== idpel));
    if (expandedPel === idpel) setExpandedPel(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInquiry();
    }
  }

  function handleCustomerInputChange(value: string) {
    setNomorPelanggan(value);
    setInquiryError("");
    setScannerHint("");
  }

  // Format THBLN (202603 → Mar 2026)
  function formatPeriode(thbln: string) {
    if (!thbln || thbln.length < 6) return thbln;
    const year = thbln.substring(0, 4);
    const month = parseInt(thbln.substring(4, 6), 10);
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${months[month - 1] || thbln.substring(4, 6)} ${year}`;
  }

  return (
    <>
      {/* Breadcrumbs & Header */}
      <div className="mb-8">
        <Breadcrumb
          items={[
            { label: "Beranda", href: "/" },
            { label: "Pembayaran Tagihan" },
          ]}
        />
        <h1 className="text-3xl font-extrabold tracking-tight">
          Pembayaran Tagihan
        </h1>
        <p className="text-slate-500 mt-1">
          Lakukan inquiry per layanan, lalu bayar semua tagihan aktif dalam satu transaksi multipayment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Selection and List */}
        <div className="lg:col-span-8 space-y-6">
          {/* Service Toggle & Input Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-6">
              {/* Loket warning jika belum terhubung */}
              {!loketLoading && !loketInfo && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg">warning</span>
                  <p className="text-sm text-amber-700 dark:text-amber-300">Akun Anda belum terhubung dengan loket. Hubungi admin untuk mengatur loket.</p>
                </div>
              )}

              {/* Pilih Jenis Layanan */}
              <div>
                <label className="text-sm font-semibold mb-3 block text-slate-700 dark:text-slate-300">
                  Pilih Jenis Layanan untuk Inquiry
                </label>
                <div className="overflow-x-auto -mx-1 px-1 scrollbar-none">
                  <div className="inline-flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg min-w-max">
                    {LAYANAN_TABS.map((tab) => (
                      <button
                        key={tab.value}
                        onClick={() => {
                          setActiveTab(tab.value);
                          if (tab.value !== "PDAM") {
                            setPlnProduk(tab.defaultProduk);
                            setPlnNominal(0);
                          }
                          setSelectedOperator("");
                          setSelectedPulsaNominal(0);
                          setSelectedDataPackage("");
                          setDataSearchQuery("");
                          setDataCategory("");
                          setSelectedPdamKal("");
                          setPdamKalSearch("");
                          setInquiryError("");
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-all ${
                          activeTab === tab.value
                            ? `bg-white dark:bg-slate-700 shadow-sm font-bold ${tab.color}`
                            : "font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">{tab.icon}</span>
                        {tab.label}
                        {tabItemCounts[tab.value] > 0 && (
                          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-black text-primary">
                            {tabItemCounts[tab.value]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tagihan yang sudah di-inquiry akan tetap tersimpan di keranjang aktif meskipun Anda berpindah tab layanan.
                </p>
              </div>

              {/* PLN Sub-product Selector (only for PLN tab) */}
              {activeTab === "PLN" && (
                <div>
                  <label className="text-sm font-semibold mb-3 block text-slate-700 dark:text-slate-300">
                    Jenis Produk PLN
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LUNASIN_PRODUK_OPTIONS.filter((o) => o.category === "PLN").map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setPlnProduk(opt.value);
                          if (!opt.needsNominal) setPlnNominal(0);
                          setInquiryError("");
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border transition-all ${
                          plnProduk === opt.value
                            ? opt.activeClass
                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-amber-200 hover:bg-amber-50/50"
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Nominal selector for Prepaid */}
                  {selectedPlnProduk?.needsNominal && (
                    <div className="mt-3">
                      <label className="text-xs font-semibold mb-2 block text-slate-500">
                        Pilih Nominal Token
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {PLN_NOMINAL_OPTIONS.map((nom) => (
                          <button
                            key={nom}
                            onClick={() => { setPlnNominal(nom); setInquiryError(""); }}
                            className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                              plnNominal === nom
                                ? "bg-amber-600 border-amber-600 text-white font-bold shadow-sm"
                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-amber-300"
                            }`}
                          >
                            {formatRupiah(nom)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pulsa Operator & Nominal Selector */}
              {activeTab === "PULSA" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold mb-2 block text-slate-500 uppercase tracking-wider">
                      Operator
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PULSA_OPERATORS.map((op) => (
                        <button
                          key={op.id}
                          onClick={() => {
                            setSelectedOperator(op.id);
                            setSelectedPulsaNominal(0);
                            setInquiryError("");
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selectedOperator === op.id
                              ? "bg-purple-600 border-purple-600 text-white shadow-sm"
                              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedOperator && PULSA_NOMINALS[selectedOperator] && (() => {
                    const noms = PULSA_NOMINALS[selectedOperator];
                    const tiers = [
                      { label: "Kecil", items: noms.filter(n => n <= 10) },
                      { label: "Menengah", items: noms.filter(n => n > 10 && n <= 100) },
                      { label: "Besar", items: noms.filter(n => n > 100) },
                    ].filter(t => t.items.length > 0);
                    return (
                      <div className="space-y-2">
                        {tiers.map((tier) => (
                          <div key={tier.label}>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{tier.label}</p>
                            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                              {tier.items.map((nom) => (
                                <button
                                  key={nom}
                                  onClick={() => { setSelectedPulsaNominal(nom); setInquiryError(""); }}
                                  className={`py-1.5 rounded-lg text-xs text-center border transition-all ${
                                    selectedPulsaNominal === nom
                                      ? "bg-purple-600 border-purple-600 text-white font-bold shadow-sm"
                                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-purple-300"
                                  }`}
                                >
                                  {nom >= 1000 ? `${nom / 1000}jt` : `${nom}rb`}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Paket Data Operator & Package Selector */}
              {activeTab === "PAKET_DATA" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold mb-2 block text-slate-500 uppercase tracking-wider">
                      Operator
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {DATA_OPERATORS.map((op) => (
                        <button
                          key={op.id}
                          onClick={() => {
                            setSelectedOperator(op.id);
                            setSelectedDataPackage("");
                            setDataSearchQuery("");
                            setDataCategory("");
                            setInquiryError("");
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selectedOperator === op.id
                              ? "bg-cyan-600 border-cyan-600 text-white shadow-sm"
                              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-cyan-300 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedOperator && DATA_PACKAGES[selectedOperator] && (() => {
                    const pkgs = DATA_PACKAGES[selectedOperator];
                    const categorize = (label: string) => {
                      const l = label.toLowerCase();
                      if (l.includes("roaming") || l.includes("haji") || l.includes("umroh") || l.includes("ibadah")) return "Roaming";
                      if (l.includes("combo") || l.includes("freedom")) return "Freedom/Combo";
                      if (l.includes("flash")) return "Flash";
                      if (l.includes("pure")) return "Pure";
                      if (l.includes("unlimited") || l.includes("unl")) return "Unlimited";
                      if (l.includes("bulk")) return "Bulk";
                      if (l.includes("bronet") || l.includes("bro")) return "Bronet";
                      if (l.includes("aigo") || l.includes("owsem")) return "Aigo/Owsem";
                      if (l.includes("hotrod") || l.includes("xtra") || l.includes("pass")) return "HotRod/Xtra";
                      if (l.includes("mix")) return "Mix";
                      if (l.includes("telp") || l.includes("sms") || l.includes("kuota belajar")) return "Lainnya";
                      return "Data";
                    };
                    const cats = Array.from(new Set(pkgs.map(p => categorize(p.label))));
                    const activeCat = dataCategory || cats[0] || "";
                    const filtered = pkgs
                      .filter(p => categorize(p.label) === activeCat)
                      .filter(p => !dataSearchQuery || p.label.toLowerCase().includes(dataSearchQuery.toLowerCase()));
                    const selectedLabel = pkgs.find(p => p.code === selectedDataPackage)?.label;
                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {cats.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => { setDataCategory(cat); setDataDropdownOpen(true); }}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                                activeCat === cat
                                  ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 font-bold"
                                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setDataDropdownOpen(!dataDropdownOpen)}
                            className={`w-full max-w-sm flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all ${
                              selectedDataPackage
                                ? "border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 font-semibold"
                                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500"
                            }`}
                          >
                            <span className="truncate">{selectedLabel || "Pilih paket data..."}</span>
                            <span className="material-symbols-outlined text-sm ml-2">{dataDropdownOpen ? "expand_less" : "expand_more"}</span>
                          </button>
                          {dataDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                <input
                                  type="text"
                                  value={dataSearchQuery}
                                  onChange={(e) => setDataSearchQuery(e.target.value)}
                                  placeholder="Cari paket..."
                                  autoFocus
                                  className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-2 text-xs focus:ring-cyan-500 focus:border-cyan-500"
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {filtered.length > 0 ? filtered.map((pkg) => (
                                  <button
                                    key={pkg.code}
                                    onClick={() => { setSelectedDataPackage(pkg.code); setDataDropdownOpen(false); setDataSearchQuery(""); setInquiryError(""); }}
                                    className={`w-full text-left px-3 py-2 text-xs transition-all ${
                                      selectedDataPackage === pkg.code
                                        ? "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-bold"
                                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    {pkg.label}
                                  </button>
                                )) : (
                                  <p className="px-3 py-2 text-xs text-slate-400">Tidak ada paket ditemukan</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* PDAM Lunasin Selector */}
              {activeTab === "PDAM_KAL" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold mb-2 block text-slate-500 uppercase tracking-wider">
                      Pilih PDAM
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPdamDropdownOpen(!pdamDropdownOpen)}
                        className={`w-full max-w-sm flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all ${
                          selectedPdamKal
                            ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 font-semibold"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500"
                        }`}
                      >
                        <span className="truncate">{PDAM_KALIMANTAN.find(p => p.code === selectedPdamKal)?.label || "Pilih PDAM..."}</span>
                        <span className="material-symbols-outlined text-sm ml-2">{pdamDropdownOpen ? "expand_less" : "expand_more"}</span>
                      </button>
                      {pdamDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                            <input
                              type="text"
                              value={pdamKalSearch}
                              onChange={(e) => setPdamKalSearch(e.target.value)}
                              placeholder="Cari PDAM..."
                              autoFocus
                              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-2 text-xs focus:ring-sky-500 focus:border-sky-500"
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {PDAM_KALIMANTAN
                              .filter((p) => !pdamKalSearch || p.label.toLowerCase().includes(pdamKalSearch.toLowerCase()))
                              .map((p) => (
                                <button
                                  key={p.code}
                                  onClick={() => { setSelectedPdamKal(p.code); setPdamDropdownOpen(false); setPdamKalSearch(""); setInquiryError(""); }}
                                  className={`w-full text-left px-3 py-2 text-xs transition-all ${
                                    selectedPdamKal === p.code
                                      ? "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold"
                                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 max-w-xs">
                  <label className="text-sm font-semibold mb-2 block text-slate-700 dark:text-slate-300">
                    {activeTab === "PDAM" ? "Nomor Pelanggan PDAM"
                      : activeTab === "PULSA" || activeTab === "PAKET_DATA" ? "Nomor HP"
                      : activeTab === "PDAM_KAL" ? "Nomor Pelanggan PDAM"
                      : `ID Pelanggan ${currentTabConfig.label}`}
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={activeTab === "PDAM" ? nomorPelanggan : plnNomorPelanggan}
                      onChange={(e) => {
                        if (activeTab === "PDAM") {
                          handleCustomerInputChange(e.target.value);
                        } else {
                          setPlnNomorPelanggan(e.target.value);
                          setInquiryError("");
                        }
                      }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (activeTab === "PDAM") handleInquiry();
                        else handlePlnInquiry();
                      }
                    }}
                      placeholder={activeTab === "PDAM" ? "Masukkan / scan ID pelanggan" : activeTab === "PULSA" || activeTab === "PAKET_DATA" ? "Masukkan nomor HP" : `Masukkan ID pelanggan ${currentTabConfig.label}`}
                      autoFocus
                    disabled={inquiryLoading}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary py-3 pl-4 disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={() => {
                    if (activeTab === "PDAM") void handleInquiry();
                    else void handlePlnInquiry();
                  }}
                  disabled={inquiryLoading || !(activeTab === "PDAM" ? nomorPelanggan.trim() : plnNomorPelanggan.trim())}
                  className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inquiryLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      Mencari...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">search</span>
                      Cek Tagihan
                    </>
                  )}
                </button>
                <button
                  onClick={() => setGroupsModalOpen(true)}
                  type="button"
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700 relative"
                >
                  <span className="material-symbols-outlined text-lg">folder_special</span>
                  Grup
                  {favoriteGroups.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-violet-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {favoriteGroups.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Inquiry error */}
              {inquiryError && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                  <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                  <p className="text-sm text-red-700 dark:text-red-300">{inquiryError}</p>
                </div>
              )}

              {!inquiryError && scannerHint && (
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
                  <span className="material-symbols-outlined text-blue-500 text-lg">qr_code_scanner</span>
                  <p className="text-sm text-blue-700 dark:text-blue-300">{scannerHint}</p>
                </div>
              )}

              {groupInquiryLoading && (
                <div className="flex items-center gap-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-3">
                  <span className="material-symbols-outlined text-violet-500 animate-spin text-lg">progress_activity</span>
                  <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Memproses inquiry grup favorit...</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Alt + I</span> fokus ke input pelanggan
                </div>
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Alt + B</span> fokus ke nilai bayar
                </div>
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">F8</span> proses pembayaran
                </div>
              </div>
            </div>
          </div>

          {/* Keranjang Aktif */}
          {hasAnyBills && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  <span className="material-symbols-outlined text-primary">shopping_cart</span>
                  Keranjang Tagihan Aktif
                </div>
                {tabItemCounts.PDAM > 0 && (
                  <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold">
                    PDAM {tabItemCounts.PDAM}
                  </span>
                )}
                {tabItemCounts.PLN > 0 && (
                  <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    PLN {tabItemCounts.PLN}
                  </span>
                )}
                {tabItemCounts.BPJS > 0 && (
                  <span className="px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-bold">
                    BPJS {tabItemCounts.BPJS}
                  </span>
                )}
                {tabItemCounts.TELKOM > 0 && (
                  <span className="px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-bold">
                    Telkom {tabItemCounts.TELKOM}
                  </span>
                )}
                {tabItemCounts.PULSA > 0 && (
                  <span className="px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-bold">
                    Pulsa {tabItemCounts.PULSA}
                  </span>
                )}
                {tabItemCounts.PAKET_DATA > 0 && (
                  <span className="px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 text-xs font-bold">
                    Paket Data {tabItemCounts.PAKET_DATA}
                  </span>
                )}
                {tabItemCounts.PDAM_KAL > 0 && (
                  <span className="px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs font-bold">
                    PDAM Lunasin {tabItemCounts.PDAM_KAL}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => { setSaveGroupName(""); setSaveGroupModalOpen(true); }}
                  className="ml-auto rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">bookmark_add</span>
                  Simpan sbg Grup
                </button>
              </div>
            </div>
          )}

          {/* Daftar Tagihan — Akumulasi per pelanggan (PDAM) */}
          {hasPdamBills && (
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">water_drop</span>
                Tagihan PDAM
              </h3>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full">
                  {groupedBills.length} Pelanggan
                </span>
                <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
                  {daftarTagihan.length} Rekening
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupedBills.map((group) => (
                <div key={group.info.idpel}>
                  {/* Summary row */}
                  <div className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <button
                      onClick={() => setExpandedPel(expandedPel === group.info.idpel ? null : group.info.idpel)}
                      className="text-slate-400 hover:text-primary transition-colors shrink-0"
                    >
                      <span className={`material-symbols-outlined text-xl transition-transform ${expandedPel === group.info.idpel ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                    </button>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg shrink-0">
                      <span className="material-symbols-outlined text-lg">water_drop</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{group.info.nama}</p>
                        <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded shrink-0">
                          {group.info.gol}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="font-mono">{group.info.idpel}</span>
                        <span>·</span>
                        <span className="truncate">{group.info.alamat}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-primary">{formatRupiah(group.totalAkumulasi)}</p>
                      <p className="text-[11px] text-slate-400">{group.bills.length} rekening</p>
                    </div>
                    <button
                      onClick={() => handleHapusPelanggan(group.info.idpel)}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0 ml-2"
                      title="Hapus pelanggan"
                    >
                      <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                  </div>

                  {/* Expanded detail per-rekening */}
                  {expandedPel === group.info.idpel && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800">
                      <div className="px-6 py-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Rincian Per Rekening</p>
                        <div className="space-y-3">
                          {group.bills.map((bill, bIdx) => (
                            <div key={`${bill.idpel}-${bill.thbln}-${bIdx}`} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                              {/* Period header */}
                              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-primary text-base">calendar_month</span>
                                  <span className="font-bold text-sm">{formatPeriode(bill.thbln)}</span>
                                  <span className="text-xs text-slate-400">· Stand {bill.standLalu} → {bill.standKini}</span>
                                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded">
                                    {bill.pakai} m³
                                  </span>
                                </div>
                                <span className="font-bold text-sm">{formatRupiah(bill.total)}</span>
                              </div>
                              {/* Detail grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 px-4 py-3 text-xs">
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Harga Air</span>
                                  <span className="font-semibold">{formatRupiah(bill.harga)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Beban Tetap</span>
                                  <span className="font-semibold">{formatRupiah(bill.bebanTetap)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Biaya Meter</span>
                                  <span className="font-semibold">{formatRupiah(bill.biayaMeter)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Retribusi</span>
                                  <span className="font-semibold">{formatRupiah(bill.retribusi)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Limbah</span>
                                  <span className="font-semibold">{formatRupiah(bill.limbah)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Denda</span>
                                  <span className="font-semibold">{bill.denda > 0 ? <span className="text-red-600">{formatRupiah(bill.denda)}</span> : formatRupiah(0)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Materai</span>
                                  <span className="font-semibold">{formatRupiah(bill.materai)}</span>
                                </div>
                                <div className="flex justify-between sm:flex-col sm:gap-0.5">
                                  <span className="text-slate-400">Sub Total</span>
                                  <span className="font-bold text-primary">{formatRupiah(bill.subTotal)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Akumulasi footer */}
                        {group.bills.length > 1 && (
                          <div className="mt-3 flex justify-between items-center px-4 py-3 bg-primary/5 rounded-lg border border-primary/10">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total Akumulasi ({group.bills.length} rekening)</span>
                            <span className="text-lg font-black text-primary">{formatRupiah(group.totalAkumulasi)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {groupedBills.length === 0 && (
                <div className="px-6 py-12 text-center text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
                  Belum ada tagihan. Masukkan nomor pelanggan di atas untuk inquiry.
                </div>
              )}
            </div>
          </div>
          )}

          {/* Daftar Tagihan Lunasin */}
          {hasPlnBills && (
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">bolt</span>
                Tagihan Lunasin / Produk Lain
              </h3>
              <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-full">
                {daftarTagihanPln.length} Tagihan
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {daftarTagihanPln.map((bill, idx) => {
                const prodInfo = LUNASIN_PRODUK_OPTIONS.find((p) => bill.kodeProduk.startsWith(p.value));
                const isPrepaid = bill.kodeProduk.startsWith("pln-prepaid");
                return (
                <div key={`${bill.idpel}-${idx}`}>
                  <div className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <button
                      onClick={() => setExpandedPel(expandedPel === `pln-${bill.idpel}-${idx}` ? null : `pln-${bill.idpel}-${idx}`)}
                      className="text-slate-400 hover:text-primary transition-colors shrink-0"
                    >
                      <span className={`material-symbols-outlined text-xl transition-transform ${expandedPel === `pln-${bill.idpel}-${idx}` ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                    </button>
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg shrink-0">
                      <span className="material-symbols-outlined text-lg">{prodInfo?.icon || "receipt_long"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{bill.nama}</p>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded shrink-0">
                          {prodInfo?.label || "-"}
                        </span>
                        {bill.tarif && bill.daya && (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded shrink-0">
                            {bill.tarif}/{bill.daya}VA
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="font-mono">{bill.idpel}</span>
                        {!isPrepaid && bill.jumBill && (
                          <>
                            <span>·</span>
                            <span>{bill.jumBill} bulan tagihan</span>
                          </>
                        )}
                        {isPrepaid && (
                          <>
                            <span>·</span>
                            <span>Token {formatRupiah(bill.rpAmount)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-primary">{formatRupiah(bill.rpTotal)}</p>
                      <p className="text-[11px] text-slate-400">incl. admin {formatRupiah(bill.rpAdmin)}</p>
                    </div>
                    <button
                      onClick={() => setDaftarTagihanPln((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0 ml-2"
                      title="Hapus tagihan"
                    >
                      <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                  </div>

                  {expandedPel === `pln-${bill.idpel}-${idx}` && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Detail — {prodInfo?.label || "-"}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs">
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Produk</span>
                          <span className="font-semibold">{prodInfo?.label || bill.kodeProduk}</span>
                        </div>
                        {bill.tarif && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Tarif/Daya</span>
                          <span className="font-semibold">{bill.tarif} / {bill.daya} VA</span>
                        </div>
                        )}
                        {!isPrepaid && bill.jumBill && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Jumlah Bulan</span>
                          <span className="font-semibold">{bill.jumBill} bulan</span>
                        </div>
                        )}
                        {bill.standMeter && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Stand Meter</span>
                          <span className="font-semibold">{bill.standMeter}</span>
                        </div>
                        )}
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">{isPrepaid ? "Nominal" : "Tagihan"}</span>
                          <span className="font-semibold">{formatRupiah(bill.rpAmount)}</span>
                        </div>
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Admin</span>
                          <span className="font-semibold">{formatRupiah(bill.rpAdmin)}</span>
                        </div>
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-slate-400">Total</span>
                          <span className="font-bold text-primary">{formatRupiah(bill.rpTotal)}</span>
                        </div>
                        {bill.tokenPln && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5 col-span-2">
                          <span className="text-slate-400">Token PLN</span>
                          <span className="font-mono font-bold text-primary">{bill.tokenPln}</span>
                        </div>
                        )}
                      </div>
                      {bill.detail && bill.detail.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rincian Per Periode</p>
                          <div className="space-y-2">
                            {bill.detail.map((d, dIdx) => (
                              <div key={dIdx} className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs">
                                <div className="flex items-center gap-3">
                                  <span className="material-symbols-outlined text-primary text-base">calendar_month</span>
                                  <span className="font-semibold">{d.periode || "-"}</span>
                                  {d.stand_meter && <span className="text-slate-400">Stand: {d.stand_meter}</span>}
                                </div>
                                <span className="font-bold">{d.rp_amount ? formatRupiah(Number(d.rp_amount)) : "-"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ); })}
              {daftarTagihanPln.length === 0 && (
                <div className="px-6 py-12 text-center text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
                  Belum ada tagihan. Pilih produk dan masukkan ID pelanggan di atas.
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Right Side: Sidebar Summary */}
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden sticky top-24">
            {/* Header */}
            <div className={`px-6 py-6 text-white ${hasMultiProvider ? "bg-gradient-to-r from-primary to-amber-600" : isLunasinTab ? tabTheme.bg : "bg-primary"}`}>
              <h3 className="text-lg font-bold">Ringkasan Pembayaran</h3>
              <p className="text-xs font-medium mt-1 opacity-80 uppercase tracking-widest">
                {hasMultiProvider
                  ? `PDAM ${groupedBills.length} Pel · Lunasin ${daftarTagihanPln.length} Tagihan`
                  : activeTab === "PDAM"
                  ? `\u00A0${groupedBills.length} Pelanggan · ${daftarTagihan.length} Rekening`
                  : `\u00A0${daftarTagihanPln.length} Tagihan ${currentTabConfig.label}`}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Breakdown */}
              <div className="space-y-3">
                {/* PDAM breakdown */}
                {hasPdamBills && (
                  <>
                    {hasMultiProvider && (
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">water_drop</span>
                        PDAM
                      </p>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Tagihan PDAM ({daftarTagihan.length})</span>
                      <span className="font-semibold">{formatRupiah(totalTagihan)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Admin PDAM</span>
                      <span className="font-semibold text-green-600">{formatRupiah(biayaAdmin)}</span>
                    </div>
                  </>
                )}
                {/* Lunasin breakdown */}
                {hasPlnBills && (
                  <>
                    {hasMultiProvider && (
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1 mt-3">
                        <span className="material-symbols-outlined text-xs">bolt</span>
                        LUNASIN
                      </p>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Tagihan Lunasin ({daftarTagihanPln.length})</span>
                      <span className="font-semibold">{formatRupiah(totalTagihanPln - biayaAdminPln)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Admin Lunasin</span>
                      <span className="font-semibold text-green-600">{formatRupiah(biayaAdminPln)}</span>
                    </div>
                  </>
                )}
                {/* Grand total */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total Bayar</span>
                  <span className={`text-2xl font-black ${hasMultiProvider ? "text-slate-900 dark:text-white" : isLunasinTab ? tabTheme.text : "text-primary"}`}>
                    {formatRupiah(grandTotalBayar)}
                  </span>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              {/* Nilai Pembayaran */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold mb-2 block">
                    Nilai Pembayaran (Tunai)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      ref={paymentRef}
                      type="text"
                      value={unifiedPaymentInput}
                      onChange={(e) => setUnifiedPaymentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !paymentLoading && hasAnyBills && parsedUnifiedPayment >= grandTotalBayar) {
                          e.preventDefault();
                          void handleBayarSemua();
                        }
                      }}
                      placeholder="0"
                      className="w-full pl-12 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-lg py-3"
                    />
                  </div>
                </div>
                {parsedUnifiedPayment > 0 && (
                  <div className={`p-4 rounded-lg flex justify-between items-center border border-dashed ${
                    parsedUnifiedPayment >= grandTotalBayar
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  }`}>
                    <span className="text-sm font-medium text-slate-500">
                      {parsedUnifiedPayment >= grandTotalBayar ? "Kembalian" : "Kurang"}
                    </span>
                    <span className={`font-black text-xl ${
                      parsedUnifiedPayment >= grandTotalBayar ? "text-green-600" : "text-red-600"
                    }`}>
                      {formatRupiah(parsedUnifiedPayment >= grandTotalBayar ? unifiedKembalian : grandTotalBayar - parsedUnifiedPayment)}
                    </span>
                  </div>
                )}
              </div>

              {/* Bayar Button */}
              <button
                onClick={handleBayarSemua}
                disabled={paymentLoading || !hasAnyBills || !loketInfo || parsedUnifiedPayment < grandTotalBayar}
                className={`w-full ${hasMultiProvider ? "bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-700" : isLunasinTab ? `${tabTheme.btnBg} ${tabTheme.btnHover}` : "bg-primary hover:bg-primary/90"} text-white font-black py-4 rounded-xl shadow-lg ${hasMultiProvider ? "shadow-slate-400/20" : isLunasinTab ? tabTheme.shadow : "shadow-primary/20"} transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {paymentLoading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    MEMPROSES...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">payments</span>
                    {hasMultiProvider ? "BAYAR SEMUA SEKARANG" : "BAYAR SEKARANG"}
                  </>
                )}
              </button>

              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-tighter">
                  Dengan menekan bayar, Anda menyetujui syarat dan ketentuan
                  transaksi layanan utilitas.
                </p>
              </div>
            </div>
          </div>

          {/* Helper Card */}
          <div className="mt-4 p-4 bg-primary/5 border border-primary/10 rounded-xl flex gap-4 items-start">
            <span className="material-symbols-outlined text-primary">info</span>
            <div>
              <h4 className="text-sm font-bold text-primary">
                Cara penggunaan
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {activeTab === "PDAM" ? (
                  <>
                    1. Masukkan nomor pelanggan PDAM lalu klik &quot;Cek Tagihan&quot;<br/>
                    2. Ulangi untuk menambah pelanggan lain<br/>
                    3. Bisa pindah tab PLN/BPJS untuk tambah tagihan lintas provider<br/>
                    4. Masukkan nilai pembayaran tunai<br/>
                    5. Klik &quot;BAYAR SEKARANG&quot; atau tekan F8 untuk bayar semua sekaligus
                  </>
                ) : (
                  <>
                    1. Masukkan ID pelanggan lalu klik &quot;Cek Tagihan&quot;<br/>
                    2. Bisa pindah tab lain untuk tambah tagihan lintas provider<br/>
                    3. Masukkan nilai pembayaran tunai<br/>
                    4. Klik &quot;BAYAR SEKARANG&quot; atau tekan F8 untuk bayar semua sekaligus
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Cetak Ulang Struk */}
          <div className="mt-4 bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-emerald-600 text-lg">print</span>
              <h4 className="text-sm font-bold">Cetak Ulang Struk</h4>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Masukkan ID pelanggan untuk mencetak ulang struk pembayaran terakhir.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="ID Pelanggan"
                value={reprintIdpel}
                onChange={(e) => { setReprintIdpel(e.target.value); setReprintError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleReprint(); } }}
              />
              <button
                onClick={() => void handleReprint()}
                disabled={reprintLoading || !reprintIdpel.trim()}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {reprintLoading ? (
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-sm">print</span>
                )}
                Cetak
              </button>
            </div>
            {reprintError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {reprintError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ===== RECEIPT MODAL ===== */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Receipt Header */}
            <div className={`text-white px-6 py-6 rounded-t-2xl text-center ${
              receipt.allSuccess
                ? "bg-green-600"
                : receipt.partialSuccess
                  ? "bg-amber-500"
                  : "bg-red-600"
            }`}>
              <span className="material-symbols-outlined text-5xl mb-2">
                {receipt.allSuccess ? "check_circle" : receipt.partialSuccess ? "warning" : "error"}
              </span>
              <h2 className="text-xl font-black">
                {receipt.allSuccess
                  ? "Pembayaran Berhasil"
                  : receipt.partialSuccess
                    ? "Pembayaran Sebagian Berhasil"
                    : "Pembayaran Gagal"}
              </h2>
              <p className={`text-sm mt-1 ${
                receipt.allSuccess ? "text-green-100" : receipt.partialSuccess ? "text-amber-100" : "text-red-100"
              }`}>
                {receipt.message}
              </p>
              <p className={`text-sm mt-1 ${
                receipt.allSuccess ? "text-green-100" : receipt.partialSuccess ? "text-amber-100" : "text-red-100"
              }`}>
                {new Date(receipt.paidAt).toLocaleString("id-ID", {
                  dateStyle: "full",
                  timeStyle: "medium",
                })}
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Loket Info */}
              <div className="text-center text-sm text-slate-500 border-b border-dashed border-slate-200 dark:border-slate-700 pb-4">
                <p className="font-bold text-slate-700 dark:text-slate-300">{receipt.loketName}</p>
                <p>{receipt.loketCode}</p>
              </div>

              {/* Per-bill results */}
              <div className="space-y-3">
                {receipt.results.map((r, i) => (
                  <div key={i} className={`p-3 rounded-lg border text-sm ${
                    r.success
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{r.nama}</p>
                        <p className="text-xs text-slate-500 font-mono">{r.idpel} — {formatPeriode(r.blth)}</p>
                        {r.success && (
                          <p className="text-xs text-green-600 mt-1 font-mono">{r.transactionCode}</p>
                        )}
                        {r.error && (
                          <p className="text-xs text-red-600 mt-1">{r.error}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatRupiah(r.total)}</p>
                        <span className={`text-xs font-semibold ${r.success ? "text-green-600" : "text-red-600"}`}>
                          {r.success ? "LUNAS" : "GAGAL"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Tagihan</span>
                  <span className="font-semibold">{formatRupiah(receipt.totalBayar - receipt.totalAdmin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Biaya Admin</span>
                  <span className="font-semibold">{formatRupiah(receipt.totalAdmin)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>Total Bayar</span>
                  <span className="text-primary">{formatRupiah(receipt.totalBayar)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tunai</span>
                  <span className="font-semibold">{formatRupiah(receipt.tunai)}</span>
                </div>
                <div className="flex justify-between font-bold text-green-600">
                  <span>Kembalian</span>
                  <span>{formatRupiah(receipt.kembalian)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (!receipt) return;
                    const successBills = receipt.results.filter((r) => r.success);
                    if (successBills.length === 0) return;
                    const printableBills = successBills.map((r) => {
                      if (r.provider === "LUNASIN") {
                        const pd = r.providerData || {};
                        const rpAdmin = Number(pd.rp_admin || r.adminFee || 0);
                        const rpAmount = Number(pd.rp_amount || Math.max(0, r.total - rpAdmin));
                        return {
                          type: "pln" as const,
                          idpel: r.idpel,
                          nama: r.nama,
                          kodeProduk: r.kodeProduk || "",
                          periode: String(pd.periode || ""),
                          tarif: String(pd.tarif || ""),
                          daya: String(pd.daya || ""),
                          standMeter: String(pd.stand_meter || ""),
                          noMeter: String(pd.nometer || ""),
                          jumBill: String(pd.jum_bill || "1"),
                          tokenPln: String(pd.token || ""),
                          refnumLunasin: String(pd.refnum_lunasin || ""),
                          noreg: String(pd.noreg || ""),
                          tglReg: String(pd.tgl_reg || ""),
                          jenisReg: String(pd.jenis_reg || ""),
                          rpAmount,
                          rpAdmin,
                          tagihan: rpAmount,
                          admin: rpAdmin,
                          total: r.total,
                          transactionCode: r.transactionCode,
                          kwh: String(pd.kwh || ""),
                          rpMaterai: Number(pd.rp_materai || 0),
                          rpPpn: Number(pd.rp_ppn || 0),
                          rpPju: Number(pd.rp_pju || 0),
                          rpAngsuran: Number(pd.rp_angsuran || 0),
                          rpToken: Number(pd.rp_token || 0),
                          rpTotal: Number(pd.rp_total || 0),
                          saldoTerpotong: Number(pd.saldo_terpotong || 0),
                          refnum: String(pd.refnum || ""),
                          tglLunas: String(pd.tgl_lunas || ""),
                          pesanBiller: String(pd.pesan_biller || ""),
                          // BPJS-specific
                          nova: String(pd.nova || ""),
                          novaKepalaKeluarga: String(pd.nova_kepala_keluarga || ""),
                          jumPeserta: String(pd.jum_peserta || ""),
                          kodeCabang: String(pd.kode_cabang || ""),
                          namaCabang: String(pd.nama_cabang || ""),
                          sisaSaldoBpjs: String(pd.sisa || ""),
                          // Pulsa & Paket Data
                          nomor: String(pd.nomor || ""),
                          denom: String(pd.denom || ""),
                          namaProduk: String(pd.nama_produk || ""),
                          serialNumber: String(pd.serial_number || ""),
                          masaBerlaku: String(pd.masa_berlaku || ""),
                        };
                      }

                      const orig = daftarTagihanSnapshot.find(
                        (b) => b.idpel === r.idpel && b.thbln === r.blth
                      );
                      return {
                        type: "pdam" as const,
                        idpel: r.idpel,
                        nama: r.nama,
                        alamat: orig?.alamat,
                        gol: orig?.gol,
                        periode: r.blth,
                        standLalu: orig?.standLalu,
                        standKini: orig?.standKini,
                        pemakaian: orig?.pakai,
                        hargaAir: orig?.harga,
                        denda: orig?.denda,
                        materai: orig?.materai,
                        limbah: orig?.limbah,
                        retribusi: orig?.retribusi,
                        bebanTetap: orig?.bebanTetap,
                        biayaMeter: orig?.biayaMeter,
                        diskon: orig?.diskon,
                        tagihan: Math.max(0, r.total - (r.adminFee || receipt.biayaAdmin || 0)),
                        admin: r.adminFee || receipt.biayaAdmin || 0,
                        total: r.total,
                        transactionCode: r.transactionCode,
                      };
                    });

                    printReceipt({
                      loketName: receipt.loketName,
                      loketCode: receipt.loketCode,
                      kasir: (session?.user as { name?: string })?.name || "-",
                      tanggal: receipt.paidAt,
                      bills: printableBills,
                      totalTagihan: printableBills.reduce((s, bill) => s + bill.tagihan, 0),
                      totalAdmin: printableBills.reduce((s, bill) => s + bill.admin, 0),
                      totalBayar: printableBills.reduce((s, bill) => s + bill.total, 0),
                      tunai: receipt.tunai,
                      kembalian: receipt.kembalian,
                    });
                  }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">print</span>
                  Cetak Struk
                </button>

                <button
                  onClick={handleCloseReceipt}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">
                    {receipt.allSuccess ? "add_circle" : "refresh"}
                  </span>
                  {receipt.allSuccess ? "Transaksi Baru" : "Kembali"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={favoritesModalOpen}
        onClose={() => {
          setFavoritesModalOpen(false);
          setFavoriteSearch("");
        }}
        title="Pelanggan Favorit"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={favoriteSearch}
              onChange={(e) => setFavoriteSearch(e.target.value)}
              placeholder="Cari nama, alias, ID, atau alamat"
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{filteredFavorites.length} favorit ditemukan</span>
            <button
              type="button"
              onClick={() => void fetchFavorites(activeTab)}
              className="font-bold text-primary hover:text-primary/80"
            >
              Refresh
            </button>
          </div>

          {favoritesLoading ? (
            <div className="py-10 text-center text-slate-400">
              <span className="material-symbols-outlined animate-spin text-3xl block mb-2">progress_activity</span>
              Memuat favorit pelanggan...
            </div>
          ) : filteredFavorites.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <span className="material-symbols-outlined text-3xl block mb-2">star</span>
              {favoriteSearch ? "Tidak ada favorit yang cocok dengan pencarian." : "Belum ada pelanggan favorit tersimpan."}
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {filteredFavorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-amber-500 text-base">star</span>
                        <p className="font-bold text-sm truncate">
                          {favorite.aliasName || favorite.customerName || favorite.customerId}
                        </p>
                      </div>
                      <p className="text-xs font-mono text-slate-500">{favorite.customerId}</p>
                      {favorite.customerName && favorite.aliasName && favorite.customerName !== favorite.aliasName && (
                        <p className="text-xs text-slate-500 mt-1">Nama pelanggan: {favorite.customerName}</p>
                      )}
                      {favorite.address && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{favorite.address}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-2">
                        Dipakai {favorite.usageCount}x · terakhir {new Date(favorite.lastUsedAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleUseFavorite(favorite)}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
                      >
                        Pakai
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteFavorite(favorite.id)}
                        disabled={favoriteDeletingId === favorite.id}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {favoriteDeletingId === favorite.id ? "Menghapus..." : "Hapus"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {favoritesError && (
            <p className="text-xs text-red-600 dark:text-red-400">{favoritesError}</p>
          )}
        </div>
      </Modal>

      {/* Modal: Grup Favorit */}
      <Modal
        open={groupsModalOpen}
        onClose={() => { setGroupsModalOpen(false); setGroupSearch(""); }}
        title="Grup Favorit"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Cari nama grup atau pelanggan"
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{filteredGroups.length} grup ditemukan</span>
            <button type="button" onClick={() => void fetchFavoriteGroups()} className="font-bold text-primary hover:text-primary/80">
              Refresh
            </button>
          </div>

          {groupsLoading ? (
            <div className="py-10 text-center text-slate-400">
              <span className="material-symbols-outlined animate-spin text-3xl block mb-2">progress_activity</span>
              Memuat grup favorit...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <span className="material-symbols-outlined text-3xl block mb-2">folder_special</span>
              {groupSearch ? "Tidak ada grup yang cocok." : "Belum ada grup favorit. Simpan keranjang tagihan sebagai grup."}
            </div>
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {filteredGroups.map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-violet-500 text-base">folder_special</span>
                        <p className="font-bold text-sm truncate">{group.groupName}</p>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-500">
                          {group.items.length} item
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {group.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px]"
                          >
                            <span className="font-bold text-slate-600 dark:text-slate-300">
                              {getServiceTypeLabel(item.serviceType, item.productCode)}
                            </span>
                            <span className="font-mono text-slate-500">{item.customerId}</span>
                            {item.customerName && (
                              <span className="text-slate-400 truncate max-w-[100px]">· {item.customerName}</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Dipakai {group.usageCount}x
                        {group.lastUsedAt && (
                          <> · terakhir {new Date(group.lastUsedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleUseGroup(group)}
                        disabled={groupInquiryLoading}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                      >
                        {groupInquiryLoading ? "Loading..." : "Pakai"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteGroup(group.id)}
                        disabled={groupDeletingId === group.id}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {groupDeletingId === group.id ? "Menghapus..." : "Hapus"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Simpan Keranjang sebagai Grup */}
      <Modal
        open={saveGroupModalOpen}
        onClose={() => { setSaveGroupModalOpen(false); setSaveGroupName(""); }}
        title="Simpan sebagai Grup Favorit"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Simpan {daftarTagihan.length > 0 ? `${new Set(daftarTagihan.map((t) => t.idpel)).size} pelanggan PDAM` : ""}
            {daftarTagihan.length > 0 && daftarTagihanPln.length > 0 ? " + " : ""}
            {daftarTagihanPln.length > 0 ? `${daftarTagihanPln.length} item Lunasin` : ""}
            {" "}sebagai grup favorit untuk inquiry cepat di kemudian hari.
          </p>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Nama Grup</label>
            <input
              type="text"
              value={saveGroupName}
              onChange={(e) => setSaveGroupName(e.target.value)}
              placeholder="Contoh: Pelanggan RT 05, Paket Bulanan, dll."
              maxLength={150}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSaveCartAsGroup(); } }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setSaveGroupModalOpen(false); setSaveGroupName(""); }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCartAsGroup()}
              disabled={saveGroupLoading || !saveGroupName.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {saveGroupLoading ? "Menyimpan..." : "Simpan Grup"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Footer */}
      <footer className="mt-12 py-10 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-slate-400 text-sm">
          © 2023 Pedami Payment. Layanan Pembayaran Terpadu Indonesia.
        </p>
      </footer>
    </>
  );
}