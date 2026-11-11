"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { canAccessPage, normalizeRole } from "@/lib/rbac";
import { GUIDE_SECTIONS, ROLE_NAMES, type GuideFeature, type GuideRole } from "@/app/panduan/content";

// Halaman desktop yang punya padanan di versi mobile. Fitur lain ditandai "desktop".
const MOBILE_HREF: Record<string, string> = {
  "/": "/m",
  "/m": "/m",
  "/pembayaran": "/m/bayar",
  "/riwayat": "/m/riwayat",
  "/laporan": "/m/laporan",
  "/topup": "/m/topup",
  "/tutup-kasir": "/m/tutup-kasir",
  "/pengaturan": "/m/pengaturan",
};

function matches(feature: GuideFeature, q: string): boolean {
  if (!q) return true;
  const haystack = [feature.title, feature.summary, ...(feature.steps ?? []), ...(feature.notes ?? [])].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => haystack.includes(w));
}

export default function MobilePanduanPage() {
  const { data: session } = useSession();
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role || "kasir") as GuideRole;

  const [allRoles, setAllRoles] = useState(false);
  const [query, setQuery] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openFeature, setOpenFeature] = useState<string | null>(null);

  const q = query.trim();
  const sections = useMemo(
    () =>
      GUIDE_SECTIONS.map((s) => ({
        ...s,
        features: s.features.filter((f) => (allRoles || f.roles.includes(role)) && matches(f, q)),
      })).filter((s) => s.features.length > 0),
    [role, allRoles, q],
  );
  const totalShown = sections.reduce((n, s) => n + s.features.length, 0);

  return (
    <div>
      <MobileHeader title="Panduan pengguna" subtitle={`Untuk ${ROLE_NAMES[role] ?? "Kasir"}`} backHref="/m/akun" />
      <div className="p-4 space-y-3">
        <div className="flex items-center h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3">
          <span className="material-symbols-outlined text-slate-400 mr-2">search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari panduan, mis. advice, setoran"
            className="flex-1 bg-transparent text-base outline-none"
            aria-label="Cari panduan"
          />
        </div>

        <div className="flex gap-2" role="group" aria-label="Filter peran">
          {[
            { key: false, label: "Untuk saya" },
            { key: true, label: "Semua peran" },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setAllRoles(opt.key)}
              aria-pressed={allRoles === opt.key}
              className={`h-9 px-4 rounded-full text-sm font-medium ${
                allRoles === opt.key ? "bg-primary text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {totalShown === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-500">Tidak ada panduan yang cocok.</div>
        ) : (
          <ul className="space-y-3">
            {sections.map((s) => {
              // Saat mencari, semua bagian yang cocok langsung terbuka.
              const expanded = Boolean(q) || openSection === s.id;
              return (
                <li key={s.id} className="rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSection(expanded && !q ? null : s.id)}
                    aria-expanded={expanded}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <span className="material-symbols-outlined text-primary">{s.icon}</span>
                    <span className="flex-1 font-semibold">{s.title}</span>
                    <span className="text-xs text-slate-400">{s.features.length}</span>
                    <span className="material-symbols-outlined text-slate-400">{expanded ? "expand_less" : "expand_more"}</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      {s.intro && <p className="px-4 pt-3 text-sm text-slate-500">{s.intro}</p>}
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {s.features.map((f) => (
                          <FeatureItem
                            key={f.id}
                            feature={f}
                            role={role}
                            open={openFeature === f.id}
                            onToggle={() => setOpenFeature(openFeature === f.id ? null : f.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FeatureItem({ feature: f, role, open, onToggle }: { feature: GuideFeature; role: GuideRole; open: boolean; onToggle: () => void }) {
  const mobileHref = f.href ? MOBILE_HREF[f.href] : undefined;
  const canOpen = mobileHref ? canAccessPage(role, mobileHref) : false;
  const desktopOnly = Boolean(f.href) && !mobileHref;

  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <span className="material-symbols-outlined text-slate-400 mt-0.5">{f.icon || "article"}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium">{f.title}</span>
          {!open && <span className="block text-sm text-slate-500 line-clamp-2">{f.summary}</span>}
        </span>
        {desktopOnly && (
          <span className="shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800">
            Desktop
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pl-12 space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">{f.summary}</p>
          {f.steps && f.steps.length > 0 && (
            <ol className="list-decimal pl-5 space-y-1">
              {f.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {f.notes && f.notes.length > 0 && (
            <ul className="space-y-1">
              {f.notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-slate-500">
                  <span className="material-symbols-outlined text-base text-amber-500">info</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1">
            {f.roles.map((r) => (
              <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {ROLE_NAMES[r]}
              </span>
            ))}
          </div>
          {canOpen && mobileHref ? (
            <Link href={mobileHref} className="inline-flex items-center gap-1 text-primary font-medium">
              Buka halaman
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          ) : desktopOnly ? (
            <p className="text-xs text-slate-500">Fitur ini hanya tersedia di versi desktop.</p>
          ) : null}
        </div>
      )}
    </li>
  );
}
