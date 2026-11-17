"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { MOBILE_PRODUCTS, findMobileProduct, formatRp, lunasinServiceType } from "@/lib/mobile/products";
import { PDAM_KALIMANTAN } from "@/data/lunasin-products";

interface Customer {
  id: number;
  productSlug: string;
  productCode: string;
  customerId: string;
  customerName: string | null;
  aliasName: string | null;
  waNumber: string | null;
  note: string | null;
  lastPaidAt: string | null;
}

/** Produk tagihan yang bisa dicek massal (pembelian seperti token/pulsa tidak punya "tagihan"). */
const BILL_SLUGS = new Set(["pdam", "pln-pasca", "bpjs", "telkom", "pdam-lain"]);

type CheckResult =
  | { state: "checking" }
  | { state: "bill"; total: number; count: number; name: string; pending: boolean }
  | { state: "none"; message: string }
  | { state: "error"; message: string };

const CHECK_CACHE = "m_pelanggan_check";
const CHECK_TTL_MS = 10 * 60 * 1000;
const NO_BILL_RE = /tidak ada tagihan|belum ada tagihan|sudah lunas|lunas|no bill|tagihan tidak ditemukan/i;

function displayName(c: Customer) {
  return c.aliasName || c.customerName || c.customerId;
}

function payHref(c: Customer) {
  const q = new URLSearchParams({ id: c.customerId, from: "pelanggan" });
  if (c.productCode) q.set("pdam", c.productCode);
  if (c.waNumber) q.set("wa", c.waNumber);
  return `/m/bayar/${c.productSlug}?${q.toString()}`;
}

