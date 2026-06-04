"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

function formatRp(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

interface PublicInvoiceItem {
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

interface PublicInvoice {
  invoiceCode: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  grandTotal: number;
  totalAmount: number;
  totalAdmin: number;
  expiresAt: string | null;
  snapUrl: string | null;
  receiptUrl: string | null;
  items: PublicInvoiceItem[];
}

export default function PublicInvoicePage({ params }: { params: { token: string } }) {
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/invoices/${params.token}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Invoice tidak ditemukan");
      else setInvoice(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function pay() {
    setPaying(true);
    setError("");
    try {
      const res = await fetch(`/api/public/invoices/${params.token}/pay`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memulai pembayaran");
        return;
      }
      if (data.snapUrl) window.location.href = data.snapUrl;
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Memuat invoice...</div>;
  }

  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center text-red-600">{error || "Invoice tidak ditemukan"}</div>;
  }

  const canPay = ["UNPAID", "PAYMENT_PENDING"].includes(invoice.status);
  const isSuccess = ["SUCCESS", "PARTIAL_SUCCESS", "PENDING_REVIEW"].includes(invoice.status);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div>
              <h1 className="text-xl font-black">Pedami Payment</h1>
              <p className="text-sm text-slate-500">Invoice Online</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Nomor Invoice</p>
              <h2 className="text-2xl font-black mt-1">{invoice.invoiceCode}</h2>
              <p className="text-sm text-slate-500 mt-1">{invoice.customerName || "Pelanggan"}{invoice.customerPhone ? ` · ${invoice.customerPhone}` : ""}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-black">{invoice.status}</span>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="p-4 flex justify-between gap-4">
                <div>
                  <p className="font-bold">{item.customerName || item.customerId}</p>
                  <p className="text-xs text-slate-500">{item.provider} · {item.serviceType} · {item.customerId}</p>
                  {item.periodLabel && <p className="text-xs text-slate-400 mt-1">Periode: {item.periodLabel}</p>}
                </div>
                <p className="font-black whitespace-nowrap">{formatRp(item.total)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 space-y-2">
            <div className="flex justify-between text-sm"><span>Tagihan</span><b>{formatRp(invoice.totalAmount)}</b></div>
            <div className="flex justify-between text-sm"><span>Admin</span><b>{formatRp(invoice.totalAdmin)}</b></div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between"><span className="font-black">Total Bayar</span><span className="font-black text-primary text-xl">{formatRp(invoice.grandTotal)}</span></div>
          </div>

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

          {canPay && (
            <button onClick={pay} disabled={paying} className="w-full py-3 rounded-xl bg-primary text-white font-black disabled:opacity-50">
              {paying ? "Membuka pembayaran..." : "Bayar Sekarang"}
            </button>
          )}
          {isSuccess && invoice.receiptUrl && (
            <Link href={invoice.receiptUrl} className="block text-center w-full py-3 rounded-xl bg-emerald-600 text-white font-black">
              Lihat Struk Digital
            </Link>
          )}
          {invoice.expiresAt && <p className="text-center text-xs text-slate-400">Berlaku sampai {new Date(invoice.expiresAt).toLocaleString("id-ID")}</p>}
        </div>
      </div>
    </main>
  );
}
