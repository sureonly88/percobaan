"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Breadcrumb, Modal } from "@/ui";
import type { AppNotification, NotificationCategory, NotificationSeverity } from "@/types";

interface NotificationSummary {
  total: number;
  unread: number;
  error: number;
  warning: number;
}

interface NotificationPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

const CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "all", label: "Semua", icon: "notifications" },
  { value: "transaksi", label: "Transaksi", icon: "receipt_long" },
  { value: "saldo", label: "Saldo", icon: "account_balance_wallet" },
  { value: "sistem", label: "Sistem", icon: "settings" },
  { value: "pengumuman", label: "Pengumuman", icon: "campaign" },
];

const SEVERITIES: { value: string; label: string; color: string }[] = [
  { value: "all", label: "Semua", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  { value: "error", label: "Error", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  { value: "warning", label: "Warning", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  { value: "success", label: "Success", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  { value: "info", label: "Info", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
];

const SEVERITY_STYLES: Record<string, { bg: string; icon: string; iconColor: string; border: string }> = {
  info: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: "info", iconColor: "text-blue-500", border: "border-l-blue-500" },
  success: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "check_circle", iconColor: "text-emerald-500", border: "border-l-emerald-500" },
  warning: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "warning", iconColor: "text-amber-500", border: "border-l-amber-500" },
  error: { bg: "bg-red-50 dark:bg-red-950/30", icon: "error", iconColor: "text-red-500", border: "border-l-red-500" },
};

const CATEGORY_ICONS: Record<string, string> = {
  transaksi: "receipt_long",
  saldo: "account_balance_wallet",
  sistem: "settings",
  pengumuman: "campaign",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatDate(dateStr);
}

export default function NotifikasiPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "";
  const isAdmin = userRole === "admin";

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterRead, setFilterRead] = useState<"all" | "unread" | "read">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<NotificationPagination | null>(null);
  const [summary, setSummary] = useState<NotificationSummary>({ total: 0, unread: 0, error: 0, warning: 0 });

  // Announcement form state
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formSeverity, setFormSeverity] = useState("info");
  const [formTarget, setFormTarget] = useState("all");
  const [formLink, setFormLink] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "12",
        page: String(page),
        readStatus: filterRead,
        category: filterCategory,
        severity: filterSeverity,
      });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setSummary(data.summary || { total: 0, unread: 0, error: 0, warning: 0 });
      setPagination(data.pagination || null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterRead, filterSeverity, page, searchQuery]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    setPage(1);
  }, [filterCategory, filterSeverity, filterRead, searchQuery]);

  const markAsRead = async (ids: number[]) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      fetchNotifications();
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      fetchNotifications();
    } catch {
      // silent
    }
  };

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markAsRead([n.id]);
    if (n.link) router.push(n.link);
  };

  const resetForm = () => {
    setFormTitle("");
    setFormMessage("");
    setFormSeverity("info");
    setFormTarget("all");
    setFormLink("");
    setFormError("");
    setFormSuccess("");
  };

  const handleSubmitAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!formTitle.trim()) { setFormError("Judul wajib diisi"); return; }
    if (!formMessage.trim()) { setFormError("Isi pesan wajib diisi"); return; }

    setFormSubmitting(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          message: formMessage.trim(),
          severity: formSeverity,
          target: formTarget,
          link: formLink.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Gagal mengirim pengumuman");
        return;
      }
      setFormSuccess("Pengumuman berhasil dikirim!");
      resetForm();
      setTimeout(() => {
        setShowForm(false);
        setFormSuccess("");
        fetchNotifications();
      }, 1500);
    } catch {
      setFormError("Terjadi kesalahan jaringan");
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Notifikasi" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifikasi</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pusat notifikasi untuk transaksi, saldo, sistem, dan pengumuman
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">campaign</span>
              Buat Pengumuman
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-lg">done_all</span>
              Tandai Semua Dibaca
            </button>
          )}
        </div>
      </div>

      {/* Announcement Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Buat Pengumuman">
        <form onSubmit={handleSubmitAnnouncement} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Judul <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              maxLength={255}
              placeholder="Judul pengumuman..."
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Isi Pesan <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Tulis isi pengumuman..."
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{formMessage.length}/2000</p>
          </div>

          {/* Severity & Target row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tipe
              </label>
              <select
                value={formSeverity}
                onChange={(e) => setFormSeverity(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="info">Info</option>
                <option value="success">Sukses</option>
                <option value="warning">Peringatan</option>
                <option value="error">Penting / Darurat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Kirim Ke
              </label>
              <select
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="all">Semua User</option>
                <option value="admin">Admin</option>
                <option value="supervisor">Supervisor</option>
                <option value="kasir">Kasir</option>
              </select>
            </div>
          </div>

          {/* Link (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Link Terkait <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
              placeholder="/monitoring atau /laporan"
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Error / Success */}
          {formError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-4 py-2.5 rounded-lg">
              <span className="material-symbols-outlined text-lg">error</span>
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-4 py-2.5 rounded-lg">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              {formSuccess}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {formSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">send</span>
                  Kirim Pengumuman
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-slate-500">notifications</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <span className="material-symbols-outlined text-primary">mark_email_unread</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.unread}</p>
              <p className="text-xs text-slate-500">Belum Dibaca</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <span className="material-symbols-outlined text-red-500">error</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.error}</p>
              <p className="text-xs text-slate-500">Error</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <span className="material-symbols-outlined text-amber-500">warning</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.warning}</p>
              <p className="text-xs text-slate-500">Warning</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari notifikasi..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap gap-6">
          {/* Category filter */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kategori</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setFilterCategory(c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterCategory === c.value
                      ? "bg-primary text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity filter */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Severity</p>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFilterSeverity(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterSeverity === s.value
                      ? "bg-primary text-white"
                      : s.color
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Read status filter */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</p>
            <div className="flex gap-1.5">
              {(["all", "unread", "read"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilterRead(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterRead === v
                      ? "bg-primary text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {v === "all" ? "Semua" : v === "unread" ? "Belum Dibaca" : "Sudah Dibaca"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notification List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="material-symbols-outlined text-5xl mb-3">notifications_off</span>
            <p className="text-sm font-medium">Tidak ada notifikasi</p>
            <p className="text-xs mt-1">
              {filterCategory !== "all" || filterSeverity !== "all" || filterRead !== "all" || searchQuery
                ? "Coba ubah filter untuk melihat notifikasi lain"
                : "Notifikasi akan muncul saat ada aktivitas penting"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* List header */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 flex items-center justify-between">
              <span>
                {pagination?.totalItems || notifications.length} notifikasi
                {pagination ? ` • Halaman ${pagination.page}/${pagination.totalPages}` : ""}
              </span>
              {notifications.some((n) => !n.isRead) && (
                <button
                  onClick={() => {
                    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
                    markAsRead(unreadIds);
                  }}
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  Tandai yang ditampilkan sebagai dibaca
                </button>
              )}
            </div>

            {notifications.map((n) => {
              const s = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-6 py-4 flex gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-l-4 ${s.border} ${
                    !n.isRead ? s.bg : "border-l-transparent"
                  }`}
                >
                  {/* Category icon */}
                  <div className={`mt-0.5 ${s.iconColor}`}>
                    <span className="material-symbols-outlined text-2xl">
                      {CATEGORY_ICONS[n.category] || "notifications"}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-sm ${!n.isRead ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-600 dark:text-slate-400"}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="w-2.5 h-2.5 bg-primary rounded-full flex-shrink-0" />
                      )}
                      <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        SEVERITIES.find((sv) => sv.value === n.severity)?.color || ""
                      }`}>
                        {n.severity}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {timeAgo(n.createdAt)}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">
                          {CATEGORY_ICONS[n.category] || "label"}
                        </span>
                        {n.category}
                      </span>
                      {n.link && (
                        <span className="text-xs text-primary flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          Lihat detail
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && !loading && notifications.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/30">
            <p className="text-xs text-slate-500">
              Menampilkan halaman {pagination.page} dari {pagination.totalPages} • Total {pagination.totalItems} notifikasi
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!pagination.hasPrev}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Sebelumnya
              </button>
              <div className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {pagination.page}/{pagination.totalPages}
              </div>
              <button
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!pagination.hasNext}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