export default function MobilePelangganPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [onlyBills, setOnlyBills] = useState(false);
  const [checks, setChecks] = useState<Record<number, CheckResult>>({});
  const [checkingAll, setCheckingAll] = useState<{ done: number; total: number } | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/m/pelanggan");
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Gagal memuat pelanggan");
        return;
      }
      setCustomers(j.customers || []);
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Hasil "cek semua" terakhir tetap tampil saat kembali ke halaman ini (maks. 10 menit)
    try {
      const cached = JSON.parse(sessionStorage.getItem(CHECK_CACHE) || "null");
      if (cached && Date.now() - cached.at < CHECK_TTL_MS) {
        setChecks(cached.checks);
        setCheckedAt(cached.at);
      }
    } catch {
      /* abaikan */
    }
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== "all" && c.productSlug !== filter) return false;
      if (onlyBills && checks[c.id]?.state !== "bill") return false;
      if (!q) return true;
      return [c.aliasName, c.customerName, c.customerId, c.note].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [customers, filter, onlyBills, checks, search]);

  const productsPresent = useMemo(() => {
    const set = new Set(customers.map((c) => c.productSlug));
    return MOBILE_PRODUCTS.filter((p) => set.has(p.slug));
  }, [customers]);

  /** Cek tagihan satu pelanggan lewat endpoint inquiry yang sama dengan halaman Bayar. */
  async function checkOne(c: Customer): Promise<{ result: CheckResult; pendingCandidates: Array<Record<string, unknown>> }> {
    const product = findMobileProduct(c.productSlug);
    try {
      if (c.productSlug === "pdam") {
        const res = await fetch("/api/pembayaran/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idpel: c.customerId }),
        });
        const j = await res.json();
        if (!res.ok) {
          const msg = String(j.error || "Gagal cek tagihan");
          return { result: NO_BILL_RE.test(msg) ? { state: "none", message: msg } : { state: "error", message: msg }, pendingCandidates: [] };
        }
        const rows: Array<Record<string, string>> = j.data || [];
        if (rows.length === 0) return { result: { state: "none", message: "Tidak ada tagihan" }, pendingCandidates: [] };
        const admin = Number(j.adminFee || 0);
        const total = rows.reduce((s, r) => s + (Number(r.total) || 0) + admin, 0);
        return {
          result: { state: "bill", total, count: rows.length, name: rows[0].nama || "", pending: false },
          pendingCandidates: rows.map((r, i) => ({ key: `${c.id}:${i}`, provider: "PDAM", serviceType: "PDAM_NATIVE", customerId: c.customerId, periodLabel: r.thbln })),
        };
      }
      const kodeProduk = c.productSlug === "pdam-lain" ? c.productCode : product?.baseCode || "";
      const res = await fetch("/api/pembayaran/lunasin/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idpel: c.customerId, kodeProduk }),
      });
      const j = await res.json();
      if (!res.ok || !j.data) {
        const msg = String(j.error || "Gagal cek tagihan");
        return { result: NO_BILL_RE.test(msg) ? { state: "none", message: msg } : { state: "error", message: msg }, pendingCandidates: [] };
      }
      const d = j.data;
      const resolved = String(j.kodeProduk || kodeProduk);
      return {
        result: { state: "bill", total: Number(d.rp_total) || 0, count: Number(d.jum_bill || 1), name: String(d.nama || ""), pending: false },
        pendingCandidates: [
          {
            key: `${c.id}:0`,
            provider: "LUNASIN",
            serviceType: lunasinServiceType(resolved),
            customerId: c.customerId,
            periodLabel: String(d.periode || d.jenis_reg || resolved),
          },
        ],
      };
    } catch {
      return { result: { state: "error", message: "Koneksi terputus" }, pendingCandidates: [] };
    }
  }

  async function checkAll() {
    const targets = visible.filter((c) => BILL_SLUGS.has(c.productSlug));
    if (targets.length === 0) return;
    cancelRef.current = false;
    setCheckingAll({ done: 0, total: targets.length });
    const next: Record<number, CheckResult> = { ...checks };
    for (const c of targets) next[c.id] = { state: "checking" };
    setChecks({ ...next });

    const candidates: Array<Record<string, unknown>> = [];
    let done = 0;
    let idx = 0;
    // 2 permintaan bersamaan — cukup cepat tanpa membebani provider
    const worker = async () => {
      while (!cancelRef.current && idx < targets.length) {
        const c = targets[idx++];
        const { result, pendingCandidates } = await checkOne(c);
        next[c.id] = result;
        candidates.push(...pendingCandidates);
        done += 1;
        setChecks({ ...next });
        setCheckingAll({ done, total: targets.length });
        // Simpan nama dari provider bila belum ada
        if (result.state === "bill" && result.name && !c.customerName) {
          fetch("/api/m/pelanggan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productSlug: c.productSlug, productCode: c.productCode, customerId: c.customerId, customerName: result.name }),
          }).catch(() => {});
        }
      }
    };
    await Promise.all([worker(), worker()]);

    // Tandai tagihan yang masih menunggu konfirmasi pembayaran sebelumnya (tidak boleh dibayar ulang)
    if (candidates.length > 0) {
      try {
        const res = await fetch("/api/pembayaran/cek-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: candidates }),
        });
        if (res.ok) {
          const j = await res.json();
          for (const p of j.pending || []) {
            const id = Number(String(p.key).split(":")[0]);
            const r = next[id];
            if (r && r.state === "bill") next[id] = { ...r, pending: true };
          }
        }
      } catch {
        /* tanpa tanda pending — server tetap menolak pembayaran ganda */
      }
    }
    setChecks({ ...next });
    setCheckingAll(null);
    const at = Date.now();
    setCheckedAt(at);
    try {
      sessionStorage.setItem(CHECK_CACHE, JSON.stringify({ at, checks: next }));
    } catch {
      /* abaikan */
    }
    if (customers.some((c) => !c.customerName)) load();
  }

  const billCount = Object.values(checks).filter((r) => r.state === "bill" && !r.pending).length;
  const billTotal = Object.values(checks).reduce((s, r) => s + (r.state === "bill" && !r.pending ? r.total : 0), 0);
  const checkable = visible.filter((c) => BILL_SLUGS.has(c.productSlug)).length;

  return (
    <div>
      <MobileHeader
        title="Pelanggan saya"
        subtitle={loading ? "Memuat…" : `${customers.length} pelanggan`}
        backHref="/m"
        right={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="h-10 w-10 rounded-full flex items-center justify-center bg-primary text-white"
            aria-label="Tambah pelanggan"
          >
            <span className="material-symbols-outlined">person_add</span>
          </button>
        }
      />

      <div className="px-4 pt-3 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, alias, ID, atau catatan"
          className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
        />
        {productsPresent.length > 1 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>Semua</Chip>
            {productsPresent.map((p) => (
              <Chip key={p.slug} active={filter === p.slug} onClick={() => setFilter(p.slug)}>{p.shortLabel}</Chip>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 pb-8">
        {/* Cek semua tagihan */}
        {checkable > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
            {checkingAll ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Mengecek tagihan…</span>
                  <span>{checkingAll.done}/{checkingAll.total}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(checkingAll.done / checkingAll.total) * 100}%` }} />
                </div>
                <button type="button" onClick={() => (cancelRef.current = true)} className="mt-2 text-sm text-slate-500 underline">Hentikan</button>
              </>
            ) : (
              <>
                <button type="button" onClick={checkAll} className="w-full h-12 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">fact_check</span>
                  Cek semua tagihan ({checkable})
                </button>
                {checkedAt && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-sm">
                      <b>{billCount}</b> pelanggan punya tagihan · <b>{formatRp(billTotal)}</b>
                      <span className="block text-[11px] text-slate-500">
                        Dicek {new Date(checkedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </p>
                    <label className="flex items-center gap-1.5 text-sm shrink-0">
                      <input type="checkbox" checked={onlyBills} onChange={(e) => setOnlyBills(e.target.checked)} className="h-4 w-4" />
                      Ada tagihan
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>}

        {!loading && customers.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-5xl">group</span>
            <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">Belum ada pelanggan</p>
            <p className="text-sm mt-1 max-w-xs mx-auto">
              Tambahkan pelanggan tetap Anda, atau tekan &quot;Simpan ke Pelanggan saya&quot; setelah pembayaran lunas.
            </p>
            <button type="button" onClick={() => setEditing("new")} className="mt-4 h-11 px-5 rounded-xl bg-primary text-white font-semibold">
              Tambah pelanggan
            </button>
          </div>
        )}

        {visible.length > 0 && (
          <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {visible.map((c) => {
              const p = findMobileProduct(c.productSlug);
              const r = checks[c.id];
              return (
                <li key={c.id} className="flex items-stretch">
                  <Link href={payHref(c)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
                    <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${p?.tone || "bg-slate-100"}`}>
                      <span className="material-symbols-outlined text-xl">{p?.icon || "person"}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayName(c)}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {p?.shortLabel} · {c.customerId}
                        {c.aliasName && c.customerName ? ` · ${c.customerName}` : ""}
                      </p>
                      {c.note && <p className="text-[11px] text-slate-400 truncate">{c.note}</p>}
                      <CheckBadge r={r} lastPaidAt={c.lastPaidAt} />
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="w-11 shrink-0 flex items-center justify-center text-slate-400 active:bg-slate-50 dark:active:bg-slate-800"
                    aria-label={`Ubah ${displayName(c)}`}
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <CustomerSheet
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CheckBadge({ r, lastPaidAt }: { r: CheckResult | undefined; lastPaidAt: string | null }) {
  if (!r) {
    return lastPaidAt ? (
      <p className="text-[11px] text-slate-400 mt-0.5">
        Terakhir bayar {new Date(lastPaidAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
      </p>
    ) : null;
  }
  if (r.state === "checking") return <p className="text-[11px] text-slate-500 mt-0.5">Mengecek…</p>;
  if (r.state === "bill" && r.pending) {
    return <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">Masih menunggu konfirmasi pembayaran sebelumnya</p>;
  }
  if (r.state === "bill") {
    return (
      <p className="text-xs font-semibold text-red-600 mt-0.5">
        Ada tagihan {formatRp(r.total)}{r.count > 1 ? ` · ${r.count} bulan` : ""}
      </p>
    );
  }
  if (r.state === "none") return <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">Tidak ada tagihan</p>;
  return <p className="text-[11px] text-slate-500 mt-0.5 truncate">Gagal cek: {r.message}</p>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium border ${
        active ? "bg-primary text-white border-primary" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Lembar bawah tambah / ubah / hapus pelanggan. */
function CustomerSheet({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !customer;
  const [productSlug, setProductSlug] = useState(customer?.productSlug || "pdam");
  const [productCode, setProductCode] = useState(customer?.productCode || "");
  const [customerId, setCustomerId] = useState(customer?.customerId || "");
  const [aliasName, setAliasName] = useState(customer?.aliasName || "");
  const [waNumber, setWaNumber] = useState(customer?.waNumber || "");
  const [note, setNote] = useState(customer?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = isNew
        ? await fetch("/api/m/pelanggan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productSlug, productCode, customerId: customerId.trim(), aliasName, waNumber, note }),
          })
        : await fetch(`/api/m/pelanggan?id=${customer!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aliasName, waNumber, note }),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Gagal menyimpan");
        return;
      }
      onSaved();
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!customer) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/m/pelanggan?id=${customer.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Gagal menghapus");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3"
      >
        <p className="text-lg font-bold">{isNew ? "Tambah pelanggan" : displayName(customer!)}</p>
        {isNew ? (
          <>
            <label className="block">
              <span className="text-sm font-medium">Produk</span>
              <select value={productSlug} onChange={(e) => setProductSlug(e.target.value)} className={input}>
                {MOBILE_PRODUCTS.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.label}</option>
                ))}
              </select>
            </label>
            {productSlug === "pdam-lain" && (
              <label className="block">
                <span className="text-sm font-medium">PDAM</span>
                <select value={productCode} onChange={(e) => setProductCode(e.target.value)} className={input} required>
                  <option value="">Pilih PDAM…</option>
                  {PDAM_KALIMANTAN.map((p) => (
                    <option key={p.code} value={p.code}>{p.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium">{findMobileProduct(productSlug)?.inputLabel || "ID pelanggan"}</span>
              <input
                inputMode="numeric"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value.replace(/\s/g, ""))}
                className={input}
                required
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {findMobileProduct(customer!.productSlug)?.label} · {customer!.customerId}
            {customer!.customerName ? ` · ${customer!.customerName}` : ""}
          </p>
        )}
        <label className="block">
          <span className="text-sm font-medium">Nama panggilan (opsional)</span>
          <input value={aliasName} onChange={(e) => setAliasName(e.target.value)} placeholder="mis. Bu Siti warung" maxLength={100} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">No. WhatsApp (opsional)</span>
          <input inputMode="tel" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} placeholder="08xxxxxxxxxx" className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Catatan / alamat (opsional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Gang Mawar no. 5, RT 03" maxLength={255} className={input} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">Batal</button>
          <button type="submit" disabled={busy} className="h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-50">
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
        {!isNew &&
          (confirmDelete ? (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm">
              <p>Hapus dari daftar? Riwayat transaksi pelanggan ini tidak ikut terhapus.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={remove} disabled={busy} className="h-9 px-4 rounded-lg bg-red-600 text-white font-semibold">Hapus</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 px-4 rounded-lg font-semibold">Batal</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="w-full h-10 text-sm text-red-600 font-semibold">
              Hapus dari daftar
            </button>
          ))}
      </form>
    </div>
  );
}
