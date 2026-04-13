"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ───────── Types ─────────

interface TableInfo {
  TABLE_NAME: string;
  TABLE_ROWS: number;
  DATA_SIZE: number;
}

interface ColumnInfo {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
}

interface TableData {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
  columns: ColumnInfo[];
}

interface SqlResult {
  type: "SELECT" | "MODIFY";
  columns?: string[];
  rows?: Record<string, unknown>[];
  count?: number;
  affectedRows?: number;
  message?: string;
}

// ───────── Helpers ─────────

function parseEnumOptions(columnType: string): string[] {
  const m = columnType.match(/^enum\((.+)\)$/i);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim().replace(/^'|'$/g, ""));
}

function getInputType(col: ColumnInfo): string {
  const dt = col.DATA_TYPE.toLowerCase();
  const ct = col.COLUMN_TYPE.toLowerCase();
  if (ct === "tinyint(1)") return "checkbox";
  if (["int","bigint","smallint","mediumint"].includes(dt)) return "number";
  if (["decimal","float","double"].includes(dt)) return "number";
  if (dt === "date") return "date";
  if (["datetime","timestamp"].includes(dt)) return "datetime-local";
  if (dt === "enum") return "select";
  if (["text","mediumtext","longtext","tinytext","json","blob","mediumblob","longblob"].includes(dt)) return "textarea";
  return "text";
}

function isGenerated(col: ColumnInfo): boolean {
  return (col.EXTRA || "").includes("GENERATED");
}

