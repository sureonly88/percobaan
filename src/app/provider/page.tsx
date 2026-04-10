"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

interface ProviderData {
  id: number;
  name: string;
  code: string;
  apiKey: string;
  status: "active" | "suspended" | "inactive";
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  allowedIps: string | null;
  webhookUrl: string | null;
  balance: number;
  adminFee: number;
  userId: number | null;
  loketId: number | null;
  username: string | null;
  userName: string | null;
  loketCode: string | null;
  loketName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  totalTransactions: number;
  successPayments: number;
  totalRevenue: number;
}

interface ProviderTransaction {
  id: number;
  provider_id: number;
  provider_code: string;
  provider_name: string;
  provider_ref: string | null;
  idempotency_key: string;
  transaction_type: "inquiry" | "payment";
  cust_id: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  amount: number | null;
  admin_fee: number | null;
  total: number | null;
  error_code: string | null;
  error_message: string | null;
  transaction_code: string | null;
  ip_address: string | null;
  duration_ms: number | null;
  webhook_status: string;
  created_at: string;
}

interface Summary {
  total: number;
  active: number;
  suspended: number;
  totalBalance: number;
}

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatTanggal(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Aktif" },
  suspended: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Suspended" },
  inactive: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Nonaktif" },
};

const TX_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  SUCCESS: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  PENDING: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
};

