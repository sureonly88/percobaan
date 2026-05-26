"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

interface Rule {
  id: number;
  name: string;
  scope: "GLOBAL" | "LOKET" | "PROVIDER" | "LOKET_PROVIDER";
  loketCode: string | null;
  provider: string | null;
  serviceType: string | null;
  target: "KASIR" | "LOKET";
  type: "PERCENT" | "FLAT";
  value: number;
  basis: "AMOUNT" | "ADMIN_FEE" | "TOTAL";
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
}

interface LoketLite {
  loket_code: string;
  nama: string;
}

const PROVIDERS = ["PDAM", "LUNASIN", "PLN", "TELKOM", "BPJS", "PULSA"] as const;

const emptyForm = {
  id: 0,
  name: "",
  scope: "GLOBAL" as Rule["scope"],
  loketCode: "",
  provider: "",
  serviceType: "",
  target: "KASIR" as Rule["target"],
  type: "PERCENT" as Rule["type"],
  value: 0,
  basis: "ADMIN_FEE" as Rule["basis"],
  minAmount: "",
  maxAmount: "",
  priority: 100,
  isActive: true,
  validFrom: "",
  validTo: "",
  notes: "",
};

function formatRupiah(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function describeRule(r: Rule) {
  const parts: string[] = [];
  if (r.scope === "GLOBAL") parts.push("Semua loket & provider");
  if (r.loketCode) parts.push(`Loket ${r.loketCode}`);
  if (r.provider) parts.push(`Provider ${r.provider}`);
  if (r.serviceType) parts.push(`Service ${r.serviceType}`);
  return parts.join(" · ");
}

export default function PengaturanKomisiPage() {
  const [items, setItems] = useState<Rule[]>([]);
  const [lokets, setLokets] = useState<LoketLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterTarget, setFilterTarget] = useState("");
  const [filterActive, setFilterActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (filterActive) sp.set("activeOnly", "1");
      if (filterTarget) sp.set("target", filterTarget);
      const res = await fetch(`/api/keuangan/komisi/rules?${sp.toString()}`);
      const j = await res.json();
      setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterActive, filterTarget]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/loket")
      .then((r) => r.json())
      .then((j) => setLokets(Array.isArray(j?.lokets) ? j.lokets : Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : []))
      .catch(() => undefined);
  }, []);

  const startNew = () => {
    setForm({ ...emptyForm });
    setError("");
    setShowForm(true);
  };

  const startEdit = (r: Rule) => {
    setForm({
      id: r.id,
      name: r.name,
      scope: r.scope,
      loketCode: r.loketCode || "",
      provider: r.provider || "",
      serviceType: r.serviceType || "",
      target: r.target,
      type: r.type,
      value: r.value,
      basis: r.basis,
      minAmount: r.minAmount != null ? String(r.minAmount) : "",
      maxAmount: r.maxAmount != null ? String(r.maxAmount) : "",
      priority: r.priority,
      isActive: r.isActive,
      validFrom: r.validFrom || "",
      validTo: r.validTo || "",
      notes: r.notes || "",
    });
    setError("");
    setShowForm(true);
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const body = {
        ...form,
        value: Number(form.value),
        priority: Number(form.priority) || 100,
        minAmount: form.minAmount === "" ? null : Number(form.minAmount),
        maxAmount: form.maxAmount === "" ? null : Number(form.maxAmount),
        loketCode: form.loketCode || null,
        provider: form.provider || null,
        serviceType: form.serviceType || null,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        notes: form.notes || null,
      };
      const isEdit = form.id > 0;
      const res = await fetch("/api/keuangan/komisi/rules", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Gagal menyimpan");
        return;
      }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Nonaktifkan rule ini? Data historis komisi tetap tersimpan.")) return;
    await fetch(`/api/keuangan/komisi/rules?id=${id}`, { method: "DELETE" });
    load();
  };

  const filtered = useMemo(() => items, [items]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">redeem</span>
            Aturan Komisi / Profit Sharing
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Atur komisi per transaksi untuk kasir dan loket (franchise). Rule paling spesifik menang otomatis.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/keuangan/komisi/laporan"
            className="h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-base">analytics</span>
            Laporan Komisi
          </a>
          <button
            onClick={startNew}
            className="h-11 px-4 rounded-lg bg-primary text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Aturan Baru
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
        <label className="text-xs font-semibold text-slate-500">Filter Target</label>
        <select
          value={filterTarget}
          onChange={(e) => setFilterTarget(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-2 text-sm"
        >
          <option value="">Semua</option>
          <option value="KASIR">Kasir</option>
          <option value="LOKET">Loket</option>
        </select>
        <label className="text-xs font-semibold text-slate-500 ml-2 flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filterActive}
            onChange={(e) => setFilterActive(e.target.checked)}
          />
          Hanya aktif
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2.5">Nama</th>
                <th className="text-left px-3 py-2.5">Cakupan</th>
                <th className="text-left px-3 py-2.5">Target</th>
                <th className="text-left px-3 py-2.5">Tipe</th>
                <th className="text-right px-3 py-2.5">Nilai</th>
                <th className="text-left px-3 py-2.5">Basis</th>
                <th className="text-right px-3 py-2.5">Min / Max</th>
                <th className="text-right px-3 py-2.5">Prio</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-6 text-slate-400">Memuat...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-6 text-slate-400">Belum ada aturan komisi</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                    {r.name}
                    {r.notes && <div className="text-xs text-slate-400 font-normal">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{describeRule(r)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      r.target === "KASIR"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    }`}>{r.target}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{r.type}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {r.type === "PERCENT" ? `${r.value}%` : formatRupiah(r.value)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.basis}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-500">
                    {r.minAmount != null ? formatRupiah(r.minAmount) : "—"}
                    <span className="text-slate-300"> / </span>
                    {r.maxAmount != null ? formatRupiah(r.maxAmount) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.priority}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      r.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}>{r.isActive ? "Aktif" : "Nonaktif"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => startEdit(r)}
                        className="h-8 px-2 rounded-md text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="h-8 px-2 rounded-md text-xs border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30"
                      >
                        Nonaktifkan
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {form.id > 0 ? "Edit Aturan Komisi" : "Aturan Komisi Baru"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Nama Aturan *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Misal: Komisi kasir PDAM 10%"
                  className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Target *</label>
                  <select
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value as Rule["target"] })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  >
                    <option value="KASIR">Kasir (user)</option>
                    <option value="LOKET">Loket (franchise)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Cakupan *</label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as Rule["scope"] })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  >
                    <option value="GLOBAL">Global (semua)</option>
                    <option value="LOKET">Per Loket</option>
                    <option value="PROVIDER">Per Provider</option>
                    <option value="LOKET_PROVIDER">Loket + Provider</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(form.scope === "LOKET" || form.scope === "LOKET_PROVIDER") && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Loket *</label>
                    <select
                      value={form.loketCode}
                      onChange={(e) => setForm({ ...form, loketCode: e.target.value })}
                      className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                    >
                      <option value="">-- Pilih Loket --</option>
                      {lokets.map((l) => (
                        <option key={l.loket_code} value={l.loket_code}>{l.loket_code} — {l.nama}</option>
                      ))}
                    </select>
                  </div>
                )}
                {(form.scope === "PROVIDER" || form.scope === "LOKET_PROVIDER") && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Provider *</label>
                    <select
                      value={form.provider}
                      onChange={(e) => setForm({ ...form, provider: e.target.value })}
                      className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                    >
                      <option value="">-- Pilih Provider --</option>
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tipe *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Rule["type"] })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  >
                    <option value="PERCENT">Persentase (%)</option>
                    <option value="FLAT">Flat (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    {form.type === "PERCENT" ? "Nilai (%)" : "Nilai (Rp)"} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Basis Hitung *</label>
                  <select
                    value={form.basis}
                    onChange={(e) => setForm({ ...form, basis: e.target.value as Rule["basis"] })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  >
                    <option value="ADMIN_FEE">Biaya Admin</option>
                    <option value="AMOUNT">Pokok Tagihan</option>
                    <option value="TOTAL">Total Bayar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Min Komisi (Rp)</label>
                  <input
                    type="number"
                    value={form.minAmount}
                    onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
                    placeholder="opsional"
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Max Komisi (Rp)</label>
                  <input
                    type="number"
                    value={form.maxAmount}
                    onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
                    placeholder="opsional"
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Priority</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Berlaku Dari</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Berlaku Sampai</label>
                  <input
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Catatan</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Aturan aktif
              </label>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowForm(false)}
                className="h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="h-11 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Menyimpan..." : form.id > 0 ? "Update" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
