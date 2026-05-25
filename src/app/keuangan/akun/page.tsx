"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Account {
  code: string;
  name: string;
  accountType: string;
  normalBalance: "DEBIT" | "CREDIT";
  parentCode: string | null;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
}

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const TYPE_LABEL: Record<string, string> = {
  ASSET: "Aset",
  LIABILITY: "Kewajiban",
  EQUITY: "Ekuitas",
  INCOME: "Pendapatan",
  EXPENSE: "Beban",
};

export default function ChartOfAccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", accountType: "ASSET", parentCode: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keuangan/akun");
      const j = await res.json();
      setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/keuangan/akun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          accountType: form.accountType,
          parentCode: form.parentCode || null,
          description: form.description || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Gagal menyimpan");
      } else {
        setShowAdd(false);
        setForm({ code: "", name: "", accountType: "ASSET", parentCode: "", description: "" });
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (acc: Account) => {
    await fetch("/api/keuangan/akun", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: acc.code, isActive: !acc.isActive }),
    });
    load();
  };

  const grouped = items.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.accountType] = acc[a.accountType] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chart of Accounts</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90">+ Tambah Akun</button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Kode</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Normal</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Deskripsi</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">Memuat…</td></tr>
            ) : Object.entries(grouped).map(([type, list]) => (
              <React.Fragment key={type}>
                <tr className="bg-slate-100 dark:bg-slate-800 font-semibold">
                  <td colSpan={7} className="px-3 py-2 text-xs uppercase tracking-wider">{TYPE_LABEL[type] || type}</td>
                </tr>
                {list.map((a) => (
                  <tr key={a.code} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}{a.isSystem && <span className="ml-2 text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">system</span>}</td>
                    <td className="px-3 py-2 text-xs">{a.normalBalance}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.parentCode || "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-xs truncate">{a.description}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${a.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {a.isActive ? "aktif" : "nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {!a.isSystem && (
                        <button onClick={() => toggleActive(a)} className="text-xs text-primary hover:underline">
                          {a.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Tambah Akun</h3>
            {error && <div className="mb-3 text-sm text-rose-600 bg-rose-50 p-2 rounded">{error}</div>}
            <div className="space-y-3">
              <Field label="Kode (mis. 1103)">
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
              </Field>
              <Field label="Nama Akun">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
              </Field>
              <Field label="Tipe">
                <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary">
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </Field>
              <Field label="Parent (opsional)">
                <input value={form.parentCode} onChange={(e) => setForm({ ...form, parentCode: e.target.value })} className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 text-sm outline-none focus:border-primary" />
              </Field>
              <Field label="Deskripsi (opsional)">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-primary resize-none" rows={2} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
              <button onClick={submit} disabled={saving || !form.code || !form.name} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid rgb(226 232 240); background: white; font-size: 0.875rem; }
        :global(.dark) .input { background: rgb(15 23 42); border-color: rgb(51 65 85); color: white; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
