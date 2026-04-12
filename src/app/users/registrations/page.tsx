"use client";

import { useState, useEffect, useCallback } from "react";

interface Registration {
  id:           number;
  username:     string;
  name:         string;
  email:        string | null;
  phone:        string | null;
  namaUsaha:    string | null;
  alamatUsaha:  string | null;
  catatanTolak: string | null;
  status:       "pending" | "aktif" | "ditolak";
  role:         string;
  loketCode:    string | null;
  createdAt:    string;
}

interface Pagination {
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

const STATUS_OPTS = [
  { value: "pending",  label: "Menunggu",  bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-400" },
  { value: "aktif",    label: "Disetujui", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  { value: "ditolak",  label: "Ditolak",   bg: "bg-red-100 dark:bg-red-900/30",       text: "text-red-700 dark:text-red-400" },
  { value: "semua",    label: "Semua",     bg: "bg-slate-100 dark:bg-slate-800",      text: "text-slate-600 dark:text-slate-400" },
];

function statusBadge(status: string) {
  const s = STATUS_OPTS.find(o => o.value === status) ?? STATUS_OPTS[3];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function RegistrationsPage() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search,       setSearch]       = useState("");
  const [data,         setData]         = useState<Registration[]>([]);
  const [pagination,   setPagination]   = useState<Pagination>({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading,      setLoading]      = useState(true);

  // Detail / action modal
  const [selected,     setSelected]     = useState<Registration | null>(null);
  const [rejectNote,   setRejectNote]   = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg,    setActionMsg]    = useState("");

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status:   statusFilter,
        search,
        page:     String(page),
        pageSize: "20",
      });
      const res = await fetch(`/api/admin/registrations?${params}`);
      const json = await res.json();
      setData(json.registrations ?? []);
      setPagination(json.pagination ?? { total: 0, page: 1, pageSize: 20, totalPages: 1 });
      setPendingCount(json.pendingCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  async function handleAction(action: "approve" | "reject") {
    if (!selected) return;
    setActionLoading(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/registrations", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: selected.id, action, catatanTolak: rejectNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionMsg(json.error || "Gagal");
        return;
      }
      setActionMsg(json.message);
      setSelected(null);
      setRejectNote("");
      fetchData(pagination.page);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">how_to_reg</span>
            Pendaftaran Agen
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-black px-2 py-0.5">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Kelola permintaan registrasi agen baru. Setujui atau tolak pendaftar.
          </p>
        </div>
      </div>

      {/* Action message (global) */}
      {actionMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          {actionMsg}
          <button onClick={() => setActionMsg("")} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        {/* Status tabs */}
        <div className="inline-flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {STATUS_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                statusFilter === opt.value
                  ? "bg-white dark:bg-slate-700 shadow-sm font-bold text-primary"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {opt.label}
              {opt.value === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, username, HP..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-primary focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat data...
          </div>
        ) : data.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3">inbox</span>
            <p className="font-semibold">Tidak ada pendaftar</p>
            <p className="text-sm mt-1">
              {statusFilter === "pending" ? "Belum ada pendaftaran baru." : "Tidak ada data untuk filter ini."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Pendaftar</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Kontak</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Usaha</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Terdaftar</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.map(reg => (
                    <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                            {(reg.name || reg.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{reg.name || "-"}</p>
                            <p className="text-xs text-slate-400">@{reg.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700 dark:text-slate-300">{reg.phone || "-"}</p>
                        <p className="text-xs text-slate-400">{reg.email || "-"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{reg.namaUsaha || "-"}</p>
                        {reg.loketCode && (
                          <p className="text-xs text-emerald-600 font-mono font-bold">{reg.loketCode}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">{statusBadge(reg.status)}</td>
                      <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">{formatDate(reg.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => { setSelected(reg); setRejectNote(""); setActionMsg(""); }}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          {reg.status === "pending" ? "Tinjau →" : "Detail"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
                <span>{pagination.total} total pendaftar</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchData(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Sebelumnya
                  </button>
                  <span className="text-xs">{pagination.page} / {pagination.totalPages}</span>
                  <button
                    onClick={() => fetchData(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail / Action Modal ─────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person_check</span>
                Detail Pendaftaran
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Profile */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-black text-2xl">
                  {(selected.name || selected.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-xl">{selected.name}</p>
                  <p className="text-sm text-slate-400">@{selected.username}</p>
                  <div className="mt-1">{statusBadge(selected.status)}</div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                {[
                  { label: "Nomor HP",      value: selected.phone },
                  { label: "Email",         value: selected.email },
                  { label: "Nama Usaha",    value: selected.namaUsaha },
                  { label: "Alamat Usaha",  value: selected.alamatUsaha },
                  { label: "Terdaftar",     value: formatDate(selected.createdAt) },
                  { label: "Loket Code",    value: selected.loketCode },
                ].map(item => (
                  item.value ? (
                    <div key={item.label} className={item.label === "Alamat Usaha" ? "col-span-2" : ""}>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{item.value}</p>
                    </div>
                  ) : null
                ))}
              </div>

              {/* Catatan tolak (jika sudah ditolak) */}
              {selected.status === "ditolak" && selected.catatanTolak && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <p className="font-bold mb-1">Alasan Penolakan:</p>
                  <p>{selected.catatanTolak}</p>
                </div>
              )}

              {/* Action area — only if pending */}
              {selected.status === "pending" && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Catatan Penolakan <span className="text-slate-400 font-normal">(opsional, jika ingin menolak)</span>
                    </label>
                    <textarea
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      rows={2}
                      placeholder="cth: Data tidak lengkap, area tidak terjangkau, dll."
                      className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-primary focus:border-primary outline-none resize-none"
                    />
                  </div>

                  {actionMsg && (
                    <p className="text-red-500 text-sm">{actionMsg}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => handleAction("reject")}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-lg">cancel</span>
                      Tolak
                    </button>
                    <button
                      onClick={() => handleAction("approve")}
                      disabled={actionLoading}
                      className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                      {actionLoading ? (
                        <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                      )}
                      Setujui & Buat Loket
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
