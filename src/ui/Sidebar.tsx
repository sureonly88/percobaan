"use client";

import React from "react";
import Link from "next/link";

export interface SidebarItemData {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

interface SidebarProps {
  title: string;
  items: SidebarItemData[];
  infoTitle?: string;
  infoText?: string;
}

export function Sidebar({ title, items, infoTitle, infoText }: SidebarProps) {
  return (
    <aside className="lg:col-span-3 space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 mb-4">
        {title}
      </p>

      {items.map((item) =>
        item.active ? (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 transition-all"
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-bold">{item.label}</span>
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-transparent hover:border-slate-200"
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </Link>
        )
      )}

      {infoTitle && infoText && (
        <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-pln-blue to-primary text-white relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-xs font-bold opacity-80 uppercase mb-1">
              {infoTitle}
            </p>
            <p className="text-sm leading-relaxed font-medium">{infoText}</p>
          </div>
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-7xl opacity-10 group-hover:scale-110 transition-transform">
            info
          </span>
        </div>
      )}
    </aside>
  );
}
