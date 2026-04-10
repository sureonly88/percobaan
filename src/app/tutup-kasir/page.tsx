"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";
import { normalizeRole } from "@/lib/rbac";
import { printCashierClosingReport } from "@/lib/print-cashier-closing";

type ClosingStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "REJECTED";
type ShiftCode = "REGULER" | "PAGI" | "SIANG" | "MALAM";

interface ClosingSummary {
  successfulRequestCount: number;
  successfulItemCount: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
  systemCashTotal: number;
}

interface CashierOption {
  username: string;
  displayName: string;
  role: string;
  loketCode: string;
  loketName: string;
}

interface DiscrepancyReasonOption {
  code: string;
  label: string;
}

interface ClosingDenomination {
  denomination: number;
  quantity: number;
  subtotal: number;
}

interface ProductBreakdown {
  provider: string;
  serviceType: string;
  itemCount: number;
  totalTagihan: number;
  totalAdmin: number;
  total: number;
}

interface ClosingDetail {
  id: number;
  businessDate: string;
  shiftCode: ShiftCode;
  loketCode: string;
  loketName: string | null;
  username: string;
  openingId: number | null;
  openingCash: number;
  systemRequestCount: number;
  systemTransactionCount: number;
  systemAmountTotal: number;
  systemAdminTotal: number;
  systemCashTotal: number;
  countedCashTotal: number;
  otherCashAmount: number;
  retainedCash: number;
  depositTotal: number;
  receivedAmount: number;
  receivedDifferenceAmount: number;
  discrepancyAmount: number;
  cashierNote: string | null;
  discrepancyNote: string | null;
  discrepancyReasonCode?: string | null;
  proofReference?: string | null;
  proofNote?: string | null;
  status: ClosingStatus;
  submittedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifierNote: string | null;
  reopenRequestedAt?: string | null;
  reopenRequestedBy?: string | null;
  reopenRequestNote?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  reopenNote?: string | null;
  revisionCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
  denominations: ClosingDenomination[];
}

interface ClosingHistoryItem {
  id: number;
  businessDate: string;
  shiftCode?: ShiftCode;
  loketCode: string;
  loketName: string | null;
  username: string;
  openingId?: number | null;
  openingCash: number;
  systemCashTotal: number;
  countedCashTotal: number;
  retainedCash: number;
  depositTotal: number;
  receivedAmount: number;
  receivedDifferenceAmount: number;
  discrepancyAmount: number;
  discrepancyReasonCode?: string | null;
  proofReference?: string | null;
  status: ClosingStatus;
  submittedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  reopenRequestedAt?: string | null;
  reopenRequestedBy?: string | null;
  revisionCount?: number;
  updatedAt: string | null;
}

interface OverviewResponse {
  businessDate: string;
  shiftCode: ShiftCode;
  discrepancyReasons: DiscrepancyReasonOption[];
  filters: {
    canSelectAll: boolean;
    username: string | null;
    loketCode: string | null;
  };
  summary: ClosingSummary;
  effectiveSummary: ClosingSummary;
  suggestedOpeningCash: number;
  carrySourceClosingId: number | null;
  closing: ClosingDetail | null;
  history: ClosingHistoryItem[];
  productBreakdown: ProductBreakdown[];
  cashierOptions: CashierOption[];
  denominations: number[];
}

interface ReopenState {
  open: boolean;
  closingId: number | null;
  mode: "request" | "approve";
  title: string;
  description: string;
}

function getToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseNumber(value: string): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("id-ID");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusStyle(status: ClosingStatus): string {
  switch (status) {
    case "VERIFIED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

function getStatusLabel(status: ClosingStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Terverifikasi";
    case "SUBMITTED":
      return "Diajukan";
    case "REJECTED":
      return "Ditolak";
    default:
      return "Draft";
  }
}

export default function TutupKasirPage() {
  const { data: session } = useSession();
  const userRole = normalizeRole((session?.user as { role?: string })?.role || "");
  const isApprover = userRole === "admin" || userRole === "supervisor";

  const [businessDate, setBusinessDate] = useState(getToday());
  const [appliedBusinessDate, setAppliedBusinessDate] = useState(getToday());
  const [selectedUsername, setSelectedUsername] = useState("");
  const [appliedUsername, setAppliedUsername] = useState("");
  const [appliedLoketCode, setAppliedLoketCode] = useState("");
  const [cashierDropdownOpen, setCashierDropdownOpen] = useState(false);
  const [cashierSearch, setCashierSearch] = useState("");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [openingCash, setOpeningCash] = useState("0");
  const [otherCashAmount, setOtherCashAmount] = useState("0");
  const [retainedCash, setRetainedCash] = useState("0");
  const [cashierNote, setCashierNote] = useState("");
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [discrepancyReasonCode, setDiscrepancyReasonCode] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [denominationQty, setDenominationQty] = useState<Record<number, string>>({});

  const [reopenState, setReopenState] = useState<ReopenState>({
    open: false,
    closingId: null,
    mode: "request",
    title: "",
    description: "",
  });
  const [reopenNote, setReopenNote] = useState("");
  const cashierDropdownRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ businessDate: appliedBusinessDate });
      if (appliedUsername) params.set("username", appliedUsername);
      if (appliedLoketCode) params.set("loketCode", appliedLoketCode);

      const response = await fetch(`/api/tutup-kasir?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Gagal mengambil data tutup kasir");
      }
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengambil data tutup kasir";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedBusinessDate, appliedLoketCode, appliedUsername]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;

    setSelectedUsername((prev) => (!prev && data.filters.username ? data.filters.username : prev));

    const closing = data.closing;
    setOpeningCash(String(data.suggestedOpeningCash ?? closing?.openingCash ?? 0));
    setOtherCashAmount(String(closing?.otherCashAmount ?? 0));
    setRetainedCash(String(closing?.retainedCash ?? 0));
    setCashierNote(closing?.cashierNote ?? "");
    setDiscrepancyNote(closing?.discrepancyNote ?? "");
    setDiscrepancyReasonCode(closing?.discrepancyReasonCode ?? "");
    setProofReference(closing?.proofReference ?? "");
    setProofNote(closing?.proofNote ?? "");

    const nextDenoms: Record<number, string> = {};
    for (const denomination of data.denominations) {
      const found = closing?.denominations.find((item) => item.denomination === denomination);
      nextDenoms[denomination] = String(found?.quantity ?? 0);
    }
    setDenominationQty(nextDenoms);
  }, [data]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cashierDropdownRef.current && !cashierDropdownRef.current.contains(event.target as Node)) {
        setCashierDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cashierOptions = data?.cashierOptions ?? [];
  const discrepancyReasons = data?.discrepancyReasons ?? [];
  const productBreakdown = data?.productBreakdown ?? [];
  const discrepancyReasonMap = useMemo(
    () => new Map(discrepancyReasons.map((item) => [item.code, item.label])),
    [discrepancyReasons]
  );
  const filteredCashierOptions = useMemo(() => {
    const keyword = cashierSearch.trim().toLowerCase();
    if (!keyword) return cashierOptions;

    return cashierOptions.filter((item) => (
      item.displayName.toLowerCase().includes(keyword)
      || item.username.toLowerCase().includes(keyword)
      || item.loketCode.toLowerCase().includes(keyword)
      || item.loketName.toLowerCase().includes(keyword)
    ));
  }, [cashierOptions, cashierSearch]);

  const effectiveSummary = data?.effectiveSummary ?? {
    successfulRequestCount: 0,
    successfulItemCount: 0,
    totalTagihan: 0,
    totalAdmin: 0,
    totalNominal: 0,
    systemCashTotal: 0,
  };

  const openingCashValue = parseNumber(openingCash);
  const otherCashAmountValue = parseNumber(otherCashAmount);
  const retainedCashValue = parseNumber(retainedCash);
  const denominationRows = (data?.denominations ?? []).map((denomination) => {
    const quantity = parseNumber(denominationQty[denomination] || "0");
    return {
      denomination,
      quantity,
      subtotal: denomination * quantity,
    };
  });
  const denominationTotal = denominationRows.reduce((sum, item) => sum + item.subtotal, 0);
  const countedCashTotal = denominationTotal + otherCashAmountValue;
  const expectedCashTotal = openingCashValue + effectiveSummary.systemCashTotal;
  const depositTotal = countedCashTotal - retainedCashValue;
  const discrepancyAmount = countedCashTotal - expectedCashTotal;
  const hasInvalidRetainedCash = retainedCashValue > countedCashTotal;
  const canEditClosing = !data?.closing || data.closing.status === "DRAFT" || data.closing.status === "REJECTED";
  const canRequestReopen = !isApprover;

  const selectedCashierLabel = useMemo(() => {
    if (!selectedUsername) {
      if (data?.filters.canSelectAll) return "Semua Kasir";
      const firstCashier = cashierOptions[0];
      return firstCashier ? `${firstCashier.displayName} (${firstCashier.username})` : (data?.filters.username || "-");
    }

    const found = cashierOptions.find((item) => item.username === selectedUsername);
    return found ? `${found.displayName} (${found.username})` : selectedUsername;
  }, [cashierOptions, data?.filters.canSelectAll, data?.filters.username, selectedUsername]);

  const handleCashierChange = (username: string) => {
    setSelectedUsername(username);
  };

  const filtersAreDirty = businessDate !== appliedBusinessDate || selectedUsername !== appliedUsername;

  const handleApplyFilters = () => {
    const selected = cashierOptions.find((item) => item.username === selectedUsername);
    setAppliedBusinessDate(businessDate);
    setAppliedUsername(selectedUsername);
    setAppliedLoketCode(selected?.loketCode ?? "");
  };

  const handleSave = async (action: "draft" | "submit") => {
    if (action === "submit" && discrepancyAmount !== 0 && !discrepancyReasonCode) {
      setError("Alasan selisih wajib dipilih saat ada selisih kas.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/tutup-kasir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessDate: appliedBusinessDate,
          username: appliedUsername || undefined,
          loketCode: appliedLoketCode || undefined,
          openingCash: openingCashValue,
          otherCashAmount: otherCashAmountValue,
          retainedCash: retainedCashValue,
          cashierNote,
          discrepancyNote,
          discrepancyReasonCode,
          proofReference,
          proofNote,
          denominations: denominationRows.map((item) => ({
            denomination: item.denomination,
            quantity: item.quantity,
          })),
          action,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Gagal menyimpan tutup kasir");
      }

      setSuccess(action === "submit" ? "Closing kasir berhasil diajukan." : "Draft tutup kasir berhasil disimpan.");
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan tutup kasir";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled = saving || hasInvalidRetainedCash || depositTotal < 0;

  const breakdownGrandTotal = useMemo(() => ({
    itemCount: productBreakdown.reduce((s, r) => s + r.itemCount, 0),
    totalTagihan: productBreakdown.reduce((s, r) => s + r.totalTagihan, 0),
    totalAdmin: productBreakdown.reduce((s, r) => s + r.totalAdmin, 0),
    total: productBreakdown.reduce((s, r) => s + r.total, 0),
  }), [productBreakdown]);

  const breakdownByProvider = useMemo(() => {
    const map = new Map<string, { serviceTypes: ProductBreakdown[]; totalTagihan: number; totalAdmin: number; total: number; itemCount: number }>();
    for (const row of productBreakdown) {
      const existing = map.get(row.provider) ?? { serviceTypes: [], totalTagihan: 0, totalAdmin: 0, total: 0, itemCount: 0 };
      map.set(row.provider, {
        serviceTypes: [...existing.serviceTypes, row],
        totalTagihan: existing.totalTagihan + row.totalTagihan,
        totalAdmin: existing.totalAdmin + row.totalAdmin,
        total: existing.total + row.total,
        itemCount: existing.itemCount + row.itemCount,
      });
    }
    return Array.from(map.entries()).map(([provider, stats]) => ({ provider, ...stats }));
  }, [productBreakdown]);

  const printCurrentClosing = () => {
    if (!data?.closing) return;

    printCashierClosingReport({
      businessDate: data.closing.businessDate,
      shiftCode: data.closing.shiftCode,
      loketCode: data.closing.loketCode,
      loketName: data.closing.loketName || data.closing.loketCode,
      username: data.closing.username,
      openingCash: data.closing.openingCash,
      systemRequestCount: data.closing.systemRequestCount,
      systemTransactionCount: data.closing.systemTransactionCount,
      systemAmountTotal: data.closing.systemAmountTotal,
      systemAdminTotal: data.closing.systemAdminTotal,
      systemCashTotal: data.closing.systemCashTotal,
      countedCashTotal: data.closing.countedCashTotal,
      retainedCash: data.closing.retainedCash,
      depositTotal: data.closing.depositTotal,
      receivedAmount: data.closing.receivedAmount,
      receivedDifferenceAmount: data.closing.receivedDifferenceAmount,
      discrepancyAmount: data.closing.discrepancyAmount,
      discrepancyReasonLabel: discrepancyReasonMap.get(data.closing.discrepancyReasonCode || "") || null,
      cashierNote: data.closing.cashierNote,
      discrepancyNote: data.closing.discrepancyNote,
      verifierNote: data.closing.verifierNote,
      receivedBy: data.closing.receivedBy,
      verifiedBy: data.closing.verifiedBy,
      submittedAt: data.closing.submittedAt,
      receivedAt: data.closing.receivedAt,
      verifiedAt: data.closing.verifiedAt,
      proofReference: data.closing.proofReference,
      proofNote: data.closing.proofNote,
    });
  };

  const openReopenModal = (item: ClosingHistoryItem, mode: "request") => {
    setReopenNote("");
    setReopenState({
      open: true,
      closingId: item.id,
      mode,
      title: "Ajukan Reopen Closing",
      description: `Ajukan pembukaan kembali closing kasir ${item.username} (${item.loketCode}) agar bisa direvisi.`,
    });
  };

  const handleReopenAction = async () => {
    if (!reopenState.closingId) return;
    setReopenSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/tutup-kasir", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reopenState.mode === "request" ? "request_reopen" : "approve_reopen",
          closingId: reopenState.closingId,
          note: reopenNote,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Gagal memproses reopen closing");
      }

      setSuccess(reopenState.mode === "request" ? "Permintaan reopen berhasil diajukan." : "Reopen closing berhasil disetujui.");
      setReopenState((prev) => ({ ...prev, open: false, closingId: null }));
      setReopenNote("");
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memproses reopen closing";
      setError(message);
    } finally {
      setReopenSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Tutup Kasir" },
        ]}
      />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tutup Kasir Harian</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cocokkan rekap transaksi sistem dengan uang fisik kasir sebelum setoran ke admin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => void fetchData()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={printCurrentClosing}
            disabled={!data?.closing}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200"
          >
            Cetak BA
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Tanggal Closing</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Kasir</label>
            <div className="relative" ref={cashierDropdownRef}>
              <button
                type="button"
                disabled={!data?.filters.canSelectAll}
                onClick={() => {
                  if (!data?.filters.canSelectAll) return;
                  setCashierDropdownOpen((prev) => !prev);
                  setCashierSearch("");
                }}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 pr-10 text-left text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
              >
                <span className={`block truncate ${!selectedUsername && data?.filters.canSelectAll ? "text-slate-400" : ""}`}>
                  {selectedCashierLabel}
                </span>
              </button>
              <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">expand_more</span>

              {cashierDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-100 p-2 dark:border-slate-800">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-slate-400">search</span>
                      <input
                        type="text"
                        value={cashierSearch}
                        onChange={(e) => setCashierSearch(e.target.value)}
                        placeholder="Cari kasir..."
                        autoFocus
                        className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        handleCashierChange("");
                        setCashierDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        selectedUsername === "" ? "bg-primary/5 font-bold text-primary" : ""
                      }`}
                    >
                      <span>Semua Kasir</span>
                      {selectedUsername === "" && <span className="material-symbols-outlined text-base text-primary">check</span>}
                    </button>

                    {filteredCashierOptions.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">Tidak ditemukan</div>
                    ) : (
                      filteredCashierOptions.map((item) => (
                        <button
                          key={`${item.username}-${item.loketCode}`}
                          type="button"
                          onClick={() => {
                            handleCashierChange(item.username);
                            setCashierDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                            selectedUsername === item.username ? "bg-primary/5 font-bold text-primary" : ""
                          }`}
                        >
                          <span>
                            {item.displayName}
                            <span className="ml-1.5 text-xs text-slate-400">{item.username}</span>
                          </span>
                          {selectedUsername === item.username && <span className="material-symbols-outlined text-base text-primary">check</span>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleApplyFilters}
              className={`h-11 w-full rounded-lg px-4 text-sm font-bold text-white transition ${filtersAreDirty ? "bg-amber-500 ring-2 ring-amber-300 hover:bg-amber-600" : "bg-primary hover:bg-primary/90"}`}
            >
              Terapkan Filter
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          {data?.filters.canSelectAll
            ? "Admin/supervisor dapat melihat semua kasir dan menyimpan draft atas nama kasir. Verifikasi dilakukan di halaman Verifikasi Kasir."
            : "Kasir hanya dapat mengakses closing untuk username dan loket miliknya sendiri."}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            {success}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Permintaan Sukses</p>
          <p className="mt-2 text-lg font-bold">{loading ? "..." : formatNumber(effectiveSummary.successfulRequestCount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Item Transaksi</p>
          <p className="mt-2 text-lg font-bold">{loading ? "..." : formatNumber(effectiveSummary.successfulItemCount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Tagihan</p>
          <p className="mt-2 text-lg font-bold">{loading ? "..." : formatRupiah(effectiveSummary.totalTagihan)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Admin</p>
          <p className="mt-2 text-lg font-bold">{loading ? "..." : formatRupiah(effectiveSummary.totalAdmin)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Kas Sistem</p>
          <p className="mt-2 text-lg font-bold">{loading ? "..." : formatRupiah(effectiveSummary.systemCashTotal)}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Form Tutup Kasir</h2>
              <p className="text-sm text-slate-500">
                Isi modal awal kas, hitung pecahan uang fisik, tentukan kas ditahan, lalu simpan draft atau ajukan.
              </p>
            </div>
            {data?.closing && (
              <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(data.closing.status)}`}>
                {getStatusLabel(data.closing.status)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Modal Awal Kas</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                disabled={!canEditClosing}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
              />
              <p className="mt-2 text-xs text-slate-400">
                Saran carry-forward: {formatRupiah(data?.suggestedOpeningCash ?? 0)}{data?.carrySourceClosingId ? ` · dari closing #${data.carrySourceClosingId}` : ""}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Uang Lainnya / Koin</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={otherCashAmount}
                onChange={(e) => setOtherCashAmount(e.target.value)}
                disabled={!canEditClosing}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Hitung Pecahan Uang</h3>
              <span className="text-sm font-semibold text-slate-500">Subtotal pecahan: {formatRupiah(denominationTotal)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {denominationRows.map((item) => (
                <div key={item.denomination} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatRupiah(item.denomination)}</span>
                    <span className="text-xs text-slate-400">subtotal</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={denominationQty[item.denomination] || "0"}
                    onChange={(e) => setDenominationQty((prev) => ({ ...prev, [item.denomination]: e.target.value }))}
                    disabled={!canEditClosing}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                  />
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{formatRupiah(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Kas Ditahan untuk Besok</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={retainedCash}
                onChange={(e) => setRetainedCash(e.target.value)}
                disabled={!canEditClosing}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
              />
              {hasInvalidRetainedCash && (
                <p className="mt-2 text-xs font-medium text-red-500">Kas ditahan tidak boleh melebihi kas fisik.</p>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Setoran ke Admin</label>
              <div className={`flex h-11 items-center rounded-lg border px-3 text-sm font-bold ${depositTotal < 0 ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"}`}>
                {formatRupiah(depositTotal)}
              </div>
              {depositTotal < 0 && (
                <p className="mt-2 text-xs font-medium text-red-500">Setoran tidak boleh negatif.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Catatan Kasir</label>
              <textarea
                value={cashierNote}
                onChange={(e) => setCashierNote(e.target.value)}
                disabled={!canEditClosing}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
                placeholder="Catatan tambahan untuk admin (opsional)"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Catatan Selisih</label>
              <textarea
                value={discrepancyNote}
                onChange={(e) => setDiscrepancyNote(e.target.value)}
                disabled={!canEditClosing}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
                placeholder="Wajib diisi jika ada selisih saat submit"
              />
            </div>
          </div>

          {discrepancyAmount !== 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Alasan Selisih</label>
                <select
                  value={discrepancyReasonCode}
                  onChange={(e) => setDiscrepancyReasonCode(e.target.value)}
                  disabled={!canEditClosing}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
                >
                  <option value="">Pilih alasan selisih</option>
                  {discrepancyReasons.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Referensi Bukti</label>
                <input
                  type="text"
                  value={proofReference}
                  onChange={(e) => setProofReference(e.target.value)}
                  disabled={!canEditClosing}
                  placeholder="No. amplop / foto / dokumen"
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Catatan Bukti</label>
                <input
                  type="text"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  disabled={!canEditClosing}
                  placeholder="Keterangan tambahan bukti"
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 print:hidden">
            <button
              type="button"
              onClick={() => void handleSave("draft")}
              disabled={saving || !canEditClosing || hasInvalidRetainedCash || depositTotal < 0}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {saving ? "Menyimpan..." : "Simpan Draft"}
            </button>
            <button
              type="button"
              onClick={() => void handleSave("submit")}
              disabled={submitDisabled || !canEditClosing}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Memproses..." : data?.closing?.status === "REJECTED" ? "Ajukan Ulang Closing" : "Ajukan Closing"}
            </button>
          </div>

          {data?.closing?.status === "REJECTED" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-900/50 dark:bg-red-950/40">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-lg text-red-500">error</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-700 dark:text-red-300">Closing Ditolak oleh {data.closing.verifiedBy || "Admin"}</p>
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {data.closing.verifierNote || "Tidak ada catatan penolakan."}
                  </p>
                  <p className="mt-2 text-xs text-red-500/80">
                    Ditolak pada {formatDateTime(data.closing.verifiedAt)} · Silakan perbaiki data lalu klik &quot;Ajukan Ulang Closing&quot;.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!canEditClosing && data?.closing?.status === "VERIFIED" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              Closing ini sudah diverifikasi dan dikunci dari perubahan.
            </div>
          )}
          {!canEditClosing && data?.closing?.status === "SUBMITTED" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              Closing sedang menunggu verifikasi admin/supervisor di halaman <span className="font-bold">Verifikasi Kasir</span>.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Ringkasan Pencocokan Kas</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500">Kas Sistem Hari Ini</span>
                <span className="font-bold">{formatRupiah(effectiveSummary.systemCashTotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500">Modal Awal</span>
                <span className="font-bold">{formatRupiah(openingCashValue)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500">Kas Seharusnya</span>
                <span className="font-bold">{formatRupiah(expectedCashTotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500">Kas Fisik</span>
                <span className="font-bold">{formatRupiah(countedCashTotal)}</span>
              </div>
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${discrepancyAmount === 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" : discrepancyAmount > 0 ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"}`}>
                <span>Selisih</span>
                <span className="font-bold">{formatRupiah(discrepancyAmount)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Status Closing Aktif</h2>
            {data?.closing ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(data.closing.status)}`}>
                    {getStatusLabel(data.closing.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Terakhir Disimpan</span>
                  <span className="font-medium">{formatDateTime(data.closing.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Diajukan</span>
                  <span className="font-medium">{formatDateTime(data.closing.submittedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Setoran Kasir</span>
                  <span className="font-medium">{formatRupiah(data.closing.depositTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Diterima Admin</span>
                  <span className="font-medium">{data.closing.receivedAt ? formatRupiah(data.closing.receivedAmount) : "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Selisih Admin vs Setoran</span>
                  <span className={`font-medium ${data.closing.receivedDifferenceAmount < 0 ? "text-red-500" : data.closing.receivedDifferenceAmount > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                    {data.closing.receivedAt ? formatRupiah(data.closing.receivedDifferenceAmount) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Diterima Pada</span>
                  <span className="font-medium">{formatDateTime(data.closing.receivedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Penerima Setoran</span>
                  <span className="font-medium">{data.closing.receivedBy || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Diverifikasi</span>
                  <span className="font-medium">{formatDateTime(data.closing.verifiedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Verifier</span>
                  <span className="font-medium">{data.closing.verifiedBy || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Alasan Selisih</span>
                  <span className="font-medium">{discrepancyReasonMap.get(data.closing.discrepancyReasonCode || "") || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Referensi Bukti</span>
                  <span className="font-medium">{data.closing.proofReference || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Revisi</span>
                  <span className="font-medium">{formatNumber(data.closing.revisionCount || 0)}</span>
                </div>
                {data.closing.reopenRequestedAt && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                    <p className="text-xs font-bold uppercase tracking-wider">Permintaan Reopen</p>
                    <p className="mt-1 text-sm">
                      Diajukan {data.closing.reopenRequestedBy || "-"} pada {formatDateTime(data.closing.reopenRequestedAt)}.
                    </p>
                    {data.closing.reopenRequestNote && <p className="mt-1 text-sm">{data.closing.reopenRequestNote}</p>}
                  </div>
                )}
                {data.closing.verifierNote && (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Catatan Verifikator</p>
                    <p>{data.closing.verifierNote}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Belum ada closing tersimpan untuk filter aktif.</p>
            )}
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Riwayat Closing</h2>
            <p className="text-sm text-slate-500">Menampilkan closing pada tanggal yang dipilih sesuai filter kasir.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {loading ? "..." : `${formatNumber(data?.history.length ?? 0)} data`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Kasir / Loket</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Kas Sistem</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Kas Fisik</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Setoran Kasir</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Diterima Admin</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Selisih</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Update</th>
                {canRequestReopen && <th className="whitespace-nowrap px-4 py-3 font-semibold text-right print:hidden">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={canRequestReopen ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                    Memuat riwayat closing...
                  </td>
                </tr>
              ) : (data?.history.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={canRequestReopen ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                    Belum ada closing pada tanggal ini.
                  </td>
                </tr>
              ) : (
                data?.history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{item.username}</div>
                      <div className="text-xs text-slate-400">{item.loketName || item.loketCode} · {item.loketCode}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.systemCashTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.countedCashTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatRupiah(item.depositTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="font-semibold">{item.receivedAt ? formatRupiah(item.receivedAmount) : "-"}</div>
                      {item.receivedAt && (
                        <div className={`text-xs ${item.receivedDifferenceAmount < 0 ? "text-red-500" : item.receivedDifferenceAmount > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                          Δ {formatRupiah(item.receivedDifferenceAmount)}
                        </div>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${item.discrepancyAmount < 0 ? "text-red-500" : item.discrepancyAmount > 0 ? "text-sky-500" : "text-emerald-500"}`}>
                      {formatRupiah(item.discrepancyAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(item.status)}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDateTime(item.updatedAt)}</td>
                    {canRequestReopen && (
                      <td className="px-4 py-3 print:hidden">
                        <div className="flex justify-end gap-2">
                          {!item.reopenRequestedAt && item.status === "VERIFIED" ? (
                            <button
                              type="button"
                              onClick={() => openReopenModal(item, "request")}
                              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                            >
                              Ajukan Reopen
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Rekap Transaksi Per Produk</h2>
            <p className="text-sm text-slate-500">
              {data?.closing
                ? `Transaksi kasir ${data.closing.username} · Loket ${data.closing.loketName || data.closing.loketCode} · ${data.closing.businessDate}`
                : appliedUsername
                  ? `Transaksi kasir ${appliedUsername} pada ${appliedBusinessDate}`
                  : `Rekap transaksi berdasarkan tanggal ${appliedBusinessDate}`}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {formatNumber(breakdownGrandTotal.itemCount)} item
          </span>
        </div>

        {breakdownByProvider.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {breakdownByProvider.map((item) => (
              <div key={item.provider} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-400">{item.provider}</p>
                <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{formatRupiah(item.total)}</p>
                <p className="mt-0.5 text-xs text-slate-400">{formatNumber(item.itemCount)} item · admin {formatRupiah(item.totalAdmin)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Provider</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Tipe Layanan</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Item</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Total Tagihan</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Total Admin</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {productBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Belum ada transaksi pada tanggal ini.
                  </td>
                </tr>
              ) : (
                productBreakdown.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{row.provider}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{row.serviceType}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatNumber(row.itemCount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatRupiah(row.totalTagihan)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatRupiah(row.totalAdmin)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{formatRupiah(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {productBreakdown.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Total
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-200">
                    {formatNumber(breakdownGrandTotal.itemCount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-200">
                    {formatRupiah(breakdownGrandTotal.totalTagihan)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-200">
                    {formatRupiah(breakdownGrandTotal.totalAdmin)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-200">
                    {formatRupiah(breakdownGrandTotal.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <Modal open={reopenState.open} onClose={() => setReopenState((prev) => ({ ...prev, open: false }))} title={reopenState.title}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{reopenState.description}</p>
          <textarea
            value={reopenNote}
            onChange={(e) => setReopenNote(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950"
            placeholder={reopenState.mode === "request" ? "Alasan reopen wajib diisi" : "Catatan persetujuan reopen (opsional)"}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setReopenState((prev) => ({ ...prev, open: false }))}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleReopenAction()}
              disabled={reopenSubmitting || (reopenState.mode === "request" && !reopenNote.trim())}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition ${reopenState.mode === "request" ? "bg-slate-700 hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white" : "bg-violet-600 hover:bg-violet-700"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {reopenSubmitting ? "Memproses..." : reopenState.mode === "request" ? "Kirim Permintaan Reopen" : "Setujui Reopen"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}