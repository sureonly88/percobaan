"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";

type DisputeStatus = "OPEN" | "RETRYING" | "REFUND_NEEDED" | "REFUND_PROCESSED" | "RESOLVED" | "CANCELLED";

interface DisputeRow {
  id: number;
  invoiceCode: string;
  status: DisputeStatus;
  reason: string | null;
  resolutionNote: string | null;
  refundAmount: number;
  refundReference: string | null;
  updatedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invoiceStatus?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  grandTotal?: number;
  gatewayStatus?: string | null;
  paymentMethod?: string | null;
  paidGatewayAt?: string | null;
  providerProcessedAt?: string | null;
  loketCode?: string | null;
  loketName?: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const STATUS_OPTIONS = ["ALL", "OPEN", "RETRYING", "REFUND_NEEDED", "REFUND_PROCESSED", "RESOLVED", "CANCELLED"] as const;

function formatRp(value: number | undefined) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: string) {
  switch (status) {
    case "OPEN":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    case "RETRYING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "REFUND_NEEDED":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "REFUND_PROCESSED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "RESOLVED":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
}

export default function PaymentDisputesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role || "";
  const allowed = userRole === "admin" || userRole === "supervisor";
  const [items, setItems] = useState<DisputeRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [formStatus, setFormStatus] = useState<DisputeStatus>("OPEN");
  const [reason, setReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "50", status });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [search, status]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/payment-links/disputes?${queryString}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengambil data dispute");
        return;
      }
      setItems(data.items || []);
      setPagination(data.pagination || null);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (!allowed) return;
    fetchData();
  }, [allowed, fetchData]);

  const summary = useMemo(() => ({
    open: items.filter((item) => item.status === "OPEN").length,
    refundNeeded: items.filter((item) => item.status === "REFUND_NEEDED").length,
    processed: items.filter((item) => item.status === "REFUND_PROCESSED").length,
    resolved: items.filter((item) => item.status === "RESOLVED").length,
  }), [items]);

  function openAction(row: DisputeRow, nextStatus?: DisputeStatus) {
    setSelected(row);
    setFormStatus(nextStatus || row.status);
    setReason(row.reason || "");
    setResolutionNote(row.resolutionNote || "");
    setRefundAmount(String(row.refundAmount || row.grandTotal || 0));
    setRefundReference(row.refundReference || "");
    setActionError("");
  }

  async function saveAction(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setActionError("");
    try {
      const res = await fetch("/api/payment-links/disputes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceCode: selected.invoiceCode,
          status: formStatus,
          reason: reason.trim() || undefined,
          resolutionNote: resolutionNote.trim() || undefined,
          refundAmount: Number(refundAmount.replace(/\D/g, "") || 0),
          refundReference: refundReference.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Gagal menyimpan perubahan");
        return;
      }
      setSelected(null);
      await fetchData();
    } catch {
      setActionError("Gagal menghubungi server");
    } finally {
      setSaving(false);
    }
  }

  return (
    sessionStatus !== "loading" && !allowed ? (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        <h1 className="text-xl font-black">Akses Ditolak</h1>
        <p className="mt-1 text-sm">Halaman Refund & Dispute hanya untuk admin dan supervisor.</p>
      </div>
    ) :
    <>
      <div className="mb-8">
        <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Payment Link", href: "/payment-links" }, { label: "Refund & Dispute" }]} />
        <div className="mt-2 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Refund & Dispute</h1>
            <p className="text-slate-500 mt-1">Tangani invoice online yang gateway-nya sukses tetapi provider gagal atau perlu refund manual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/payment-links" className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Kembali ke Payment Link
            </Link>
            <button onClick={fetchData} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Open" value={summary.open} icon="report" tone="text-red-600 bg-red-50 dark:bg-red-900/20" />
        <MetricCard label="Refund Needed" value={summary.refundNeeded} icon="assignment_return" tone="text-orange-600 bg-orange-50 dark:bg-orange-900/20" />
        <MetricCard label="Refund Processed" value={summary.processed} icon="paid" tone="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" />
        <MetricCard label="Resolved" value={summary.resolved} icon="verified" tone="text-slate-600 bg-slate-100 dark:bg-slate-800" />
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-primary">support_agent</span>Daftar Kasus</h2>
            <span className="text-xs font-bold text-slate-400">{pagination?.totalItems ?? items.length} data</span>
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
          <div className="p-12 text-center text-slate-400">Memuat kasus dispute...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3 text-emerald-500">verified</span>
            Tidak ada kasus refund/dispute.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">Invoice</th>
                  <th className="text-left px-5 py-3">Pelanggan</th>
                  <th className="text-right px-5 py-3">Nominal</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Catatan</th>
                  <th className="text-left px-5 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-bold">
                      {row.invoiceCode}
                      <div className="text-[10px] text-slate-400 font-normal">Gateway: {row.gatewayStatus || "-"} · Provider: {row.invoiceStatus || "-"}</div>
                    </td>
                    <td className="px-5 py-4">
                      {row.customerName || row.customerPhone || "-"}
                      <div className="text-[10px] text-slate-400">{row.loketName || row.loketCode || "Online"}</div>
                    </td>
                    <td className="px-5 py-4 text-right font-black">{formatRp(row.grandTotal)}</td>
                    <td className="px-5 py-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>{row.status}</span></td>
                    <td className="px-5 py-4 max-w-[260px] text-slate-600 dark:text-slate-300">
                      <div className="truncate">{row.resolutionNote || row.reason || "-"}</div>
                      {row.refundReference && <div className="text-[10px] text-emerald-600 font-bold">Ref: {row.refundReference}</div>}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap space-x-3">
                      <button onClick={() => openAction(row, "REFUND_NEEDED")} className="text-orange-600 font-bold hover:underline">Refund</button>
                      <button onClick={() => openAction(row, "RESOLVED")} className="text-emerald-600 font-bold hover:underline">Resolve</button>
                      <button onClick={() => openAction(row)} className="text-primary font-bold hover:underline">Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Update ${selected.invoiceCode}` : "Update Dispute"} maxWidth="lg">
        {selected && (
          <form onSubmit={saveAction} className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Pelanggan" value={selected.customerName || selected.customerPhone || "-"} />
                <Info label="Total" value={formatRp(selected.grandTotal)} />
                <Info label="Gateway" value={selected.gatewayStatus || "-"} />
                <Info label="Provider" value={selected.invoiceStatus || "-"} />
              </div>
            </div>

            <label className="block text-sm">
              <span className="font-bold">Status Tindakan</span>
              <select value={formStatus} onChange={(event) => setFormStatus(event.target.value as DisputeStatus)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 font-bold">
                {STATUS_OPTIONS.filter((option) => option !== "ALL").map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-bold">Alasan</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2" placeholder="Contoh: provider gagal setelah gateway sukses" />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-bold">Nominal Refund</span>
                <input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="font-bold">Referensi Refund</span>
                <input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2" placeholder="No. transfer/tiket" />
              </label>
            </div>

            <label className="block text-sm">
              <span className="font-bold">Catatan Penyelesaian</span>
              <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2" placeholder="Tuliskan tindak lanjut admin" />
            </label>

            {actionError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{actionError}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-sm">Batal</button>
              <button disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black">{value.toLocaleString("id-ID")}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
