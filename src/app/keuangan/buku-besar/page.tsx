"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Account {
  code: string;
  name: string;
  normalBalance: "DEBIT" | "CREDIT";
}

interface LedgerRow {
  entryId: number;
  entryNo: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  debit: number;
  credit: number;
  balance: number;
}

function fmtRp(n: number): string {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("id-ID");
  return v < 0 ? `(${s})` : s;
}

export default function BukuBesarPage() {
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string; accountType: string; normalBalance: "DEBIT" | "CREDIT" }>>([]);
  const [accountCode, setAccountCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loketCode, setLoketCode] = useState("");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/keuangan/akun?activeOnly=1").then((r) => r.json()).then((j) => {
      setAccounts(j.items ?? []);
      if (j.items?.length && !accountCode) setAccountCode(j.items[0].code);
    });
  }, [accountCode]);

  const load = useCallback(async () => {
    if (!accountCode) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ accountCode });
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (loketCode) sp.set("loketCode", loketCode);
      const res = await fetch(`/api/keuangan/buku-besar?${sp.toString()}`);
      const j = await res.json();
      setRows(j.rows ?? []);
      setAccount(j.account ?? null);
    } finally {
      setLoading(false);
    }
  }, [accountCode, from, to, loketCode]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Buku Besar</h1>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 min-w-[280px]">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Akun</span>
          <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary">
            {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Dari</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Sampai</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Loket</span>
          <input value={loketCode} onChange={(e) => setLoketCode(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="LKT-…" />
        </label>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90">Tampilkan</button>
      </div>

      {account && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label="Total Debit" value={fmtRp(rows.reduce((s, r) => s + r.debit, 0))} />
          <KpiCard label="Total Kredit" value={fmtRp(rows.reduce((s, r) => s + r.credit, 0))} />
          <KpiCard label={`Saldo Akhir (${account.normalBalance})`} value={fmtRp(rows.length > 0 ? rows[rows.length - 1].balance : 0)} highlight />
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">No Jurnal</th>
              <th className="px-3 py-2">Deskripsi</th>
              <th className="px-3 py-2">Sumber</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Kredit</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">Tidak ada transaksi</td></tr>
            ) : (
              <>
                {rows.map((e) => (
                  <tr key={e.entryId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{e.entryDate}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.entryNo}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{e.description}</td>
                    <td className="px-3 py-2 text-xs">{e.sourceType}</td>
                    <td className="px-3 py-2 text-right">{e.debit > 0 ? fmtRp(e.debit) : ""}</td>
                    <td className="px-3 py-2 text-right">{e.credit > 0 ? fmtRp(e.credit) : ""}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtRp(e.balance)}</td>
                  </tr>
                ))}
              </>
            )}
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

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
