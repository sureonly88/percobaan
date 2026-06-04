"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";

function formatRp(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

const STATUS_OPTIONS = [
  "ALL",
  "UNPAID",
  "PAYMENT_PENDING",
  "PAID_GATEWAY",
  "PROCESSING_PROVIDER",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "PENDING_REVIEW",
  "FAILED_PROVIDER",
  "EXPIRED",
  "CANCELLED",
];

interface InvoiceRow {
  invoiceCode: string;
  publicToken: string;
  status: string;
  customerName: string | null;
  customerPhone?: string | null;
  totalAmount?: number;
  totalAdmin?: number;
  grandTotal: number;
  snapUrl: string | null;
  receiptToken: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface InvoiceItem {
  id: number;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
}

interface InvoiceEvent {
  id: number;
  eventType: string;
  actorType: string;
  actorUsername: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  createdAt: string;
}

interface InvoiceDetail {
  invoice: InvoiceRow & {
    loketCode: string | null;
    loketName: string | null;
    createdBy: string | null;
    paidGatewayAt: string | null;
    providerProcessedAt: string | null;
    multiPaymentCode: string | null;
    paymentMethod: string | null;
    gatewayStatus: string | null;
    totalAmount: number;
    totalAdmin: number;
  };
  items: InvoiceItem[];
  events: InvoiceEvent[];
}

export default function PaymentLinksPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role || "";
  const canManageDisputes = userRole === "admin" || userRole === "supervisor";
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [paymentLinksEnabled, setPaymentLinksEnabled] = useState(true);
  const [publicSelfServiceEnabled, setPublicSelfServiceEnabled] = useState(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "50", status });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [search, status]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payment-links?${queryString}`, { cache: "no-store" });
      const data = await res.json();
      if (res.status === 503) setPaymentLinksEnabled(false);
      else if (res.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const loadDetail = useCallback(async (invoiceCode: string) => {
    setSelectedCode(invoiceCode);
    setDetail(null);
    setActionError("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/payment-links/${invoiceCode}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setActionError(data.error || "Gagal memuat detail invoice");
      else setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/public/features", { cache: "no-store" })
      .then((res) => res.json())
      .then((flags) => {
        setPaymentLinksEnabled(flags.paymentLinksEnabled !== false);
        setPublicSelfServiceEnabled(flags.publicSelfServiceEnabled !== false);
        if (flags.paymentLinksEnabled === false) setLoading(false);
        else void fetchData();
      })
      .catch(() => void fetchData());
  }, [fetchData]);

  async function cancelInvoice() {
    if (!detail || cancelLoading) return;
    setCancelLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/payment-links/${detail.invoice.invoiceCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: "Dibatalkan dari dashboard payment link" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Gagal membatalkan invoice");
        return;
      }
      await fetchData();
      await loadDetail(detail.invoice.invoiceCode);
    } finally {
      setCancelLoading(false);
    }
  }

  function publicUrl(row: InvoiceRow) {
    return `${origin}/i/${row.publicToken}`;
  }

  function receiptUrl(row: InvoiceRow) {
    return row.receiptToken ? `${origin}/r/${row.receiptToken}` : "";
  }

  if (!paymentLinksEnabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-950/30">
        <span className="material-symbols-outlined text-5xl text-amber-600">link_off</span>
        <h1 className="mt-3 text-2xl font-black text-amber-800 dark:text-amber-200">Payment Link Nonaktif</h1>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Fitur Payment Link sedang dimatikan dari pengaturan aplikasi.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Payment Link" }]} />
        <div className="mt-2 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Payment Link</h1>
            <p className="text-slate-500 mt-1">Buat invoice online, monitor status gateway/provider, dan validasi struk digital.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicSelfServiceEnabled && (
              <Link href="/cek-tagihan" target="_blank" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                Self-Service Publik
              </Link>
            )}
            {canManageDisputes && (
              <Link href="/payment-links/disputes" className="px-4 py-2 rounded-lg border border-orange-200 text-orange-700 text-sm font-bold hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900/20">
                Refund & Dispute
              </Link>
            )}
            <button onClick={fetchData} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-primary">add_link</span>Buat Link</h2>
          </div>
          <div className="p-5 space-y-4 text-sm text-slate-600 dark:text-slate-400">
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
              <span className="material-symbols-outlined text-primary text-3xl">search</span>
              <h3 className="font-black text-slate-900 dark:text-white mt-2">Dari hasil inquiry kasir</h3>
              <p className="mt-1 leading-relaxed">Cek tagihan di halaman pembayaran, lalu klik tombol <b>Buat Payment Link dari Hasil Inquiry</b>.</p>
            </div>
            <Link href="/pembayaran" className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-primary text-white font-bold">
              <span className="material-symbols-outlined">receipt_long</span>
              Cek Tagihan Kasir
            </Link>
            {publicSelfServiceEnabled && (
              <Link href="/cek-tagihan" target="_blank" className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-emerald-200 text-emerald-700 font-bold hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                <span className="material-symbols-outlined">public</span>
                Link Self-Service
              </Link>
            )}
          </div>
        </div>

        <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-primary">receipt_long</span>Daftar Invoice</h2>
              <span className="text-xs font-bold text-slate-400">{items.length} data</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari invoice, pelanggan, HP, loket"
                className="md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
              />
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm font-bold">
                {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option === "ALL" ? "Semua Status" : option}</option>)}
              </select>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-400">Memuat invoice...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Belum ada payment link.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-3">Invoice</th>
                    <th className="text-left px-5 py-3">Pelanggan</th>
                    <th className="text-right px-5 py-3">Total</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((row) => (
                    <tr key={row.invoiceCode} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-4 font-bold">{row.invoiceCode}<div className="text-[10px] text-slate-400 font-normal">{formatDate(row.createdAt)}</div></td>
                      <td className="px-5 py-4">{row.customerName || "-"}</td>
                      <td className="px-5 py-4 text-right font-black">{formatRp(row.grandTotal)}</td>
                      <td className="px-5 py-4"><span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold">{row.status}</span></td>
                      <td className="px-5 py-4 space-x-3 whitespace-nowrap">
                        <button onClick={() => loadDetail(row.invoiceCode)} className="text-slate-700 dark:text-slate-200 font-bold hover:underline">Detail</button>
                        <a href={publicUrl(row)} target="_blank" rel="noreferrer" className="text-primary font-bold hover:underline">Invoice</a>
                        {receiptUrl(row) && <a href={receiptUrl(row)} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold hover:underline">Struk</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={Boolean(selectedCode)} onClose={() => { setSelectedCode(null); setDetail(null); setActionError(""); }} title="Detail Payment Link">
        {detailLoading ? (
          <div className="p-8 text-center text-slate-400">Memuat detail...</div>
        ) : !detail ? (
          <div className="p-4 text-sm text-red-600">{actionError || "Detail tidak tersedia"}</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400 font-black">{detail.invoice.invoiceCode}</p>
                  <h3 className="text-xl font-black mt-1">{detail.invoice.customerName || "Pelanggan"}</h3>
                  <p className="text-sm text-slate-500">{detail.invoice.loketName || detail.invoice.loketCode || "-"} · {detail.invoice.createdBy || "-"}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-black self-start">{detail.invoice.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-400">Tagihan</p><p className="font-black">{formatRp(detail.invoice.totalAmount)}</p></div>
                <div><p className="text-slate-400">Admin</p><p className="font-black">{formatRp(detail.invoice.totalAdmin)}</p></div>
                <div><p className="text-slate-400">Total</p><p className="font-black text-primary">{formatRp(detail.invoice.grandTotal)}</p></div>
                <div><p className="text-slate-400">Metode</p><p className="font-black">{detail.invoice.paymentMethod || detail.invoice.gatewayStatus || "-"}</p></div>
                <div><p className="text-slate-400">Gateway Paid</p><p className="font-black">{formatDate(detail.invoice.paidGatewayAt)}</p></div>
                <div><p className="text-slate-400">Provider Done</p><p className="font-black">{formatDate(detail.invoice.providerProcessedAt)}</p></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 font-black text-sm">Item Tagihan</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-52 overflow-y-auto">
                {detail.items.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex justify-between gap-4 text-sm">
                    <div>
                      <p className="font-black">{item.customerName || item.customerId}</p>
                      <p className="text-xs text-slate-500">{item.provider} · {item.serviceType} · {item.periodLabel || item.productCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{formatRp(item.total)}</p>
                      <p className="text-xs text-slate-400">{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 font-black text-sm">Timeline</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {detail.events.map((event) => (
                  <div key={event.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <p className="font-black">{event.eventType}</p>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{formatDate(event.createdAt)}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{event.actorType}{event.actorUsername ? ` · ${event.actorUsername}` : ""}{event.afterStatus ? ` · ${event.beforeStatus || "-"} → ${event.afterStatus}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>

            {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

            <div className="flex flex-wrap justify-end gap-3">
              <a href={publicUrl(detail.invoice)} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">Buka Invoice</a>
              {receiptUrl(detail.invoice) && <a href={receiptUrl(detail.invoice)} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 text-sm font-bold">Buka Struk</a>}
              {detail.invoice.multiPaymentCode && <Link href={`/riwayat?search=${encodeURIComponent(detail.invoice.multiPaymentCode)}`} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">Riwayat</Link>}
              {[
                "UNPAID",
                "PAYMENT_PENDING",
              ].includes(detail.invoice.status) && (
                <button onClick={cancelInvoice} disabled={cancelLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-50">
                  {cancelLoading ? "Membatalkan..." : "Cancel Invoice"}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
