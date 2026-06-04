"use client";

import React, { useEffect, useState } from "react";

function formatRp(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

export default function DigitalReceiptPage({ params }: { params: { receiptToken: string } }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/receipts/${params.receiptToken}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setData(ok ? j : { error: j.error || "Struk tidak ditemukan" }))
      .finally(() => setLoading(false));
  }, [params.receiptToken]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Memuat struk...</div>;
  if (!data || data.error) return <div className="min-h-screen flex items-center justify-center text-red-600">{data?.error || "Struk tidak ditemukan"}</div>;
  if (data.available === false) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600 px-4 text-center">{data.message}</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-300 font-black">Struk Digital Valid</p>
              <h1 className="text-2xl font-black mt-1">{data.invoiceCode}</h1>
              <p className="text-sm text-slate-500">{data.multiPaymentCode}</p>
            </div>
            <span className="material-symbols-outlined text-5xl text-emerald-600">verified</span>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {data.receiptUrl && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-4 text-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.receiptUrl)}`}
                alt="QR validasi struk digital"
                className="mx-auto h-36 w-36 rounded-lg bg-white p-2"
              />
              <p className="mt-3 text-sm font-black text-emerald-700 dark:text-emerald-300">QR Validasi Struk</p>
              <p className="mt-1 break-all text-xs text-slate-500">{data.receiptUrl}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-slate-400">Pelanggan</p><p className="font-bold">{data.customerName || "-"}</p></div>
            <div><p className="text-slate-400">Loket</p><p className="font-bold">{data.loketName || data.loketCode || "-"}</p></div>
            <div><p className="text-slate-400">Metode</p><p className="font-bold">{data.paymentMethod || "Online"}</p></div>
            <div><p className="text-slate-400">Tanggal</p><p className="font-bold">{data.providerProcessedAt ? new Date(data.providerProcessedAt).toLocaleString("id-ID") : "-"}</p></div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((item: any, idx: number) => (
              <div key={idx} className="p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-black">{item.customerName || item.customerId}</p>
                    <p className="text-xs text-slate-500">{item.provider} · {item.serviceType} · {item.customerId}</p>
                    {item.transactionCode && <p className="text-xs text-slate-400 mt-1">Kode: {item.transactionCode}</p>}
                    {item.refnum && <p className="text-xs text-slate-400 mt-1">Ref: {item.refnum}</p>}
                    {item.tokenPln && <p className="mt-2 font-mono text-lg font-black text-primary">{item.tokenPln}</p>}
                  </div>
                  <p className="font-black whitespace-nowrap">{formatRp(item.total)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 space-y-2">
            <div className="flex justify-between text-sm"><span>Tagihan</span><b>{formatRp(data.totalAmount)}</b></div>
            <div className="flex justify-between text-sm"><span>Admin</span><b>{formatRp(data.totalAdmin)}</b></div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between"><span className="font-black">Total</span><span className="font-black text-primary text-xl">{formatRp(data.grandTotal)}</span></div>
          </div>

          <button onClick={() => window.print()} className="w-full py-3 rounded-xl bg-primary text-white font-black">Cetak / Simpan PDF</button>
          <p className="text-center text-xs text-slate-400">Struk ini valid bila dibuka dari domain resmi aplikasi.</p>
        </div>
      </div>
    </main>
  );
}
