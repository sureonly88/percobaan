"use client";

import React, { useCallback, useEffect, useState } from "react";

interface MarginRow {
  provider: string;
  serviceType: string | null;
  loketCode: string | null;
  transactionCount: number;
  totalAmount: number;
  totalAdminFee: number;
  totalGross: number;
  marginPct: number;
}

type GroupBy = "PROVIDER" | "SERVICE" | "PRODUCT" | "LOKET";

function fmtRp(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

export default function MarginPage() {
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [totals, setTotals] = useState({ transactionCount: 0, totalAmount: 0, totalAdminFee: 0, totalGross: 0 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loketCode, setLoketCode] = useState("");
  const [provider, setProvider] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("PROVIDER");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const d = new Date();
    setTo(d.toISOString().slice(0, 10));
    setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ groupBy });
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (loketCode) sp.set("loketCode", loketCode);
      if (provider) sp.set("provider", provider);
      const res = await fetch(`/api/keuangan/margin?${sp.toString()}`);
      const j = await res.json();
      setRows(j.rows ?? []);
      setTotals(j.totals ?? { transactionCount: 0, totalAmount: 0, totalAdminFee: 0, totalGross: 0 });
    } finally {
      setLoading(false);
    }
  }, [from, to, loketCode, provider, groupBy]);

  useEffect(() => { if (from && to) load(); }, [load, from, to]);

  const groupColLabel = groupBy === "PROVIDER" ? "Provider" : groupBy === "SERVICE" ? "Provider / Service" : groupBy === "PRODUCT" ? "Provider / Produk" : "Provider / Loket";

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Margin & Profit Real-time</h1>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1"><span className="text-xs text-slate-500 uppercase tracking-wider">Dari</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-slate-500 uppercase tracking-wider">Sampai</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-slate-500 uppercase tracking-wider">Loket</span>
          <input value={loketCode} onChange={(e) => setLoketCode(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="LKT-…" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-slate-500 uppercase tracking-wider">Provider</span>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="PDAM, PLN, …" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-slate-500 uppercase tracking-wider">Group By</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary">
            <option value="PROVIDER">Provider</option>
            <option value="SERVICE">Service Type</option>
            <option value="PRODUCT">Produk</option>
            <option value="LOKET">Loket</option>
          </select>
        </label>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90">Tampilkan</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Kpi label="Total Trx" value={totals.transactionCount.toLocaleString("id-ID")} />
        <Kpi label="Omzet (Gross)" value={fmtRp(totals.totalGross)} />
        <Kpi label="Nilai Tagihan" value={fmtRp(totals.totalAmount)} />
        <Kpi label="Pendapatan Admin" value={fmtRp(totals.totalAdminFee)} highlight />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">{groupColLabel}</th>
              <th className="px-3 py-2 text-right">Trx</th>
              <th className="px-3 py-2 text-right">Nilai Tagihan</th>
              <th className="px-3 py-2 text-right">Total Bayar</th>
              <th className="px-3 py-2 text-right">Pendapatan Admin</th>
              <th className="px-3 py-2 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Belum ada transaksi pada periode ini</td></tr>
            ) : rows.map((r, i) => (
              <tr key={`${r.provider}-${r.serviceType ?? ""}-${r.loketCode ?? ""}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.provider}</div>
                  {r.serviceType && <div className="text-xs text-slate-500">{r.serviceType}</div>}
                  {r.loketCode && <div className="text-xs text-slate-500">{r.loketCode}</div>}
                </td>
                <td className="px-3 py-2 text-right">{r.transactionCount.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-right">{fmtRp(r.totalAmount)}</td>
                <td className="px-3 py-2 text-right">{fmtRp(r.totalGross)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtRp(r.totalAdminFee)}</td>
                <td className="px-3 py-2 text-right text-emerald-600">{r.marginPct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .input { padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid rgb(226 232 240); background: white; font-size: 0.875rem; }
        :global(.dark) .input { background: rgb(15 23 42); border-color: rgb(51 65 85); color: white; }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
