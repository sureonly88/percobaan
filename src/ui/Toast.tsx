"use client";

import React, { createContext, useCallback, useContext, useState, useRef } from "react";

interface Toast {
  id: string;
  severity: "info" | "warning" | "error" | "success";
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const SEVERITY_STYLES: Record<string, { bg: string; icon: string; iconColor: string; border: string }> = {
  info: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    icon: "info",
    iconColor: "text-blue-500",
    border: "border-blue-200 dark:border-blue-800",
  },
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    icon: "check_circle",
    iconColor: "text-emerald-500",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/60",
    icon: "warning",
    iconColor: "text-amber-500",
    border: "border-amber-200 dark:border-amber-800",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-950/60",
    icon: "error",
    iconColor: "text-red-500",
    border: "border-red-200 dark:border-red-800",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      const duration = toast.duration ?? (toast.severity === "error" ? 8000 : 5000);
      setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // max 5 toasts
      const timer = setTimeout(() => removeToast(id), duration);
      timers.current.set(id, timer);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => {
          const s = SEVERITY_STYLES[toast.severity] || SEVERITY_STYLES.info;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto ${s.bg} ${s.border} border rounded-xl shadow-lg px-4 py-3 flex gap-3 items-start animate-slide-in-right`}
            >
              <span className={`material-symbols-outlined ${s.iconColor} text-xl mt-0.5`}>
                {s.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