function isAutoIncrement(col: ColumnInfo): boolean {
  return (col.EXTRA || "").includes("auto_increment");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getPkWhere(columns: ColumnInfo[], row: Record<string, unknown>): Record<string, unknown> {
  const pkCols = columns.filter(c => c.COLUMN_KEY === "PRI");
  const useCols = pkCols.length > 0 ? pkCols : columns;
  return Object.fromEntries(useCols.map(c => [c.COLUMN_NAME, row[c.COLUMN_NAME]]));
}

function formatCellValue(val: unknown): { text: string; isNull: boolean; isLong: boolean } {
  if (val === null || val === undefined) return { text: "NULL", isNull: true, isLong: false };
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  const isLong = str.length > 100;
  return { text: isLong ? str.slice(0, 100) + "…" : str, isNull: false, isLong };
}

function authHeader(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ───────── Password Gate ─────────

function PasswordGate({ onAuth }: { onAuth: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/db-manage/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal"); return; }
      sessionStorage.setItem("db-manage-token", data.token);
      onAuth(data.token);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4 p-8">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-3xl">database</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">DB Manager</h1>
          <p className="text-sm text-slate-500 text-center">Masukkan password untuk mengakses manajemen database</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="MANAGE_DB_PASS"
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm transition-colors"
          >
            {loading ? "Memverifikasi…" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ───────── Cell Value Display ─────────

function CellValue({ val }: { val: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const { text, isNull, isLong } = formatCellValue(val);

  if (isNull) {
    return <span className="italic text-slate-400 text-xs">NULL</span>;
  }

  const fullStr = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);

  return (
    <span className="font-mono text-xs">
      {expanded ? fullStr : text}
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-1 text-primary underline text-xs"
        >
          {expanded ? "Ringkas" : "Selengkapnya"}
        </button>
      )}
    </span>
  );
}

// ───────── Row Form Modal ─────────

function RowFormModal({
  columns,
  initialData,
  isAdd,
  tableName,
  onClose,
  onSaved,
  token,
}: {
  columns: ColumnInfo[];
  initialData: Record<string, unknown> | null;
  isAdd: boolean;
  tableName: string;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const col of columns) {
      if (isGenerated(col)) continue;
      const v = initialData?.[col.COLUMN_NAME];
      init[col.COLUMN_NAME] = v === null || v === undefined ? "" : String(v);
    }
    return init;
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      if (isAdd) {
        const res = await fetch(`/api/db-manage/tables/${tableName}`, {
          method: "POST",
          headers: authHeader(token),
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Gagal"); return; }
      } else {
        const where = getPkWhere(columns, initialData!);
        const res = await fetch(`/api/db-manage/tables/${tableName}`, {
          method: "PUT",
          headers: authHeader(token),
          body: JSON.stringify({ where, data: formData }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Gagal"); return; }
      }
      onSaved();
    } catch {
      setError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const editableCols = columns.filter(c => !isGenerated(c));

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="font-bold text-slate-900 dark:text-white">
            {isAdd ? "Tambah Baris Baru" : "Edit Baris"} — <span className="font-mono text-primary">{tableName}</span>
          </h3>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-400">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {editableCols.map(col => {
            const inputType = getInputType(col);
            const isAuto = isAutoIncrement(col);
            const label = (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">{col.COLUMN_NAME}</span>
                <span className="text-[10px] text-slate-400">{col.COLUMN_TYPE}</span>
                {col.COLUMN_KEY === "PRI" && <span className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1 rounded">PK</span>}
                {isAuto && <span className="text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-700 px-1 rounded">auto</span>}
                {col.IS_NULLABLE === "YES" && <span className="text-[10px] text-slate-400">nullable</span>}
              </div>
            );

            if (inputType === "checkbox") {
              return (
                <div key={col.COLUMN_NAME}>
                  {label}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData[col.COLUMN_NAME] === "1"}
                      onChange={e => setFormData(prev => ({ ...prev, [col.COLUMN_NAME]: e.target.checked ? "1" : "0" }))}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{formData[col.COLUMN_NAME] === "1" ? "true (1)" : "false (0)"}</span>
                  </label>
                </div>
              );
            }

            if (inputType === "select") {
              const opts = parseEnumOptions(col.COLUMN_TYPE);
              return (
                <div key={col.COLUMN_NAME}>
                  {label}
                  <select
                    value={formData[col.COLUMN_NAME]}
                    onChange={e => setFormData(prev => ({ ...prev, [col.COLUMN_NAME]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {col.IS_NULLABLE === "YES" && <option value="">NULL</option>}
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }

            if (inputType === "textarea") {
              return (
                <div key={col.COLUMN_NAME}>
                  {label}
                  <textarea
                    value={formData[col.COLUMN_NAME]}
                    onChange={e => setFormData(prev => ({ ...prev, [col.COLUMN_NAME]: e.target.value }))}
                    placeholder={isAuto && isAdd ? "Kosongkan untuk auto" : col.IS_NULLABLE === "YES" ? "NULL" : ""}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />
                </div>
              );
            }

            return (
              <div key={col.COLUMN_NAME}>
                {label}
                <input
                  type={inputType}
                  step={inputType === "number" && ["decimal","float","double"].includes(col.DATA_TYPE.toLowerCase()) ? "any" : undefined}
                  value={formData[col.COLUMN_NAME]}
                  onChange={e => setFormData(prev => ({ ...prev, [col.COLUMN_NAME]: e.target.value }))}
                  placeholder={isAuto && isAdd ? "Kosongkan untuk auto" : col.IS_NULLABLE === "YES" ? "NULL" : ""}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            );
          })}
        </div>
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Batal</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {saving ? "Menyimpan…" : isAdd ? "Simpan" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────── Main Page ─────────

export default function DbManagePage() {
  const [token, setToken] = useState<string | null>(null);

  // Tables list
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState("");

  // Selected table + data
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  // Filters / pagination / sort
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("ASC");

  // Modals
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // SQL mode
  const [sqlMode, setSqlMode] = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);
  const [sqlError, setSqlError] = useState("");
  const [sqlLoading, setSqlLoading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load token from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("db-manage-token");
    if (saved) setToken(saved);
  }, []);

  // ── Fetch tables list
  const fetchTables = useCallback(async (t: string) => {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/db-manage/tables", { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (res.ok) setTables(data.tables || []);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchTables(token);
  }, [token, fetchTables]);

  // ── Fetch table rows
  const fetchTableData = useCallback(async (
    t: string, table: string, pg: number, lim: number,
    srch: string, sc: string, sd: string
  ) => {
    setDataLoading(true);
    setDataError("");
    try {
      const params = new URLSearchParams({
        page: String(pg), limit: String(lim),
        ...(srch ? { search: srch } : {}),
        ...(sc ? { sort: sc, dir: sd } : {}),
      });
      const res = await fetch(`/api/db-manage/tables/${table}?${params}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!res.ok) { setDataError(data.error || "Gagal"); return; }
      setTableData(data);
    } catch {
      setDataError("Gagal memuat data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Refetch when filters change
  useEffect(() => {
    if (token && selectedTable) {
      fetchTableData(token, selectedTable, page, limit, search, sortCol, sortDir);
    }
  }, [token, selectedTable, page, limit, search, sortCol, sortDir, fetchTableData]);

  // ── Select table
  function handleSelectTable(name: string) {
    if (name === selectedTable) return;
    setSqlMode(false);
    setSelectedTable(name);
    setTableData(null);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setSortCol("");
    setSortDir("ASC");
    setDataError("");
  }

  // ── Search with debounce
  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  }

  // ── Sort
  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === "ASC") setSortDir("DESC");
      else { setSortCol(""); setSortDir("ASC"); }
    } else {
      setSortCol(col);
      setSortDir("ASC");
    }
    setPage(1);
  }

  // ── Delete
  async function handleDeleteConfirm() {
    if (!deleteTarget || !selectedTable || !token || !tableData) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const where = getPkWhere(tableData.columns, deleteTarget);
      const res = await fetch(`/api/db-manage/tables/${selectedTable}`, {
        method: "DELETE",
        headers: authHeader(token),
        body: JSON.stringify({ where }),
      });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error || "Gagal"); return; }
      setDeleteTarget(null);
      fetchTableData(token, selectedTable, page, limit, search, sortCol, sortDir);
      fetchTables(token);
    } catch {
      setDeleteError("Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  }

  // ── SQL run
  async function handleRunSql() {
    if (!token || !sqlInput.trim()) return;
    setSqlLoading(true);
    setSqlError("");
    setSqlResult(null);
    try {
      const res = await fetch("/api/db-manage/query", {
        method: "POST",
        headers: authHeader(token),
        body: JSON.stringify({ sql: sqlInput }),
      });
      const data = await res.json();
      if (!res.ok) { setSqlError(data.error || "Gagal"); return; }
      setSqlResult(data);
      // Refresh tables list in case DDL was run
      fetchTables(token);
    } catch {
      setSqlError("Gagal menjalankan query");
    } finally {
      setSqlLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("db-manage-token");
    setToken(null);
  }

  // ── Render guard
  if (!token) {
    return <PasswordGate onAuth={setToken} />;
  }

  const filteredTables = tables.filter(t =>
    t.TABLE_NAME.toLowerCase().includes(tableFilter.toLowerCase())
  );

  const columns = tableData?.columns || [];
  const rows = tableData?.rows || [];

  return (
    <>
      {/* ── Add/Edit Modal ── */}
      {(isAdding || editRow !== null) && selectedTable && columns.length > 0 && (
        <RowFormModal
          columns={columns}
          initialData={editRow}
          isAdd={isAdding}
          tableName={selectedTable}
          token={token}
          onClose={() => { setIsAdding(false); setEditRow(null); }}
          onSaved={() => {
            setIsAdding(false);
            setEditRow(null);
            if (token && selectedTable) {
              fetchTableData(token, selectedTable, page, limit, search, sortCol, sortDir);
              fetchTables(token);
            }
          }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-600 text-xl">delete</span>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Hapus Baris?</p>
                <p className="text-sm text-slate-500">Tindakan ini tidak bisa dibatalkan.</p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 mb-4 text-xs font-mono space-y-1 max-h-40 overflow-y-auto">
              {columns.filter(c => c.COLUMN_KEY === "PRI").map(c => (
                <div key={c.COLUMN_NAME} className="flex gap-2">
                  <span className="text-slate-400 shrink-0">{c.COLUMN_NAME}:</span>
                  <span className="text-slate-700 dark:text-slate-200 break-all">{String(deleteTarget[c.COLUMN_NAME] ?? "NULL")}</span>
                </div>
              ))}
            </div>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Batal</button>
              <button onClick={handleDeleteConfirm} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                {deleting ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="-mx-4 lg:-mx-8 -mt-4 lg:-mt-8 flex border-t border-slate-200 dark:border-slate-700" style={{ minHeight: "calc(100vh - 8rem)" }}>

        {/* ── Sidebar: Table List ── */}
        <div className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col" style={{ minHeight: "calc(100vh - 8rem)" }}>
          {/* Sidebar header */}
          <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-600 text-xl">database</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">pedami_payment</p>
                <p className="text-[10px] text-slate-400">{tables.length} tabel</p>
              </div>
              <button onClick={handleLogout} title="Keluar" className="size-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors shrink-0">
                <span className="material-symbols-outlined text-base">logout</span>
              </button>
            </div>
            <input
              type="text"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              placeholder="Cari tabel…"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Table list */}
          <div className="flex-1 overflow-y-auto py-1">
            {tablesLoading ? (
              <div className="flex items-center justify-center h-16">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              filteredTables.map(t => (
                <button
                  key={t.TABLE_NAME}
                  onClick={() => handleSelectTable(t.TABLE_NAME)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    selectedTable === t.TABLE_NAME
                      ? "bg-primary/10 border-l-2 border-primary text-primary font-semibold"
                      : "text-slate-600 dark:text-slate-400 border-l-2 border-transparent"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm shrink-0 opacity-60">table_chart</span>
                  <span className="flex-1 truncate font-mono">{t.TABLE_NAME}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{Number(t.TABLE_ROWS).toLocaleString()}</span>
                </button>
              ))
            )}
          </div>

          {/* SQL Mode button */}
          <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              onClick={() => setSqlMode(m => !m)}
              className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                sqlMode
                  ? "bg-amber-600 text-white"
                  : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span className="material-symbols-outlined text-sm">code</span>
              SQL Query
            </button>
          </div>
        </div>

        {/* ── Right: Content ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* ── SQL Mode ── */}
          {sqlMode ? (
            <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600">code</span>
                  SQL Query
                </p>
                <textarea
                  value={sqlInput}
                  onChange={e => setSqlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRunSql(); }}
                  rows={6}
                  placeholder="SELECT * FROM multi_payment_items LIMIT 10;"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-400">Ctrl+Enter untuk menjalankan</p>
                  <button
                    onClick={handleRunSql}
                    disabled={sqlLoading || !sqlInput.trim()}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    {sqlLoading ? "Menjalankan…" : "Jalankan"}
                  </button>
                </div>
              </div>

              {sqlError && (
                <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-mono">
                  {sqlError}
                </div>
              )}

              {sqlResult && (
                <div>
                  {sqlResult.type === "MODIFY" ? (
                    <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-mono">
                      ✓ {sqlResult.message}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mb-2">{sqlResult.count} baris ditemukan</p>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              {(sqlResult.columns || []).map(c => (
                                <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {(sqlResult.rows || []).map((row, i) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-800/30"}>
                                {(sqlResult.columns || []).map(c => (
                                  <td key={c} className="px-3 py-2 max-w-[200px] truncate"><CellValue val={row[c]} /></td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          ) : !selectedTable ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <span className="material-symbols-outlined text-5xl">table_chart</span>
              <p className="text-sm">Pilih tabel dari sidebar untuk melihat data</p>
            </div>

          ) : (
            /* ── Table View ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Table toolbar */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-lg shrink-0">table_chart</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white truncate">{selectedTable}</span>
                  {tableData && (
                    <span className="text-xs text-slate-400 shrink-0">
                      {tableData.total.toLocaleString()} baris
                      {tables.find(t => t.TABLE_NAME === selectedTable)?.DATA_SIZE
                        ? ` · ${formatSize(Number(tables.find(t => t.TABLE_NAME === selectedTable)?.DATA_SIZE))}`
                        : ""}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-[140px] max-w-xs relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Cari…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <select
                    value={limit}
                    onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                    className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button
                    onClick={() => token && fetchTableData(token, selectedTable, page, limit, search, sortCol, sortDir)}
                    title="Refresh"
                    className="size-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">refresh</span>
                  </button>
                  <button
                    onClick={() => setIsAdding(true)}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Tambah
                  </button>
                </div>
              </div>

              {/* Data table */}
              <div className="flex-1 overflow-auto">
                {dataLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : dataError ? (
                  <div className="p-6 text-red-600 dark:text-red-400 text-sm">{dataError}</div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2.5 text-left text-slate-400 font-semibold whitespace-nowrap w-16">Aksi</th>
                        {columns.map(col => (
                          <th
                            key={col.COLUMN_NAME}
                            onClick={() => handleSort(col.COLUMN_NAME)}
                            className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <span className="flex items-center gap-1">
                              <span className="font-mono">{col.COLUMN_NAME}</span>
                              {col.COLUMN_KEY === "PRI" && <span className="text-yellow-500 text-[10px]">🔑</span>}
                              {isGenerated(col) && <span className="text-[10px] text-slate-400">[gen]</span>}
                              {sortCol === col.COLUMN_NAME && (
                                <span className="material-symbols-outlined text-primary text-sm">
                                  {sortDir === "ASC" ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal font-sans">{col.COLUMN_TYPE}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-slate-400">
                            {search ? "Tidak ada hasil yang cocok" : "Tabel kosong"}
                          </td>
                        </tr>
                      ) : rows.map((row, i) => (
                        <tr
                          key={i}
                          className={`group hover:bg-primary/5 transition-colors ${i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-800/20"}`}
                        >
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditRow(row)}
                                title="Edit"
                                className="size-6 rounded flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              >
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                              <button
                                onClick={() => { setDeleteTarget(row); setDeleteError(""); }}
                                title="Hapus"
                                className="size-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </div>
                          </td>
                          {columns.map(col => (
                            <td key={col.COLUMN_NAME} className="px-3 py-1.5 max-w-[240px]">
                              <CellValue val={row[col.COLUMN_NAME]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {tableData && tableData.pages > 1 && (
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 flex items-center justify-between shrink-0">
                  <span className="text-xs text-slate-500">
                    Menampilkan {((page - 1) * limit) + 1}–{Math.min(page * limit, tableData.total)} dari {tableData.total.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={page === 1} className="size-7 rounded text-xs disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-sm">first_page</span>
                    </button>
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="size-7 rounded text-xs disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    {Array.from({ length: Math.min(7, tableData.pages) }, (_, i) => {
                      let pg: number;
                      if (tableData.pages <= 7) {
                        pg = i + 1;
                      } else if (page <= 4) {
                        pg = i + 1;
                      } else if (page >= tableData.pages - 3) {
                        pg = tableData.pages - 6 + i;
                      } else {
                        pg = page - 3 + i;
                      }
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`size-7 rounded text-xs font-medium transition-colors ${
                            pg === page ? "bg-primary text-white" : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button onClick={() => setPage(p => p + 1)} disabled={page === tableData.pages} className="size-7 rounded text-xs disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                    <button onClick={() => setPage(tableData.pages)} disabled={page === tableData.pages} className="size-7 rounded text-xs disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-sm">last_page</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
