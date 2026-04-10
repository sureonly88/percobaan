"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, Input, Modal } from "@/ui";

interface PendingTransaction {
  transaction_code: string;
  transaction_date: string;
  cust_id: string;
  nama: string;
  kode_produk: string;
  id_trx: string;
  rp_amount: number;
  rp_admin: number;
  rp_total: number;
  loket_name: string;
  loket_code: string;
  username: string;
  provider_rc: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  advice_attempts: number;
  advice_locked?: boolean;
  created_at: string;
  updated_at: string;
  input2?: string | null;
  input3?: string | null;
}

type AdviceResultStatus = "success" | "failed" | "pending" | "error";
type AttemptFilter = "all" | "fresh" | "retried" | "escalated";
type SortOption = "oldest" | "latest" | "highest" | "attempts";

interface AdviceResultItem {
  status: AdviceResultStatus;
  message: string;
  parentStatus?: string | null;
}

interface BatchProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  pending: number;
  error: number;
}

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(/,/g, ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatRupiah(amount: number | string | null | undefined): string {
  return `Rp ${normalizeNumber(amount).toLocaleString("id-ID")}`;
}

function formatNumber(value: number | string | null | undefined): string {
  return normalizeNumber(value).toLocaleString("id-ID");
}

function formatTanggal(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getParentStatusLabel(status?: string | null): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCESS") return "Sukses";
  if (normalized === "PARTIAL_SUCCESS") return "Parsial";
  if (normalized === "PENDING_REVIEW") return "Butuh Review";
  if (normalized === "PENDING") return "Pending";
  if (normalized === "FAILED") return "Gagal";
  return normalized || "-";
}

function getResultAppearance(status: AdviceResultStatus) {
  if (status === "success") {
    return {
      className:
        "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60",
      icon: "check_circle",
    };
  }
  if (status === "failed") {
    return {
      className:
        "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200/70 dark:border-red-800/60",
      icon: "cancel",
    };
  }
  if (status === "error") {
    return {
      className:
        "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60",
      icon: "error",
    };
  }
  return {
    className:
      "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60",
    icon: "hourglass_top",
  };
}

function isAdviceLockedForUser(
  tx: Pick<PendingTransaction, "advice_attempts" | "advice_locked">,
  maxAdviceAttempts: number
) {
  return Boolean(tx.advice_locked) || tx.advice_attempts >= maxAdviceAttempts;
}

export default function AdviceLunasinPage() {
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [advisingAll, setAdvisingAll] = useState(false);
  const [confirmAdviceAllOpen, setConfirmAdviceAllOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>("all");
  const [productFilter, setProductFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("oldest");
  const [results, setResults] = useState<Record<string, AdviceResultItem>>({});
  const [maxAdviceAttempts, setMaxAdviceAttempts] = useState(3);

  const isProcessing = useCallback(
    (transactionCode: string) => processingIds.includes(transactionCode),
    [processingIds]
  );

  const fetchPending = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    setError("");
    try {
      const res = await fetch("/api/pembayaran/lunasin/advice", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat transaksi advice Lunasin");
      }

      setMaxAdviceAttempts(Number(data.maxAdviceAttempts || 3));
      setTransactions(data.transactions || []);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat transaksi advice Lunasin");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPending("initial");
  }, [fetchPending]);

  const productOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((tx) => tx.kode_produk).filter(Boolean))).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const filtered = transactions.filter((tx) => {
      const matchesSearch =
        !keyword ||
        tx.transaction_code.toLowerCase().includes(keyword) ||
        tx.cust_id.toLowerCase().includes(keyword) ||
        tx.nama.toLowerCase().includes(keyword) ||
        tx.kode_produk.toLowerCase().includes(keyword) ||
        tx.id_trx.toLowerCase().includes(keyword);

      const matchesAttempt =
        attemptFilter === "all" ||
        (attemptFilter === "fresh" && tx.advice_attempts === 0) ||
        (attemptFilter === "retried" && tx.advice_attempts >= 1) ||
        (attemptFilter === "escalated" && tx.advice_attempts >= 2);

      const matchesProduct = productFilter === "all" || tx.kode_produk === productFilter;

      return matchesSearch && matchesAttempt && matchesProduct;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "latest") {
        return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
      }
      if (sortBy === "highest") {
        return normalizeNumber(b.rp_total) - normalizeNumber(a.rp_total);
      }
      if (sortBy === "attempts") {
        return b.advice_attempts - a.advice_attempts || normalizeNumber(a.rp_total) - normalizeNumber(b.rp_total);
      }
      return new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    });
  }, [transactions, search, attemptFilter, productFilter, sortBy]);

  const actionableTransactions = useMemo(
    () => filteredTransactions.filter((tx) => !isAdviceLockedForUser(tx, maxAdviceAttempts)),
    [filteredTransactions, maxAdviceAttempts]
  );

  const summary = useMemo(() => {
    const totalPending = transactions.length;
    const totalNominal = transactions.reduce((sum, tx) => sum + normalizeNumber(tx.rp_total), 0);
    const retriedCount = transactions.filter((tx) => tx.advice_attempts > 0).length;
    const escalatedCount = transactions.filter((tx) => tx.advice_attempts >= 2).length;

    return {
      totalPending,
      totalNominal,
      retriedCount,
      escalatedCount,
    };
  }, [transactions]);

  const runSingleAdvice = useCallback(async (tx: PendingTransaction): Promise<AdviceResultStatus> => {
    setProcessingIds((prev) => (prev.includes(tx.transaction_code) ? prev : [...prev, tx.transaction_code]));
    setResults((prev) => ({
      ...prev,
      [tx.transaction_code]: { status: "pending", message: "Mengirim advice ke provider..." },
    }));

    try {
      const res = await fetch("/api/pembayaran/lunasin/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionCode: tx.transaction_code,
          idpel: tx.cust_id,
          kodeProduk: tx.kode_produk,
          idTrx: tx.id_trx,
          input2: tx.input2 || "",
          input3: tx.input3 || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data.error || "Gagal mengirim advice";
        setResults((prev) => ({
          ...prev,
          [tx.transaction_code]: { status: "error", message },
        }));

        if (data.errorCode === "ADVICE_LIMIT_REACHED") {
          setTransactions((prev) =>
            prev.map((item) =>
              item.transaction_code === tx.transaction_code
                ? {
                    ...item,
                    advice_attempts: Number(data.adviceAttempts || item.advice_attempts),
                    advice_locked: true,
                  }
                : item
            )
          );
        }

        return "error";
      }

      if (data.success) {
        const parentLabel = data.paymentRequestStatus
          ? ` Status monitoring: ${getParentStatusLabel(data.paymentRequestStatus)}.`
          : "";
        setResults((prev) => ({
          ...prev,
          [tx.transaction_code]: {
            status: "success",
            message: `Transaksi berhasil dipastikan sukses.${parentLabel}`,
            parentStatus: data.paymentRequestStatus || null,
          },
        }));
        setTransactions((prev) => prev.filter((item) => item.transaction_code !== tx.transaction_code));
        return "success";
      }

      if (data.failed) {
        const parentLabel = data.paymentRequestStatus
          ? ` Status monitoring: ${getParentStatusLabel(data.paymentRequestStatus)}.`
          : "";
        setResults((prev) => ({
          ...prev,
          [tx.transaction_code]: {
            status: "failed",
            message: `Transaksi dinyatakan gagal oleh provider.${parentLabel}`,
            parentStatus: data.paymentRequestStatus || null,
          },
        }));
        setTransactions((prev) => prev.filter((item) => item.transaction_code !== tx.transaction_code));
        return "failed";
      }

      const parentLabel = data.paymentRequestStatus
        ? ` Status monitoring: ${getParentStatusLabel(data.paymentRequestStatus)}.`
        : "";
      setResults((prev) => ({
        ...prev,
        [tx.transaction_code]: {
          status: "pending",
          message: `Provider masih mengembalikan status pending.${parentLabel}`,
          parentStatus: data.paymentRequestStatus || null,
        },
      }));
      setTransactions((prev) =>
        prev.map((item) =>
          item.transaction_code === tx.transaction_code
            ? {
                ...item,
                advice_attempts: item.advice_attempts + 1,
                updated_at: new Date().toISOString(),
                advice_locked: item.advice_attempts + 1 >= maxAdviceAttempts,
              }
            : item
        )
      );
      return "pending";
    } catch {
      setResults((prev) => ({
        ...prev,
        [tx.transaction_code]: { status: "error", message: "Gagal menghubungi server" },
      }));
      return "error";
    } finally {
      setProcessingIds((prev) => prev.filter((code) => code !== tx.transaction_code));
    }
  }, [maxAdviceAttempts]);

  async function handleAdviceAll() {
    const queue = actionableTransactions.slice();
    if (queue.length === 0) {
      setConfirmAdviceAllOpen(false);
      return;
    }

    setConfirmAdviceAllOpen(false);
    setAdvisingAll(true);
    setBatchProgress({
      total: queue.length,
      processed: 0,
      success: 0,
      failed: 0,
      pending: 0,
      error: 0,
    });

    for (const tx of queue) {
      const outcome = await runSingleAdvice(tx);
      setBatchProgress((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          processed: prev.processed + 1,
          success: prev.success + (outcome === "success" ? 1 : 0),
          failed: prev.failed + (outcome === "failed" ? 1 : 0),
          pending: prev.pending + (outcome === "pending" ? 1 : 0),
          error: prev.error + (outcome === "error" ? 1 : 0),
        };
      });
    }

    setAdvisingAll(false);
    await fetchPending("refresh");
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-amber-50/60 to-orange-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                <span className="material-symbols-outlined text-sm">pending_actions</span>
                Advice Lunasin
              </div>
              <h1 className="mt-4 text-base font-semibold text-slate-500 dark:text-slate-400">
                Pantau dan proses transaksi Lunasin yang masih menunggu konfirmasi
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
                Halaman ini membantu kasir atau supervisor memantau transaksi pending, memprioritaskan yang perlu
                follow-up, dan menjalankan advice manual dengan konteks nominal, loket, serta riwayat percobaan.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-800 px-3 py-1 border border-slate-200 dark:border-slate-700">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  Terakhir diperbarui: {lastUpdated ? formatTanggal(lastUpdated) : "-"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-800 px-3 py-1 border border-slate-200 dark:border-slate-700">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  {formatNumber(filteredTransactions.length)} dari {formatNumber(transactions.length)} transaksi ditampilkan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-800 px-3 py-1 border border-slate-200 dark:border-slate-700">
                  <span className="material-symbols-outlined text-sm">rule</span>
                  Limit advice: {formatNumber(maxAdviceAttempts)}x
                </span>
                {filteredTransactions.length !== actionableTransactions.length && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-900/20 px-3 py-1 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                    <span className="material-symbols-outlined text-sm">lock</span>
                    {formatNumber(filteredTransactions.length - actionableTransactions.length)} transaksi terkunci
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                icon={refreshing ? "progress_activity" : "refresh"}
                onClick={() => void fetchPending("refresh")}
                disabled={loading || refreshing || advisingAll}
                className="!rounded-xl !px-4 !py-2 disabled:opacity-60"
              >
                {refreshing ? "Memuat ulang..." : "Refresh"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={advisingAll ? "hourglass_top" : "send"}
                onClick={() => setConfirmAdviceAllOpen(true)}
                disabled={actionableTransactions.length === 0 || advisingAll || processingIds.length > 0}
                className="!rounded-xl !px-4 !py-2 disabled:opacity-60"
              >
                {advisingAll ? "Memproses batch..." : `Advice Semua (${formatNumber(actionableTransactions.length)})`}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="border-amber-200/70 dark:border-amber-900/50">
            <CardBody className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Pending</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{formatNumber(summary.totalPending)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Transaksi menunggu advice</p>
                </div>
                <span className="material-symbols-outlined text-3xl text-amber-500">pending_actions</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Nominal</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{formatRupiah(summary.totalNominal)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Akumulasi transaksi pending</p>
                </div>
                <span className="material-symbols-outlined text-3xl text-emerald-500">payments</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sudah Pernah Advice</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{formatNumber(summary.retriedCount)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Perlu perhatian lanjutan</p>
                </div>
                <span className="material-symbols-outlined text-3xl text-sky-500">history</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Perlu Eskalasi</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{formatNumber(summary.escalatedCount)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Advice 2x atau lebih</p>
                </div>
                <span className="material-symbols-outlined text-3xl text-rose-500">priority_high</span>
              </div>
            </CardBody>
          </Card>
        </section>

        <Card>
          <CardBody className="p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, ID pelanggan, kode produk, ID transaksi, atau transaction code"
                icon="search"
                className="flex-1"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:w-[520px]">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Filter Advice
                  </label>
                  <select
                    value={attemptFilter}
                    onChange={(e) => setAttemptFilter(e.target.value as AttemptFilter)}
                    className="w-full h-[54px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <option value="all">Semua</option>
                    <option value="fresh">Belum pernah advice</option>
                    <option value="retried">Sudah pernah advice</option>
                    <option value="escalated">Advice ≥ 2x</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Produk
                  </label>
                  <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    className="w-full h-[54px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <option value="all">Semua Produk</option>
                    {productOptions.map((product) => (
                      <option key={product} value={product}>
                        {product}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Urutkan
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full h-[54px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <option value="oldest">Paling lama pending</option>
                    <option value="latest">Terbaru</option>
                    <option value="highest">Nominal terbesar</option>
                    <option value="attempts">Advice terbanyak</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge variant="warning" className="rounded-full px-3 py-1 normal-case text-xs">
                {formatNumber(filteredTransactions.length)} transaksi aktif di daftar
              </Badge>
              {search && (
                <Badge variant="default" className="rounded-full px-3 py-1 normal-case text-xs">
                  Pencarian: {search}
                </Badge>
              )}
              {attemptFilter !== "all" && (
                <Badge variant="primary" className="rounded-full px-3 py-1 normal-case text-xs">
                  Filter: {attemptFilter === "fresh" ? "Belum advice" : attemptFilter === "retried" ? "Sudah advice" : "Eskalasi"}
                </Badge>
              )}
              {productFilter !== "all" && (
                <Badge variant="default" className="rounded-full px-3 py-1 normal-case text-xs">
                  Produk: {productFilter}
                </Badge>
              )}
            </div>
          </CardBody>
        </Card>

        {batchProgress && (
          <Card className="border-primary/20 dark:border-primary/30">
            <CardBody className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Progress Advice Batch</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {formatNumber(batchProgress.processed)} dari {formatNumber(batchProgress.total)} transaksi sudah diproses.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="success" className="rounded-full px-3 py-1 normal-case">Sukses {formatNumber(batchProgress.success)}</Badge>
                  <Badge variant="danger" className="rounded-full px-3 py-1 normal-case">Gagal {formatNumber(batchProgress.failed)}</Badge>
                  <Badge variant="warning" className="rounded-full px-3 py-1 normal-case">Pending {formatNumber(batchProgress.pending)}</Badge>
                  <Badge variant="default" className="rounded-full px-3 py-1 normal-case">Error {formatNumber(batchProgress.error)}</Badge>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${batchProgress.total === 0 ? 0 : (batchProgress.processed / batchProgress.total) * 100}%` }}
                />
              </div>
            </CardBody>
          </Card>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
            <span className="material-symbols-outlined text-lg">error</span>
            <div>
              <p className="font-semibold">Gagal memuat data advice</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Memuat transaksi pending...</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Mohon tunggu, sistem sedang mengambil antrian advice terbaru.</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-emerald-400 mb-3">check_circle</span>
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-lg">Tidak ada transaksi pending</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Semua transaksi Lunasin sudah selesai diproses atau tidak memerlukan advice manual.
            </p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-400 mb-3">filter_alt_off</span>
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-lg">Tidak ada hasil yang cocok</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Ubah kata kunci, filter, atau urutan agar daftar transaksi lebih sesuai.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTransactions.map((tx) => {
              const result = results[tx.transaction_code];
              const resultAppearance = result ? getResultAppearance(result.status) : null;
              const adviceLocked = isAdviceLockedForUser(tx, maxAdviceAttempts);
              const adviceLevel =
                adviceLocked
                  ? { label: `Batas ${formatNumber(maxAdviceAttempts)}x Tercapai`, variant: "danger" as const }
                  : tx.advice_attempts >= 2
                  ? { label: "Perlu Eskalasi", variant: "danger" as const }
                  : tx.advice_attempts >= 1
                    ? { label: `Sudah ${formatNumber(tx.advice_attempts)}x Advice`, variant: "warning" as const }
                    : { label: "Pending Baru", variant: "primary" as const };

              return (
                <Card key={tx.transaction_code} className="border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                  <CardBody className="p-5 sm:p-6">
                    <div className="flex flex-col xl:flex-row gap-5 xl:items-start xl:justify-between">
                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={adviceLevel.variant} className="rounded-full px-3 py-1 normal-case text-[11px]">
                            {adviceLevel.label}
                          </Badge>
                          <Badge variant="default" className="rounded-full px-3 py-1 normal-case text-[11px]">
                            {tx.kode_produk}
                          </Badge>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                            {tx.transaction_code}
                          </span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{tx.nama}</h2>
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                              {tx.cust_id}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            ID Trx Provider: <span className="font-semibold text-slate-700 dark:text-slate-200">{tx.id_trx || "-"}</span>
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Waktu Transaksi</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{formatTanggal(tx.transaction_date)}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Loket</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{tx.loket_name || tx.loket_code}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{tx.loket_code}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kasir</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{tx.username || "-"}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Update {formatTanggal(tx.updated_at || tx.created_at)}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Percobaan Advice</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{formatNumber(tx.advice_attempts)}x</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {tx.advice_attempts === 0 ? "Belum pernah dicoba" : "Sudah pernah ditindaklanjuti"}
                            </p>
                          </div>
                        </div>

                        {tx.provider_error_message && (
                          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pesan terakhir dari provider</p>
                            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{tx.provider_error_message}</p>
                            {tx.provider_error_code && (
                              <p className="mt-1 text-xs font-mono text-amber-700/80 dark:text-amber-300/90">Code: {tx.provider_error_code}</p>
                            )}
                          </div>
                        )}

                        {adviceLocked && (
                          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                              Batas advice tercapai
                            </p>
                            <p className="mt-1 text-sm text-red-800 dark:text-red-200">
                              Transaksi ini sudah mencapai limit advice {formatNumber(maxAdviceAttempts)}x dan tidak akan ditampilkan lagi
                              setelah melewati batas tersebut.
                            </p>
                          </div>
                        )}

                        {result && resultAppearance && (
                          <div className={`rounded-2xl px-4 py-3 text-sm flex items-start gap-3 ${resultAppearance.className}`}>
                            <span className="material-symbols-outlined text-lg mt-0.5">{resultAppearance.icon}</span>
                            <div>
                              <p className="font-semibold">Hasil advice terbaru</p>
                              <p className="mt-0.5">{result.message}</p>
                              {result.parentStatus && (
                                <p className="mt-1 text-xs opacity-80">Status monitoring: {getParentStatusLabel(result.parentStatus)}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <aside className="xl:w-[290px] shrink-0 rounded-3xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Pembayaran</p>
                          <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{formatRupiah(tx.rp_total)}</p>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Tagihan</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{formatRupiah(tx.rp_amount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Admin</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{formatRupiah(tx.rp_admin)}</span>
                          </div>
                          <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
                            <span className="font-bold text-slate-700 dark:text-slate-200">Grand Total</span>
                            <span className="font-black text-slate-900 dark:text-white">{formatRupiah(tx.rp_total)}</span>
                          </div>
                        </div>

                        <Button
                          onClick={() => void runSingleAdvice(tx)}
                          disabled={isProcessing(tx.transaction_code) || advisingAll || adviceLocked}
                          variant="primary"
                          size="sm"
                          icon={adviceLocked ? "lock" : isProcessing(tx.transaction_code) ? "progress_activity" : "send"}
                          className="w-full !rounded-2xl !py-3 text-sm disabled:opacity-60"
                        >
                          {adviceLocked
                            ? "Batas Advice Tercapai"
                            : isProcessing(tx.transaction_code)
                              ? "Memproses Advice..."
                              : "Jalankan Advice"}
                        </Button>

                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {adviceLocked
                            ? "Transaksi ini tidak bisa di-advice lagi dari menu ini karena sudah melewati batas percobaan."
                            : "Gunakan tombol ini untuk memeriksa ulang status transaksi ke provider Lunasin secara manual."}
                        </p>
                      </aside>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={confirmAdviceAllOpen} onClose={() => setConfirmAdviceAllOpen(false)} title="Konfirmasi Advice Semua">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Anda akan menjalankan advice untuk <strong>{formatNumber(actionableTransactions.length)}</strong> transaksi yang masih bisa diproses dari daftar saat ini.
            Gunakan aksi ini bila Anda ingin memproses seluruh antrian sekaligus.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Transaksi diproses</p>
              <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{formatNumber(actionableTransactions.length)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total nominal</p>
              <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{formatRupiah(actionableTransactions.reduce((sum, tx) => sum + normalizeNumber(tx.rp_total), 0))}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Pastikan filter dan pencarian sudah sesuai. Tombol ini hanya akan memproses transaksi yang belum melewati limit advice,
            bukan item yang sudah terkunci.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmAdviceAllOpen(false)} className="!rounded-xl !px-4 !py-2">
              Batal
            </Button>
            <Button variant="primary" size="sm" icon="send" onClick={() => void handleAdviceAll()} className="!rounded-xl !px-4 !py-2">
              Ya, Proses Semua
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
