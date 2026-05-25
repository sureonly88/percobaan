"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  totalProviderAmt: number;
  netPayable: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  paidReference: string | null;
  glEntryId: number | null;
}

interface BatchItem {
  id: number;
  idempotencyKey: string;
  provider: string;
  amount: number;
  adminFee: number;
  total: number;
  transactionDate: string;
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

export default function SettlementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settlement/batches/${id}`);
      const j = await res.json();
      if (res.ok) {
        setBatch(j.batch);
        setItems(j.items ?? []);
      } else {
        setMsg(j.error || "Gagal memuat batch");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (Number.isFinite(id)) load(); }, [id, load]);

  const act = async (action: "APPROVE" | "MARK_PAID") => {
    if (!confirm(`Yakin ${action === "APPROVE" ? "approve" : "tandai sudah dibayar"}?`)) return;
    setActing(true);
    setMsg("");
    try {
      const res = await fetch(`/api/settlement/batches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reference, notes }),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg(`✓ ${action} berhasil`);
        setBatch(j.batch);
      } else {
        setMsg(`✗ ${j.error}`);
      }
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-6">Memuat…</div>;
  if (!batch) return <div className="p-6">Batch tidak ditemukan. <Link href="/settlement" className="text-primary">Kembali</Link></div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/settlement")} className="text-slate-500 hover:text-slate-700">← Kembali</button>
        <h1 className="text-2xl font-bold font-mono">{batch.batchCode}</h1>
        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[batch.status]}`}>{batch.status}</span>
      </div>

      {msg && <div className="text-sm p-3 rounded bg-slate-100 dark:bg-slate-800">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Tanggal</span><span>{batch.batchDate}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Loket</span><span>{batch.loketName || batch.loketCode}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Transaksi</span><span>{batch.transactionCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total Gross</span><span>{fmtRp(batch.totalGross)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total Admin Fee</span><span>{fmtRp(batch.totalAdminFee)}</span></div>
          <div className="flex justify-between font-semibold border-t pt-2"><span>Net Payable</span><span className="text-lg">{fmtRp(batch.netPayable)}</span></div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Dibuat</span><span>{batch.createdAt} ({batch.createdBy})</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Approved</span><span>{batch.approvedAt ? `${batch.approvedAt} (${batch.approvedBy})` : "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{batch.paidAt ? `${batch.paidAt} (${batch.paidBy})` : "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-mono text-xs">{batch.paidReference || "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">GL Entry</span><span>{batch.glEntryId ? `#${batch.glEntryId}` : "-"}</span></div>
          {batch.notes && <div className="text-slate-500 mt-2">Catatan: {batch.notes}</div>}
        </div>
      </div>

      {(batch.status === "DRAFT" || batch.status === "APPROVED") && (
        <div className="bg-primary/5 border border-primary/30 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Aksi</h3>
          {batch.status === "APPROVED" && (
            <div className="flex flex-wrap gap-3 items-end mb-3">
              <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Referensi pembayaran</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" placeholder="No transfer / cek" />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Catatan</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
              </label>
            </div>
          )}
          <div className="flex gap-3">
            {batch.status === "DRAFT" && (
              <button onClick={() => act("APPROVE")} disabled={acting} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                {acting ? "Memproses…" : "Approve Batch"}
              </button>
            )}
            {batch.status === "APPROVED" && (
              <button onClick={() => act("MARK_PAID")} disabled={acting} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50">
                {acting ? "Memproses…" : "Tandai Sudah Dibayar"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Detail Transaksi ({items.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Idempotency Key</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2 text-right">Nominal</th>
              <th className="px-3 py-2 text-right">Admin</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-slate-500">Tidak ada item</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-mono text-xs">{it.idempotencyKey}</td>
                <td className="px-3 py-2">{it.provider}</td>
                <td className="px-3 py-2">{String(it.transactionDate).slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2 text-right">{fmtRp(it.amount)}</td>
                <td className="px-3 py-2 text-right">{fmtRp(it.adminFee)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtRp(it.total)}</td>
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
