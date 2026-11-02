"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Breadcrumb } from "@/ui";
import { canAccessPage, normalizeRole } from "@/lib/rbac";
import { GUIDE_SECTIONS, ROLE_NAMES, type GuideFeature, type GuideRole } from "./content";

type RoleFilter = "mine" | "all";

const ROLE_BADGE: Record<GuideRole, string> = {
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  supervisor: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  kasir: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function matches(feature: GuideFeature, q: string): boolean {
  if (!q) return true;
  const haystack = [feature.title, feature.summary, ...(feature.steps ?? []), ...(feature.notes ?? [])]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export default function PanduanPage() {
  const { data: session } = useSession();
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role || "kasir") as GuideRole;

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("mine");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>("");

  const sections = useMemo(() => {
    return GUIDE_SECTIONS.map((section) => ({
      ...section,
      features: section.features.filter(
        (f) => (roleFilter === "all" || f.roles.includes(role)) && matches(f, query.trim())
      ),
    })).filter((s) => s.features.length > 0);
  }, [role, roleFilter, query]);

  const totalShown = sections.reduce((n, s) => n + s.features.length, 0);

  // Tandai bagian yang sedang dibaca di daftar isi
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -60% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="print:hidden">
        <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Panduan Pengguna" }]} />
      </div>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panduan Pengguna</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cara memakai fitur Pedami Payment, disusun mengikuti menu aplikasi. Secara bawaan hanya menampilkan fitur
            untuk peran Anda ({ROLE_NAMES[role] ?? role}).
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <span className="material-symbols-outlined text-lg">print</span>
          Cetak / Simpan PDF
        </button>
      </header>

      <div className="print:hidden flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari panduan, mis. tutup kasir, struk, saldo..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {(["mine", "all"] as RoleFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                roleFilter === key ? "bg-primary text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {key === "mine" ? `Peran saya (${ROLE_NAMES[role] ?? role})` : "Semua peran"}
            </button>
          ))}
        </div>
      </div>

      {/* Daftar isi — deretan tombol (layout aplikasi memakai kontainer overflow sehingga sidebar sticky tidak bisa dipakai) */}
      <nav id="daftar-isi" className="print:hidden scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Daftar isi</p>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeId === s.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <span className="material-symbols-outlined text-sm">{s.icon}</span>
              {s.title}
              <span className="text-[10px] text-slate-400">{s.features.length}</span>
            </a>
          ))}
        </div>
      </nav>

      <a
        href="#daftar-isi"
        className="print:hidden fixed bottom-6 right-6 z-30 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-primary/90"
        title="Kembali ke daftar isi"
      >
        <span className="material-symbols-outlined text-base">toc</span>
        Daftar isi
      </a>

      <div>
        <div className="min-w-0 space-y-10">
          {totalShown === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              Tidak ada panduan yang cocok dengan pencarian &ldquo;{query}&rdquo;.
            </div>
          )}

          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-36 space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                <span className="material-symbols-outlined mt-0.5 text-2xl text-primary">{section.icon}</span>
                <div>
                  <h2 className="text-xl font-bold">{section.title}</h2>
                  {section.intro && <p className="mt-1 text-sm text-slate-500">{section.intro}</p>}
                </div>
              </div>

              {section.features.map((f) => {
                const canOpen = f.href ? canAccessPage(role, f.href) : false;
                return (
                  <article
                    key={f.id}
                    id={f.id}
                    className="scroll-mt-36 break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-bold">
                          {f.icon && <span className="material-symbols-outlined text-lg text-slate-400">{f.icon}</span>}
                          {f.title}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {f.roles.map((r) => (
                            <span key={r} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ROLE_BADGE[r]}`}>
                              {ROLE_NAMES[r]}
                            </span>
                          ))}
                        </div>
                      </div>
                      {f.href && canOpen && (
                        <Link
                          href={f.href}
                          className="print:hidden inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"
                        >
                          Buka halaman
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </Link>
                      )}
                    </div>

                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{f.summary}</p>

                    {f.steps && f.steps.length > 0 && (
                      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 marker:font-bold marker:text-slate-400 dark:text-slate-300">
                        {f.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    )}

                    {f.notes && f.notes.length > 0 && (
                      <div className="mt-4 space-y-1.5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        {f.notes.map((note, i) => (
                          <p key={i} className="flex gap-2">
                            <span className="material-symbols-outlined text-sm">info</span>
                            <span>{note}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
