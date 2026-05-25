"use client";

import React, { useCallback, useEffect, useState } from "react";

interface JournalEntry {
  id: number;
  entryNo: string;
  entryDate: string;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  loketCode: string | null;
  provider: string | null;
  totalDebit: number;
  totalCredit: number;
  createdBy: string | null;
  reversesEntryId: number | null;
}

interface JournalLine {
  lineNo: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

const SOURCE_TYPES = ["", "PAYMENT", "TOPUP", "SETTLEMENT", "REVERSAL", "MANUAL", "OPENING"];

function fmtRp(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

export default function JurnalPage() {
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<{ entry: JournalEntry; lines: JournalLine[] } | null>(null);
  const perPage = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (sourceType) sp.set("sourceType", sourceType);
      if (search) sp.set("q", search);
      sp.set("limit", String(perPage));
      sp.set("offset", String(page * perPage));
      const res = await fetch(`/api/keuangan/jurnal?${sp.toString()}`);
      const json = await res.json();
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [from, to, sourceType, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: number) => {
    const res = await fetch(`/api/keuangan/jurnal?id=${id}`);
    if (res.ok) {
      const j = await res.json();
      setDetail(j);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jurnal Umum</h1>
        <div className="text-sm text-slate-500">{total.toLocaleString("id-ID")} entri</div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <Field label="Dari">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Sampai">
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Sumber">
          <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(0); }} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary">
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s || "Semua"}</option>)}
          </select>
        </Field>
        <Field label="Cari (no/ref/desc)">
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); load(); } }} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="JE-… / kode trx" />
        </Field>
        <button onClick={() => { setPage(0); load(); }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90">Cari</button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">No Jurnal</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Sumber</th>
              <th className="px-3 py-2">Sumber ID</th>
              <th className="px-3 py-2">Loket</th>
              <th className="px-3 py-2">Deskripsi</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Kredit</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-slate-500">Tidak ada data</td></tr>
            ) : items.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 font-mono text-xs">{e.entryNo}</td>
                <td className="px-3 py-2">{e.entryDate}</td>
                <td className="px-3 py-2">{e.sourceType}{e.reversesEntryId ? <span className="ml-1 text-xs text-amber-600">(reversal)</span> : null}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.sourceId || "-"}</td>
                <td className="px-3 py-2">{e.loketCode || "-"}</td>
                <td className="px-3 py-2 max-w-xs truncate">{e.description}</td>
                <td className="px-3 py-2 text-right">{fmtRp(e.totalDebit)}</td>
                <td className="px-3 py-2 text-right">{fmtRp(e.totalCredit)}</td>
                <td className="px-3 py-2"><button onClick={() => openDetail(e.id)} className="text-primary text-xs hover:underline">Detail</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-sm">
        <div>Halaman {page + 1} / {totalPages}</div>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">‹ Sebelumnya</button>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">Berikutnya ›</button>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold font-mono">{detail.entry.entryNo}</h3>
                <p className="text-sm text-slate-500 mt-1">{detail.entry.entryDate} • {detail.entry.sourceType} • {detail.entry.sourceId || "-"}</p>
                <p className="text-sm mt-2">{detail.entry.description}</p>
                <p className="text-xs text-slate-500 mt-1">Dibuat oleh: {detail.entry.createdBy || "system"}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b">
                <tr><th className="py-2">Akun</th><th className="py-2">Memo</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Kredit</th></tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.lineNo} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2"><div className="font-mono text-xs">{l.accountCode}</div><div>{l.accountName}</div></td>
                    <td className="py-2 text-xs text-slate-500">{l.memo}</td>
                    <td className="py-2 text-right">{l.debit > 0 ? fmtRp(l.debit) : ""}</td>
                    <td className="py-2 text-right">{l.credit > 0 ? fmtRp(l.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2" colSpan={2}>Total</td>
                  <td className="py-2 text-right">{fmtRp(detail.entry.totalDebit)}</td>
                  <td className="py-2 text-right">{fmtRp(detail.entry.totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid rgb(226 232 240); background: white; font-size: 0.875rem; }
        :global(.dark) .input { background: rgb(15 23 42); border-color: rgb(51 65 85); color: white; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
