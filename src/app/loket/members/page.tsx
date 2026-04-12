"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { Breadcrumb } from "@/ui";

interface Member {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  isLoketAdmin: boolean;
  createdAt: string;
}

interface LoketInfo {
  id: number;
  nama: string;
  loketCode: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const INITIAL_FORM = { username: "", password: "", name: "", email: "" };

export default function LoketMembersPage() {
  const { data: session } = useSession();
  const sessionUser = session?.user as { role?: string; loketId?: number } | undefined;
  const isAdmin = sessionUser?.role === "admin" || sessionUser?.role === "supervisor";

  const [members, setMembers]   = useState<Member[]>([]);
  const [loket, setLoket]       = useState<LoketInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [canManage, setCanManage] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  // Admin: loket selector
  const [loketOptions, setLoketOptions]     = useState<LoketInfo[]>([]);
  const [selectedLoketId, setSelectedLoketId] = useState<number | null>(null);

  // Add member modal
  const [addOpen, setAddOpen]       = useState(false);
  const [addForm, setAddForm]       = useState(INITIAL_FORM);
  const [addError, setAddError]     = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [showPass, setShowPass]     = useState(false);

  // Edit member modal
  const [editTarget, setEditTarget]   = useState<Member | null>(null);
  const [editForm, setEditForm]       = useState({ name: "", email: "", newPassword: "", setLoketAdmin: false });
  const [editError, setEditError]     = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [showEditPass, setShowEditPass] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget]   = useState<Member | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toggle status (activate / deactivate)
  const [toggleTarget, setToggleTarget]   = useState<Member | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Fetch loket list for admin selector
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/loket")
      .then(r => r.json())
      .then(d => {
        const list: LoketInfo[] = (d.lokets ?? []).map((l: { id: number; nama: string; loketCode: string }) => ({
          id: l.id, nama: l.nama, loketCode: l.loketCode,
        }));
        setLoketOptions(list);
      })
      .catch(() => {});
  }, [isAdmin]);

  const fetchMembers = useCallback(async (loketId?: number) => {
    const url = loketId
      ? `/api/loket/members?loketId=${loketId}`
      : "/api/loket/members";
    setLoading(true);
    setError("");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Gagal memuat data");
        return;
      }
      const d = await res.json();
      setMembers(d.members ?? []);
      setLoket(d.loket ?? null);
      setCanManage(d.canManage ?? false);
      setCanDelete(d.canDelete ?? false);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, []);

  // Kasir: auto-load on mount; admin: wait for selection
  useEffect(() => {
    if (!isAdmin) { fetchMembers(); }
  }, [isAdmin, fetchMembers]);

  function handleLoketSelect(id: number) {
    setSelectedLoketId(id);
    fetchMembers(id);
  }

  // Loket search dropdown state
  const [loketSearch, setLoketSearch]       = useState("");
  const [loketDropOpen, setLoketDropOpen]   = useState(false);
  const loketDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (loketDropRef.current && !loketDropRef.current.contains(e.target as Node)) {
        setLoketDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredLokets = loketOptions.filter(l =>
    l.loketCode.toLowerCase().includes(loketSearch.toLowerCase()) ||
    l.nama.toLowerCase().includes(loketSearch.toLowerCase())
  );
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    try {
      const body = isAdmin && selectedLoketId
        ? { ...addForm, loketId: selectedLoketId }
        : addForm;
      const res = await fetch("/api/loket/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setAddError(d.error || "Gagal membuat user"); return; }
      setAddOpen(false);
      setAddForm(INITIAL_FORM);
      fetchMembers(selectedLoketId ?? undefined);
    } catch {
      setAddError("Gagal menghubungi server");
    } finally {
      setAddLoading(false);
    }
  }

  // ── Toggle status (activate / deactivate) ────────────────────────────────────
  async function handleToggleStatus() {
    if (!toggleTarget) return;
    setToggleLoading(true);
    try {
      const newStatus = toggleTarget.status === "aktif" ? "nonaktif" : "aktif";
      const res = await fetch("/api/loket/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: toggleTarget.id, status: newStatus }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || "Gagal mengubah status"); return; }
      setToggleTarget(null);
      fetchMembers(selectedLoketId ?? undefined);
    } catch {
      alert("Gagal menghubungi server");
    } finally {
      setToggleLoading(false);
    }
  }

  // ── Edit member ──────────────────────────────────────────────────────────────
  function openEdit(m: Member) {
    setEditTarget(m);
    setEditForm({ name: m.name ?? "", email: m.email ?? "", newPassword: "", setLoketAdmin: m.isLoketAdmin });
    setEditError("");
    setShowEditPass(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError("");
    setEditLoading(true);
    try {
      const payload: Record<string, string | number | boolean> = { id: editTarget.id, name: editForm.name, email: editForm.email };
      if (editForm.newPassword) payload.newPassword = editForm.newPassword;
      if (isAdmin) payload.setLoketAdmin = editForm.setLoketAdmin;
      const res = await fetch("/api/loket/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { setEditError(d.error || "Gagal memperbarui user"); return; }
      setEditTarget(null);
      fetchMembers(selectedLoketId ?? undefined);
    } catch {
      setEditError("Gagal menghubungi server");
    } finally {
      setEditLoading(false);
    }
  }

  // ── Delete member ────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/loket/members?id=${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) { alert(d.error || "Gagal menghapus user"); return; }
      setDeleteTarget(null);
      fetchMembers(selectedLoketId ?? undefined);
    } catch {
      alert("Gagal menghubungi server");
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-8">
        <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Anggota Loket" }]} />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Anggota Loket</h1>
            <p className="text-slate-500 mt-1">
              {loket
                ? `Kelola user kasir untuk loket ${loket.loketCode} — ${loket.nama}`
                : "Kelola user kasir di loket Anda"}
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => { setAddOpen(true); setAddError(""); setAddForm(INITIAL_FORM); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-all shadow-sm shrink-0"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Tambah User
            </button>
          )}
        </div>
      </div>

      {/* Admin: loket selector */}
      {isAdmin && (
        <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-xl shrink-0">store</span>
          <label className="text-sm font-semibold shrink-0">Pilih Loket:</label>
          <div ref={loketDropRef} className="flex-1 relative">
            <button
              type="button"
              onClick={() => { setLoketDropOpen(v => !v); setLoketSearch(""); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-left"
            >
              <span className={loket ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>
                {loket ? `${loket.loketCode} — ${loket.nama}` : "-- Pilih loket untuk dikelola --"}
              </span>
              <span className={`material-symbols-outlined text-base text-slate-400 transition-transform ${loketDropOpen ? "rotate-180" : ""}`}>expand_more</span>
            </button>

            {loketDropOpen && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                {/* Search input */}
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="material-symbols-outlined text-base text-slate-400">search</span>
                    <input
                      type="text"
                      autoFocus
                      value={loketSearch}
                      onChange={(e) => setLoketSearch(e.target.value)}
                      placeholder="Cari kode atau nama loket..."
                      className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
                    />
                    {loketSearch && (
                      <button onClick={() => setLoketSearch("")} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="max-h-60 overflow-y-auto">
                  {filteredLokets.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">Loket tidak ditemukan</p>
                  ) : (
                    filteredLokets.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => { handleLoketSelect(l.id); setLoketDropOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                          selectedLoketId === l.id
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base text-slate-400">store</span>
                        <span className="font-mono text-xs text-slate-500 shrink-0">{l.loketCode}</span>
                        <span className="truncate">{l.nama}</span>
                        {selectedLoketId === l.id && (
                          <span className="material-symbols-outlined text-base ml-auto text-primary">check</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">manage_accounts</span>
            Daftar User Loket
          </h3>
          <span className="text-xs text-slate-400 font-medium">{members.length} user</span>
        </div>

        {isAdmin && !selectedLoketId ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3">store</span>
            <p className="font-semibold">Pilih loket terlebih dahulu</p>
            <p className="text-sm mt-1">Gunakan dropdown di atas untuk memilih loket yang ingin dikelola</p>
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin block mb-2">progress_activity</span>
            Memuat data...
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3">group_off</span>
            <p className="font-semibold">Belum ada user tambahan</p>
            <p className="text-sm mt-1">Klik "Tambah User" untuk menambahkan kasir di loket ini</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                  {(m.name || m.username).charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{m.name || m.username}</p>
                  <p className="text-xs text-slate-400 truncate">@{m.username}{m.email ? ` · ${m.email}` : ""}</p>
                </div>

                {/* isLoketAdmin badge */}
                {m.isLoketAdmin && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary shrink-0">
                    <span className="material-symbols-outlined text-[11px]">shield_person</span>
                    Admin Loket
                  </span>
                )}

                {/* Status badge */}
                <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  m.status === "aktif"
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    : m.status === "nonaktif"
                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {m.status === "aktif" ? "Aktif" : m.status === "nonaktif" ? "Nonaktif" : m.status}
                </span>

                {/* Joined */}
                <span className="hidden md:block text-xs text-slate-400 shrink-0">
                  Bergabung {formatDate(m.createdAt)}
                </span>

                {/* Actions */}
                {canManage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEdit(m)}
                      className="p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Edit user"
                    >
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button
                      onClick={() => setToggleTarget(m)}
                      className={`p-2 rounded-lg transition-colors ${
                        m.status === "nonaktif"
                          ? "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      }`}
                      title={m.status === "nonaktif" ? "Aktifkan user" : "Nonaktifkan user"}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {m.status === "nonaktif" ? "person_check" : "person_off"}
                      </span>
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Hapus user"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Member Modal ───────────────────────────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person_add</span>
                Tambah User Loket
              </h3>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">error</span>
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-1.5">Username <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="contoh: kasir_toko1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">Huruf kecil, angka, underscore (3–30 karakter)</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Nama Lengkap <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nama kasir"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Email <span className="text-slate-400 font-normal">(opsional)</span></label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@contoh.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={addForm.password}
                    onChange={(e) => setAddForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-lg">{showPass ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-[12px] text-slate-500 flex items-start gap-2">
                <span className="material-symbols-outlined text-sm text-amber-500 mt-0.5">info</span>
                User baru akan otomatis ditetapkan ke loket{loket ? ` ${loket.loketCode}` : " Anda"} dengan role Kasir.
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addLoading ? (
                    <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Menyimpan...</>
                  ) : (
                    <><span className="material-symbols-outlined text-base">person_add</span> Buat User</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Member Modal ──────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">edit</span>
                Edit User — @{editTarget.username}
              </h3>
              <button onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">error</span>
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-1.5">Nama Lengkap</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Reset Password <span className="text-slate-400 font-normal">(kosongkan jika tidak diubah)</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditPass ? "text" : "password"}
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Password baru..."
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-lg">{showEditPass ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-xl">shield_person</span>
                    <div>
                      <p className="text-sm font-semibold">Admin Loket</p>
                      <p className="text-[11px] text-slate-500">Dapat mengelola dan menambah user di loket ini</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, setLoketAdmin: !f.setLoketAdmin }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      editForm.setLoketAdmin ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform ring-0 transition-transform ${
                      editForm.setLoketAdmin ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </button>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {editLoading ? (
                    <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Menyimpan...</>
                  ) : (
                    <><span className="material-symbols-outlined text-base">save</span> Simpan</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toggle Status Confirm Modal ────────────────────────────────────── */}
      {toggleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                toggleTarget.status === "nonaktif"
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}>
                <span className={`material-symbols-outlined text-3xl ${
                  toggleTarget.status === "nonaktif" ? "text-emerald-500" : "text-amber-500"
                }`}>
                  {toggleTarget.status === "nonaktif" ? "person_check" : "person_off"}
                </span>
              </div>
              <h3 className="font-bold text-lg">
                {toggleTarget.status === "nonaktif" ? "Aktifkan User?" : "Nonaktifkan User?"}
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                Akun <span className="font-semibold text-slate-800 dark:text-slate-200">@{toggleTarget.username}</span> ({toggleTarget.name}) akan
                {toggleTarget.status === "nonaktif" ? " diaktifkan kembali dan dapat login." : " dinonaktifkan. User tidak bisa login selama dinonaktifkan."}
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setToggleTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleToggleStatus}
                disabled={toggleLoading}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  toggleTarget.status === "nonaktif" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {toggleLoading ? (
                  <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Memproses...</>
                ) : toggleTarget.status === "nonaktif" ? (
                  <><span className="material-symbols-outlined text-base">person_check</span> Aktifkan</>
                ) : (
                  <><span className="material-symbols-outlined text-base">person_off</span> Nonaktifkan</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-red-500">person_remove</span>
              </div>
              <h3 className="font-bold text-lg">Hapus User?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Akun <span className="font-semibold text-slate-800 dark:text-slate-200">@{deleteTarget.username}</span> ({deleteTarget.name}) akan dihapus permanen dari loket ini.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteLoading ? (
                  <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Menghapus...</>
                ) : (
                  <><span className="material-symbols-outlined text-base">delete</span> Hapus</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
