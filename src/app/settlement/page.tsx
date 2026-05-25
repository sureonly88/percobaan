"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Batch {
  id: number;
  batchCode: string;
  batchDate: string;
  loketCode: string;
  loketName: string | null;
  status: "DRAFT" | "APPROVED" | "PAID" | "VOID";
  transactionCount: number;
  totalGross: number;
  totalAdminFee: number;
  netPayable: number;
  approvedBy: string | null;
  paidBy: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  VOID: "bg-slate-200 text-slate-600",
};

function fmtRp(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

export default function SettlementListPage() {
  const [items, setItems] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [loketCode, setLoketCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [genDate, setGenDate] = useState("");
  const [genLoket, setGenLoket] = useState("");
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setGenDate(new Date().toISOString().slice(0, 10));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (loketCode) sp.set("loketCode", loketCode);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      sp.set("limit", "100");
      const res = await fetch(`/api/settlement/batches?${sp.toString()}`);
      const j = await res.json();
      setItems(j.items ?? []);
      setTotal(j.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [status, loketCode, from, to]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setMsg("");
    try {
      const res = await fetch("/api/settlement/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: genDate, loketCode: genLoket || undefined }),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg(`✓ ${j.created} batch dibuat, ${j.skipped} dilewati`);
        load();
      } else {
        setMsg(`✗ ${j.error}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settlement Loket</h1>
        <div className="text-sm text-slate-500">{total.toLocaleString("id-ID")} batch</div>
      </div>

      <div className="bg-primary/5 border border-primary/30 rounded-xl p-4">
        <h2 className="font-semibold text-sm mb-3">Generate Batch Harian</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Tanggal</span>
            <input type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Loket (opsional)</span>
            <input value={genLoket} onChange={(e) => setGenLoket(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="kosong = semua loket" />
          </label>
          <button onClick={generate} disabled={generating || !genDate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
            {generating ? "Memproses…" : "Generate"}
          </button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary">
            <option value="">Semua</option>
            <option value="DRAFT">DRAFT</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PAID">PAID</option>
            <option value="VOID">VOID</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Loket</span>
          <input value={loketCode} onChange={(e) => setLoketCode(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Dari</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Sampai</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm">Filter</button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Loket</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Trx</th>
              <th className="px-3 py-2 text-right">Total Gross</th>
              <th className="px-3 py-2 text-right">Net Payable</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">Belum ada batch</td></tr>
            ) : items.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 font-mono text-xs">{b.batchCode}</td>
                <td className="px-3 py-2">{b.batchDate}</td>
                <td className="px-3 py-2">{b.loketName || b.loketCode}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[b.status]}`}>{b.status}</span>
                </td>
                <td className="px-3 py-2 text-right">{b.transactionCount.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-right">{fmtRp(b.totalGross)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtRp(b.netPayable)}</td>
                <td className="px-3 py-2">
                  <Link href={`/settlement/${b.id}`} className="text-primary text-xs hover:underline">Detail</Link>
                </td>
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
