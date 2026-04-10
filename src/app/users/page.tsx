"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ROLE_LABELS, ROLE_ICONS, ROLE_COLORS, ROLE_DESCRIPTIONS, getAllRoles, normalizeRole, type UserRole } from "@/lib/rbac";

interface UserData {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  loketId: number | null;
  loketName: string | null;
  loketCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LoketOption {
  id: number;
  nama: string;
  loketCode: string;
}

function formatTanggal(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"semua" | UserRole>("semua");
  const [summary, setSummary] = useState({ total: 0, adminCount: 0, userCount: 0 });

  // Loket options for assigning user to loket
  const [loketOptions, setLoketOptions] = useState<LoketOption[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    id: 0, username: "", name: "", email: "", role: "kasir" as string, loketId: "" as string, newPassword: "",
  });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      setUsers(json.users ?? []);
      setSummary(json.summary ?? { total: 0, adminCount: 0, userCount: 0 });
    } catch (err) {
      console.error("Fetch users error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLokets = useCallback(async () => {
    try {
      const res = await fetch("/api/loket");
      const json = await res.json();
      setLoketOptions(
        (json.lokets ?? []).map((l: { id: number; loketCode: string; nama: string }) => ({
          id: l.id,
          nama: l.nama,
          loketCode: l.loketCode,
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchLokets();
  }, [fetchUsers, fetchLokets]);

  // Filter
  const filtered = users.filter((u) => {
    const matchSearch =
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "semua" || normalizeRole(u.role) === filterRole;
    return matchSearch && matchRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  useEffect(() => { setCurrentPage(1); }, [search, filterRole]);

  // Modal handlers
  const openAdd = () => {
    setEditMode(false);
    setFormData({ id: 0, username: "", name: "", email: "", role: "kasir", loketId: "", newPassword: "" });
    setFormError("");
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (u: UserData) => {
    setEditMode(true);
    setFormData({
      id: u.id,
      username: u.username,
      name: u.name || "",
      email: u.email || "",
      role: u.role,
      loketId: u.loketId ? String(u.loketId) : "",
      newPassword: "",
    });
    setFormError("");
    setShowPassword(false);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.username.trim()) { setFormError("Username wajib diisi"); return; }
    if (!editMode && !formData.newPassword) { setFormError("Password wajib diisi"); return; }
    if (formData.newPassword && formData.newPassword.length < 6) { setFormError("Password minimal 6 karakter"); return; }

    setFormLoading(true);
    setFormError("");
    try {
      const method = editMode ? "PUT" : "POST";
      const payload = editMode
        ? {
            id: formData.id,
            username: formData.username,
            name: formData.name,
            email: formData.email,
            role: formData.role,
            loketId: formData.loketId ? Number(formData.loketId) : null,
            newPassword: formData.newPassword || undefined,
          }
        : {
            username: formData.username,
            password: formData.newPassword,
            name: formData.name,
            email: formData.email,
            role: formData.role,
            loketId: formData.loketId ? Number(formData.loketId) : null,
          };

      const res = await fetch("/api/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || "Gagal menyimpan"); return; }
      setModalOpen(false);
      fetchUsers();
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
      const res = await fetch(`/api/users?id=${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { console.error(json.error); return; }
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold">Manajemen User</h2>
          <p className="text-slate-500">Kelola akun pengguna, role, dan hak akses sistem.</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
          </button>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Data Real-time</span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase">Database MariaDB</span>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-5">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg">
            <span className="material-symbols-outlined text-3xl">group</span>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total User</p>
            <p className="text-2xl font-bold mt-1">{loading ? "..." : summary.total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-5">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
            <span className="material-symbols-outlined text-3xl">shield_person</span>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Admin</p>
            <p className="text-2xl font-bold mt-1">{loading ? "..." : summary.adminCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-5">
          <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 rounded-lg">
            <span className="material-symbols-outlined text-3xl">person</span>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Operator</p>
            <p className="text-2xl font-bold mt-1">{loading ? "..." : summary.userCount}</p>
          </div>
        </div>
      </section>

      {/* Filter & Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input
                className="w-full h-[42px] pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                placeholder="Cari username, nama, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none cursor-pointer"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as "semua" | UserRole)}
            >
              <option value="semua">Semua Role</option>
              {getAllRoles().map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={openAdd}
            className="h-[42px] px-5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg flex items-center gap-2 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>Tambah User</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Loket</th>
                <th className="px-6 py-4 font-semibold">Terdaftar</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      <span className="text-sm">Memuat data...</span>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Tidak ada user ditemukan.
                  </td>
                </tr>
              ) : (
                paginated.map((u) => {
                  const initials = (u.name || u.username)
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${ROLE_COLORS[normalizeRole(u.role)].bg} ${ROLE_COLORS[normalizeRole(u.role)].text}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{u.name || u.username}</p>
                            <p className="text-xs text-slate-400 truncate">@{u.username}</p>
                            {u.email && <p className="text-[11px] text-slate-400 truncate">{u.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[normalizeRole(u.role)].bg} ${ROLE_COLORS[normalizeRole(u.role)].text}`}>
                          <span className="material-symbols-outlined text-xs">
                            {ROLE_ICONS[normalizeRole(u.role)]}
                          </span>
                          {ROLE_LABELS[normalizeRole(u.role)]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.loketName ? (
                          <div>
                            <p className="text-sm font-medium">{u.loketName}</p>
                            <p className="text-[11px] text-slate-400">{u.loketCode}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400">{formatTanggal(u.createdAt)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs text-slate-400">{filtered.length} user ditemukan</span>
            <nav className="flex items-center gap-1">
              <button
                className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((pg, idx, arr) => (
                  <React.Fragment key={pg}>
                    {idx > 0 && arr[idx - 1] !== pg - 1 && (
                      <span className="text-xs text-slate-400">…</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(pg)}
                      className={
                        currentPage === pg
                          ? "w-8 h-8 rounded-lg bg-primary text-white text-xs font-bold"
                          : "w-8 h-8 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                      }
                    >
                      {pg}
                    </button>
                  </React.Fragment>
                ))}
              <button
                className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalOpen(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${editMode ? "bg-primary/10 text-primary" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600"}`}>
                  <span className="material-symbols-outlined">{editMode ? "edit" : "person_add"}</span>
                </div>
                <h3 className="text-lg font-bold">{editMode ? "Edit User" : "Tambah User Baru"}</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-5">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  {formError}
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Username <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">alternate_email</span>
                  <input
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    placeholder="Masukkan username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nama Lengkap</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">badge</span>
                  <input
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    placeholder="Masukkan nama lengkap"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">mail</span>
                  <input
                    type="email"
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    placeholder="contoh@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {getAllRoles().map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: r })}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        formData.role === r
                          ? "border-primary bg-primary/5"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`material-symbols-outlined text-lg ${formData.role === r ? "text-primary" : "text-slate-400"}`}>{ROLE_ICONS[r]}</span>
                        <span className={`text-sm font-bold ${formData.role === r ? "text-primary" : ""}`}>{ROLE_LABELS[r]}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{ROLE_DESCRIPTIONS[r]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Loket Assignment */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Assign Loket</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">store</span>
                  <select
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none cursor-pointer"
                    value={formData.loketId}
                    onChange={(e) => setFormData({ ...formData, loketId: e.target.value })}
                  >
                    <option value="">— Tidak ada —</option>
                    {loketOptions.map((l) => (
                      <option key={l.id} value={String(l.id)}>{l.nama} ({l.loketCode})</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {editMode ? "Password Baru" : "Password"} {!editMode && <span className="text-red-500">*</span>}
                </label>
                {editMode && (
                  <p className="text-xs text-slate-400 mb-2">Kosongkan jika tidak ingin mengubah password</p>
                )}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">lock</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full h-11 pl-10 pr-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    placeholder={editMode ? "Masukkan password baru" : "Minimal 6 karakter"}
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-lg">{showPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={() => setModalOpen(false)}
                className="h-10 px-5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={formLoading}
                className="h-10 px-5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
              >
                {formLoading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                {editMode ? "Simpan Perubahan" : "Buat User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteOpen(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-red-500 text-3xl">person_remove</span>
              </div>
              <h3 className="text-lg font-bold mb-2">Hapus User</h3>
              <p className="text-sm text-slate-500 mb-1">
                Apakah Anda yakin ingin menghapus user ini?
              </p>
              <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg mt-2 mb-6">
                <span className="material-symbols-outlined text-slate-400 text-base">person</span>
                <span className="font-bold text-sm">{deleteTarget.name || deleteTarget.username}</span>
                <span className="text-xs text-slate-400">@{deleteTarget.username}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 h-10 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all"
                >
                  {deleteLoading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
