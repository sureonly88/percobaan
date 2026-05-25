"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface JournalEntry {
  id: number;
  entryNo: string;
  entryDate: string;
  sourceType: string;
  totalDebit: number;
  totalCredit: number;
}

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

interface SettlementBatch {
  id: number;
  batchCode: string;
  batchDate: string;
  loketCode: string;
  loketName: string | null;
  status: "DRAFT" | "APPROVED" | "PAID" | "VOID";
  netPayable: number;
}

function fmtRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export default function KeuanganOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState("");
  const [monthStart, setMonthStart] = useState("");
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [marginRows, setMarginRows] = useState<MarginRow[]>([]);
  const [marginTotals, setMarginTotals] = useState({ totalAmount: 0, totalAdminFee: 0, totalGross: 0, transactionCount: 0 });
  const [pendingBatches, setPendingBatches] = useState<SettlementBatch[]>([]);

  useEffect(() => {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10);
    const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    setToday(ymd);
    setMonthStart(first);
  }, []);

  useEffect(() => {
    if (!today || !monthStart) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jurnalRes, marginRes, batchRes] = await Promise.all([
          fetch(`/api/keuangan/jurnal?limit=10&from=${monthStart}&to=${today}`),
          fetch(`/api/keuangan/margin?from=${monthStart}&to=${today}&groupBy=PROVIDER`),
          fetch(`/api/settlement/batches?status=DRAFT&limit=10`),
        ]);
        if (cancelled) return;
        if (jurnalRes.ok) {
          const j = await jurnalRes.json();
          setRecentEntries(j.items ?? []);
        }
        if (marginRes.ok) {
          const m = await marginRes.json();
          setMarginRows(m.rows ?? []);
          setMarginTotals(m.totals ?? { totalAmount: 0, totalAdminFee: 0, totalGross: 0, transactionCount: 0 });
        }
        if (batchRes.ok) {
          const b = await batchRes.json();
          setPendingBatches(b.items ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, monthStart]);

  const grossMarginPct = useMemo(() => {
    if (marginTotals.totalGross <= 0) return 0;
    return (marginTotals.totalAdminFee / marginTotals.totalGross) * 100;
  }, [marginTotals]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Keuangan & Akuntansi</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ringkasan periode {monthStart} s/d {today}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/keuangan/jurnal" className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Jurnal</Link>
          <Link href="/keuangan/buku-besar" className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Buku Besar</Link>
          <Link href="/keuangan/neraca-saldo" className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Neraca Saldo</Link>
          <Link href="/keuangan/margin" className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Margin</Link>
          <Link href="/settlement" className="px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90">Settlement</Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Transaksi (periode)" value={marginTotals.transactionCount.toLocaleString("id-ID")} sub="success" />
        <KpiCard label="Omzet Kotor" value={fmtRp(marginTotals.totalGross)} />
        <KpiCard label="Pendapatan Admin" value={fmtRp(marginTotals.totalAdminFee)} sub={`Margin ${fmtPct(grossMarginPct)}`} highlight />
        <KpiCard label="Batch Settlement Draft" value={pendingBatches.length.toString()} sub="butuh approval" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Margin per provider */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Margin per Provider</h2>
            <Link href="/keuangan/margin" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </div>
          {loading ? <div className="text-sm text-slate-500">Memuat…</div> : marginRows.length === 0 ? (
            <div className="text-sm text-slate-500">Belum ada transaksi pada periode ini.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Provider</th><th className="py-2 text-right">Trx</th><th className="py-2 text-right">Admin</th><th className="py-2 text-right">Margin</th></tr>
              </thead>
              <tbody>
                {marginRows.slice(0, 8).map((r) => (
                  <tr key={`${r.provider}-${r.serviceType ?? ""}-${r.loketCode ?? ""}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">{r.provider}</td>
                    <td className="py-2 text-right">{r.transactionCount.toLocaleString("id-ID")}</td>
                    <td className="py-2 text-right">{fmtRp(r.totalAdminFee)}</td>
                    <td className="py-2 text-right text-emerald-600">{fmtPct(r.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent journal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Jurnal Terbaru</h2>
            <Link href="/keuangan/jurnal" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </div>
          {loading ? <div className="text-sm text-slate-500">Memuat…</div> : recentEntries.length === 0 ? (
            <div className="text-sm text-slate-500">Belum ada jurnal pada periode ini.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">No Jurnal</th><th className="py-2">Sumber</th><th className="py-2 text-right">Debit</th></tr>
              </thead>
              <tbody>
                {recentEntries.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-mono text-xs">{e.entryNo}</td>
                    <td className="py-2">{e.sourceType}</td>
                    <td className="py-2 text-right">{fmtRp(e.totalDebit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pending settlement */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Settlement Pending Approval</h2>
          <Link href="/settlement" className="text-xs text-primary hover:underline">Buka modul settlement →</Link>
        </div>
        {loading ? <div className="text-sm text-slate-500">Memuat…</div> : pendingBatches.length === 0 ? (
          <div className="text-sm text-slate-500">Tidak ada batch DRAFT.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Batch</th>
                <th className="py-2">Tanggal</th>
                <th className="py-2">Loket</th>
                <th className="py-2 text-right">Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {pendingBatches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 font-mono text-xs">
                    <Link href={`/settlement/${b.id}`} className="text-primary hover:underline">{b.batchCode}</Link>
                  </td>
                  <td className="py-2">{b.batchDate}</td>
                  <td className="py-2">{b.loketName || b.loketCode}</td>
                  <td className="py-2 text-right">{fmtRp(b.netPayable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
