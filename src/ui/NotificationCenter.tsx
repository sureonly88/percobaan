"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import type { AppNotification } from "@/types";

const POLL_INTERVAL = 30_000; // 30 seconds

const CATEGORY_ICONS: Record<string, string> = {
  transaksi: "receipt_long",
  saldo: "account_balance_wallet",
  sistem: "settings",
  pengumuman: "campaign",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const router = useRouter();
  const { addToast } = useToast();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      const newUnread = data.unreadCount || 0;

      // Show toast for new notifications
      if (newUnread > prevUnreadRef.current && prevUnreadRef.current >= 0) {
        const newItems = (data.notifications as AppNotification[]).filter((n) => !n.isRead);
        const latest = newItems[0];
        if (latest && prevUnreadRef.current > 0) {
          addToast({
            severity: latest.severity,
            title: latest.title,
            message: latest.message,
          });
        }
      }
      prevUnreadRef.current = newUnread;
      setUnreadCount(newUnread);
    } catch {
      // silent fail
    }
  }, [addToast]);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markAsRead = async (ids: number[]) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.isRead) markAsRead([n.id]);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg relative transition-colors"
        title="Notifikasi"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-white dark:border-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifikasi</h3>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">notifications_off</span>
                <p className="text-sm">Belum ada notifikasi</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 ${
                    !n.isRead ? "bg-primary/5 dark:bg-primary/10" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 ${SEVERITY_COLORS[n.severity] || "text-slate-400"}`}>
                    <span className="material-symbols-outlined text-xl">
                      {CATEGORY_ICONS[n.category] || "notifications"}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!n.isRead ? "font-semibold" : "font-medium text-slate-600 dark:text-slate-400"}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>

                  {/* Link indicator */}
                  {n.link && (
                    <span className="material-symbols-outlined text-slate-300 text-lg mt-1">
                      chevron_right
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer — link to full page */}
          <button
            onClick={() => {
              setOpen(false);
              router.push("/notifikasi");
            }}
            className="w-full px-4 py-3 text-sm font-medium text-primary hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5"
          >
            Lihat Semua Notifikasi
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  );
}
