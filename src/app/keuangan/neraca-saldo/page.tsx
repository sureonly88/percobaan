"use client";

import React, { useCallback, useEffect, useState } from "react";

interface TrialRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: "DEBIT" | "CREDIT";
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

function fmtRp(n: number): string {
  const v = Math.round(n);
  if (v === 0) return "-";
  return Math.abs(v).toLocaleString("id-ID");
}

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Aset",
  LIABILITY: "Kewajiban",
  EQUITY: "Ekuitas",
  INCOME: "Pendapatan",
  EXPENSE: "Beban",
};

export default function NeracaSaldoPage() {
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [balanced, setBalanced] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      const res = await fetch(`/api/keuangan/neraca-saldo?${sp.toString()}`);
      const j = await res.json();
      setRows(j.rows ?? []);
      setTotalDebit(j.totalDebit ?? 0);
      setTotalCredit(j.totalCredit ?? 0);
      setBalanced(!!j.balanced);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Group by account type
  const grouped = rows.reduce<Record<string, TrialRow[]>>((acc, r) => {
    (acc[r.accountType] = acc[r.accountType] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Neraca Saldo</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${balanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {balanced ? "BALANCED ✓" : "TIDAK SEIMBANG"}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Dari</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Sampai</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </label>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90">Tampilkan</button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Kode</th>
              <th className="px-3 py-2">Nama Akun</th>
              <th className="px-3 py-2">Normal</th>
              <th className="px-3 py-2 text-right">Total Debit</th>
              <th className="px-3 py-2 text-right">Total Kredit</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : Object.keys(grouped).length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Tidak ada data</td></tr>
            ) : Object.entries(grouped).map(([type, list]) => (
              <React.Fragment key={type}>
                <tr className="bg-slate-100 dark:bg-slate-800 font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">{TYPE_LABEL[type] || type}</td>
                </tr>
                {list.map((r) => (
                  <tr key={r.accountCode} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{r.accountCode}</td>
                    <td className="px-3 py-2">{r.accountName}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.normalBalance}</td>
                    <td className="px-3 py-2 text-right">{fmtRp(r.totalDebit)}</td>
                    <td className="px-3 py-2 text-right">{fmtRp(r.totalCredit)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtRp(r.balance)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr className="bg-primary/5 font-bold border-t-2 border-primary/30">
              <td className="px-3 py-3" colSpan={3}>TOTAL</td>
              <td className="px-3 py-3 text-right">{fmtRp(totalDebit)}</td>
              <td className="px-3 py-3 text-right">{fmtRp(totalCredit)}</td>
              <td className="px-3 py-3 text-right">{balanced ? "✓" : "✗"}</td>
            </tr>
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