export default function ProviderPage() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, suspended: 0, totalBalance: 0 });
  const [activeTab, setActiveTab] = useState<"providers" | "transactions">("providers");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    id: 0, name: "", code: "", status: "active",
    rateLimitPerMinute: 60, rateLimitPerDay: 10000,
    allowedIps: "", webhookUrl: "", webhookSecret: "",
    balance: 0, adminFee: 0,
    userId: "" as string, loketId: "" as string,
    contactName: "", contactEmail: "", contactPhone: "", notes: "",
  });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // User & Loket options
  const [userOptions, setUserOptions] = useState<{ id: number; username: string; name: string | null; loketId: number | null; loketName: string | null; loketCode: string | null; loketPulsa: number; loketBiayaAdmin: number }[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
        setUserSearch("");
      }
    }
    if (userDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userDropdownOpen]);

  // Credentials modal
  const [credModal, setCredModal] = useState(false);
  const [credentials, setCredentials] = useState<{ apiKey: string; apiSecret: string } | null>(null);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProviderData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Transactions tab
  const [transactions, setTransactions] = useState<ProviderTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txFilter, setTxFilter] = useState({ providerId: "", status: "", type: "" });
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const txLimit = 20;

  // Pagination for providers
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/provider");
      const json = await res.json();
      setProviders(json.providers ?? []);
      setSummary(json.summary ?? { total: 0, active: 0, suspended: 0, totalBalance: 0 });
    } catch (err) {
      console.error("Fetch providers error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({ page: String(txPage), limit: String(txLimit) });
      if (txFilter.providerId) params.set("provider_id", txFilter.providerId);
      if (txFilter.status) params.set("status", txFilter.status);
      if (txFilter.type) params.set("type", txFilter.type);
      const res = await fetch(`/api/provider/transactions?${params}`);
      const json = await res.json();
      setTransactions(json.transactions ?? []);
      setTxTotal(json.pagination?.total ?? 0);
    } catch (err) {
      console.error("Fetch transactions error:", err);
    } finally {
      setTxLoading(false);
    }
  }, [txPage, txFilter]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);
  useEffect(() => {
    if (activeTab === "transactions") fetchTransactions();
  }, [activeTab, fetchTransactions]);

  // Fetch users for dropdown (includes loket info)
  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(json => {
      setUserOptions((json.users ?? []).map((u: { id: number; username: string; name: string | null; loketId: number | null; loketName: string | null; loketCode: string | null; loketPulsa: number; loketBiayaAdmin: number }) => ({
        id: u.id, username: u.username, name: u.name,
        loketId: u.loketId, loketName: u.loketName, loketCode: u.loketCode,
        loketPulsa: u.loketPulsa ?? 0, loketBiayaAdmin: u.loketBiayaAdmin ?? 0,
      })));
    }).catch(() => {});
  }, []);

  // Filter providers
  const filtered = providers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Form handlers
  const openCreate = () => {
    setEditMode(false);
    setFormData({
      id: 0, name: "", code: "", status: "active",
      rateLimitPerMinute: 60, rateLimitPerDay: 10000,
      allowedIps: "", webhookUrl: "", webhookSecret: "",
      balance: 0, adminFee: 0,
      userId: "", loketId: "",
      contactName: "", contactEmail: "", contactPhone: "", notes: "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (p: ProviderData) => {
    setEditMode(true);
    setFormData({
      id: p.id, name: p.name, code: p.code, status: p.status,
      rateLimitPerMinute: p.rateLimitPerMinute, rateLimitPerDay: p.rateLimitPerDay,
      allowedIps: p.allowedIps || "", webhookUrl: p.webhookUrl || "", webhookSecret: "",
      balance: p.balance, adminFee: p.adminFee,
      userId: p.userId ? String(p.userId) : "", loketId: p.loketId ? String(p.loketId) : "",
      contactName: p.contactName || "", contactEmail: p.contactEmail || "",
      contactPhone: p.contactPhone || "", notes: p.notes || "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");

    try {
      const method = editMode ? "PUT" : "POST";
      const payload = editMode
        ? { ...formData }
        : { ...formData };

      const res = await fetch("/api/provider", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Gagal menyimpan");
        return;
      }

      // Show credentials for new provider
      if (!editMode && json.credentials) {
        setCredentials(json.credentials);
        setCredModal(true);
      }

      setModalOpen(false);
      fetchProviders();
    } catch {
      setFormError("Terjadi kesalahan");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/provider?id=${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchProviders();
        setDeleteOpen(false);
        setDeleteTarget(null);
      }
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRegenerateKey = async (providerId: number) => {
    if (!confirm("Regenerate API key? Provider harus update credentials mereka.")) return;
    try {
      const res = await fetch("/api/provider/regenerate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: providerId }),
      });
      const json = await res.json();
      if (res.ok && json.credentials) {
        setCredentials(json.credentials);
        setCredModal(true);
        fetchProviders();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">API Provider</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola provider eksternal yang mengakses PDAM payment API</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Tambah Provider
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Provider", value: summary.total, icon: "dns", color: "text-blue-600" },
          { label: "Aktif", value: summary.active, icon: "check_circle", color: "text-emerald-600" },
          { label: "Suspended", value: summary.suspended, icon: "pause_circle", color: "text-amber-600" },
          { label: "Total Deposit", value: formatRupiah(summary.totalBalance), icon: "account_balance", color: "text-purple-600" },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-3">
              <div className={`${card.color} bg-slate-100 dark:bg-slate-800 p-2 rounded-lg`}>
                <span className="material-symbols-outlined">{card.icon}</span>
              </div>
              <div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("providers")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "providers" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Provider
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "transactions" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Transaksi
        </button>
      </div>

      {/* Providers Tab */}
      {activeTab === "providers" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="relative max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input
                type="text"
                placeholder="Cari provider..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-500">Provider</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Saldo</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Admin Fee</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Transaksi</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Revenue</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Rate Limit</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Memuat data...</td></tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Belum ada provider</td></tr>
                ) : paged.map((p) => {
                  const badge = STATUS_BADGE[p.status] || STATUS_BADGE.inactive;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{p.name} <span className="text-xs text-slate-400 font-mono font-normal">({p.code})</span></p>
                          {p.username && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">person</span>
                              {p.username}{p.loketCode ? ` · ${p.loketCode}` : ""}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatRupiah(p.balance)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatRupiah(p.adminFee)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold">{p.successPayments}</span>
                        <span className="text-slate-400">/{p.totalTransactions}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatRupiah(p.totalRevenue)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {p.rateLimitPerMinute}/min<br/>{p.rateLimitPerDay}/day
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button onClick={() => handleRegenerateKey(p.id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-600 transition-colors" title="Regenerate Key">
                            <span className="material-symbols-outlined text-lg">key</span>
                          </button>
                          <button onClick={() => { setDeleteTarget(p); setDeleteOpen(true); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-600 transition-colors" title="Hapus">
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">{filtered.length} provider</p>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${currentPage === i + 1 ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === "transactions" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <select
              value={txFilter.providerId}
              onChange={(e) => { setTxFilter({ ...txFilter, providerId: e.target.value }); setTxPage(1); }}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">Semua Provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
            <select
              value={txFilter.status}
              onChange={(e) => { setTxFilter({ ...txFilter, status: e.target.value }); setTxPage(1); }}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">Semua Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
            <select
              value={txFilter.type}
              onChange={(e) => { setTxFilter({ ...txFilter, type: e.target.value }); setTxPage(1); }}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">Semua Tipe</option>
              <option value="inquiry">Inquiry</option>
              <option value="payment">Payment</option>
            </select>
          </div>

          {/* Transaction Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-500">Waktu</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Provider</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Tipe</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">ID Pelanggan</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-right">Durasi</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Webhook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {txLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Memuat data...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Belum ada transaksi</td></tr>
                ) : transactions.map((tx) => {
                  const badge = TX_STATUS_BADGE[tx.status] || TX_STATUS_BADGE.PENDING;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatTanggal(tx.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{tx.provider_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tx.transaction_type === "payment" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{tx.cust_id}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{tx.total ? formatRupiah(tx.total) : "-"}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">{tx.duration_ms ? `${tx.duration_ms}ms` : "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${tx.webhook_status === "sent" ? "text-emerald-600" : tx.webhook_status === "failed" ? "text-red-500" : "text-slate-400"}`}>
                          {tx.webhook_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TX Pagination */}
          {txTotal > txLimit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">{txTotal} transaksi</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setTxPage(Math.max(1, txPage - 1))}
                  disabled={txPage === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-slate-500">
                  {txPage} / {Math.ceil(txTotal / txLimit)}
                </span>
                <button
                  onClick={() => setTxPage(Math.min(Math.ceil(txTotal / txLimit), txPage + 1))}
                  disabled={txPage >= Math.ceil(txTotal / txLimit)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editMode ? "Edit Provider" : "Tambah Provider Baru"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{formError}</div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nama Provider *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Kode Provider * (UPPERCASE)</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    disabled={editMode}
                    pattern="^[A-Z0-9_]{2,20}$"
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 font-mono"
                    required
                  />
                </div>
              </div>

              {editMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 h-[42px]"
                  >
                    <option value="active">Aktif</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span className="material-symbols-outlined text-base">link</span>
                  Koneksi Loket
                </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative" ref={userDropdownRef}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">User (Perwakilan)</label>
                  <div className="relative">
                    <div
                      className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm cursor-pointer flex items-center justify-between"
                      onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    >
                      <span className={formData.userId ? "text-slate-900 dark:text-white" : "text-slate-400"}>
                        {formData.userId
                          ? (() => {
                              const u = userOptions.find(u => String(u.id) === formData.userId);
                              return u ? `${u.username}${u.name ? ` (${u.name})` : ""}` : "User tidak ditemukan";
                            })()
                          : "-- Pilih User --"}
                      </span>
                      <span className="material-symbols-outlined text-sm text-slate-400">{userDropdownOpen ? "expand_less" : "expand_more"}</span>
                    </div>
                    {userDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                            <input
                              type="text"
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              placeholder="Cari username atau nama..."
                              className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-44">
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, userId: "", loketId: "", balance: 0, adminFee: 0 });
                              setUserDropdownOpen(false);
                              setUserSearch("");
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            -- Tidak ada --
                          </button>
                          {userOptions
                            .filter(u => {
                              if (!userSearch) return true;
                              const q = userSearch.toLowerCase();
                              return u.username.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q);
                            })
                            .map((u) => (
                              <button
                                type="button"
                                key={u.id}
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    userId: String(u.id),
                                    loketId: u.loketId ? String(u.loketId) : "",
                                    balance: u.loketPulsa ?? 0,
                                    adminFee: u.loketBiayaAdmin ?? 0,
                                  });
                                  setUserDropdownOpen(false);
                                  setUserSearch("");
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors ${
                                  formData.userId === String(u.id) ? "bg-primary/5 font-semibold text-primary" : "text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="font-medium">{u.username}</span>
                                    {u.name && <span className="text-slate-400 ml-1">({u.name})</span>}
                                  </div>
                                  {u.loketCode && (
                                    <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                      {u.loketCode}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Loket (otomatis dari user)</label>
                  <div className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-500">
                    {formData.loketId
                      ? (() => {
                          const u = userOptions.find(u => u.loketId && String(u.loketId) === formData.loketId);
                          return u ? `${u.loketCode} - ${u.loketName}` : `Loket ID: ${formData.loketId}`;
                        })()
                      : "Belum ada loket"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Saldo Deposit <span className="font-normal text-slate-400">(dari Loket)</span></label>
                  <input
                    type="text"
                    value={formatRupiah(formData.balance)}
                    readOnly
                    disabled
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Admin Fee / Trx <span className="font-normal text-slate-400">(dari Loket)</span></label>
                  <input
                    type="text"
                    value={formatRupiah(formData.adminFee)}
                    readOnly
                    disabled
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Rate Limit / Menit</label>
                  <input
                    type="number"
                    value={formData.rateLimitPerMinute}
                    onChange={(e) => setFormData({ ...formData, rateLimitPerMinute: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Rate Limit / Hari</label>
                  <input
                    type="number"
                    value={formData.rateLimitPerDay}
                    onChange={(e) => setFormData({ ...formData, rateLimitPerDay: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">IP Whitelist (comma-separated, kosong = allow all)</label>
                <input
                  type="text"
                  value={formData.allowedIps}
                  onChange={(e) => setFormData({ ...formData, allowedIps: e.target.value })}
                  placeholder="103.21.1.1, 202.134.5.6"
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Webhook URL</label>
                  <input
                    type="url"
                    value={formData.webhookUrl}
                    onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                    placeholder="https://example.com/callback"
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Webhook Secret</label>
                  <input
                    type="text"
                    value={formData.webhookSecret}
                    onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                    placeholder="auto-generated jika kosong"
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Kontak</p>
                <div className="grid grid-cols-3 gap-4">
                  <input
                    type="text"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="Nama PIC"
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="Email"
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="No. Telp"
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Catatan</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={formLoading} className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {formLoading ? "Menyimpan..." : editMode ? "Simpan Perubahan" : "Buat Provider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {credModal && credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center gap-3 p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                <span className="material-symbols-outlined">key</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">API Credentials</h2>
                <p className="text-xs text-amber-600">Simpan credentials ini! API Secret tidak akan ditampilkan lagi.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={credentials.apiKey}
                    className="flex-1 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(credentials.apiKey)}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">content_copy</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">API Secret</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={credentials.apiSecret}
                    className="flex-1 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-mono text-xs"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(credentials.apiSecret)}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => { setCredModal(false); setCredentials(null); }}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Saya Sudah Menyimpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-red-600 text-2xl">warning</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Hapus Provider?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Provider <strong>{deleteTarget.name}</strong> ({deleteTarget.code}) akan dihapus/dinonaktifkan.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteOpen(false); setDeleteTarget(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
