"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { ROLE_LABELS, normalizeRole } from "@/lib/rbac";

interface Profile {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  createdAt: string | null;
  loket: { loketCode: string; nama: string; alamat: string | null; status: string } | null;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

/** Sama dengan aturan server di /api/pengaturan/profil. */
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password baru minimal 8 karakter";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password baru harus berisi huruf dan angka";
  return null;
}

export default function MobilePengaturanPage() {
  const { data: session, update: updateSession } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/pengaturan/profil?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Gagal memuat profil");
        return;
      }
      setProfile(data);
      setName(data.name || "");
    } catch {
      setLoadError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(body: Record<string, string>): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/pengaturan/profil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message || data.error || (res.ok ? "Tersimpan" : "Gagal menyimpan") };
    } catch {
      return { ok: false, message: "Gagal menghubungi server. Periksa koneksi." };
    }
  }

  async function onSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameNotice({ tone: "error", text: "Nama tidak boleh kosong" });
      return;
    }
    setSavingName(true);
    setNameNotice(null);
    const r = await saveProfile({ name: trimmed });
    setSavingName(false);
    setNameNotice({ tone: r.ok ? "ok" : "error", text: r.ok ? "Nama berhasil diperbarui" : r.message });
    if (r.ok) {
      setProfile((p) => (p ? { ...p, name: trimmed } : p));
      await updateSession({ name: trimmed });
    }
  }

  async function onChangePassword() {
    setPwNotice(null);
    if (!currentPw) {
      setPwNotice({ tone: "error", text: "Password lama wajib diisi" });
      return;
    }
    const problem = passwordProblem(newPw);
    if (problem) {
      setPwNotice({ tone: "error", text: problem });
      return;
    }
    if (newPw !== confirmPw) {
      setPwNotice({ tone: "error", text: "Konfirmasi password tidak sama" });
      return;
    }
    setSavingPw(true);
    const r = await saveProfile({ name: profile?.name || name.trim(), currentPassword: currentPw, newPassword: newPw });
    setSavingPw(false);
    setPwNotice({ tone: r.ok ? "ok" : "error", text: r.ok ? "Password berhasil diubah" : r.message });
    if (r.ok) {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  const role = profile ? ROLE_LABELS[normalizeRole(profile.role)] : "";
  const initials = (profile?.name || profile?.username || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const nameDirty = profile ? name.trim() !== (profile.name || "") : false;

  return (
    <div>
      <MobileHeader title="Pengaturan akun" backHref="/m/akun" />
      <div className="p-4 space-y-4">
        {loading && !profile ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 h-24 animate-pulse" />
        ) : loadError ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 p-4 text-sm">
            {loadError}
            <button type="button" onClick={load} className="mt-3 block font-semibold underline">
              Coba lagi
            </button>
          </div>
        ) : profile ? (
          <>
            <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{profile.name || profile.username}</p>
                <p className="text-sm text-slate-500 truncate">
                  @{profile.username} · {role}
                </p>
                {profile.createdAt && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bergabung {new Date(profile.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-500 mb-2">Loket</h2>
              {profile.loket ? (
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-0.5">storefront</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{profile.loket.nama}</p>
                    <p className="text-sm text-slate-500">{profile.loket.loketCode}</p>
                    {profile.loket.alamat && <p className="text-sm text-slate-500 mt-1">{profile.loket.alamat}</p>}
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      profile.loket.status === "aktif"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {profile.loket.status === "aktif" ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Belum terhubung dengan loket manapun.</p>
              )}
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-500">Nama tampilan</h2>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameNotice(null);
                }}
                maxLength={100}
                autoComplete="name"
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-base"
              />
              <NoticeText notice={nameNotice} />
              <button
                type="button"
                onClick={onSaveName}
                disabled={!nameDirty || savingName}
                className="h-11 w-full rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
              >
                {savingName ? "Menyimpan…" : "Simpan nama"}
              </button>
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-500">Ubah password</h2>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="text-sm text-primary font-medium flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-base">{showPw ? "visibility_off" : "visibility"}</span>
                  {showPw ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
              <PwInput label="Password lama" value={currentPw} onChange={setCurrentPw} show={showPw} autoComplete="current-password" />
              <PwInput label="Password baru" value={newPw} onChange={setNewPw} show={showPw} autoComplete="new-password" />
              <PwInput label="Ulangi password baru" value={confirmPw} onChange={setConfirmPw} show={showPw} autoComplete="new-password" />
              <p className="text-xs text-slate-500">Minimal 8 karakter, berisi huruf dan angka.</p>
              <NoticeText notice={pwNotice} />
              <button
                type="button"
                onClick={onChangePassword}
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                className="h-11 w-full rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
              >
                {savingPw ? "Menyimpan…" : "Ubah password"}
              </button>
            </section>

            <p className="text-xs text-slate-500 px-1">
              Pengaturan fitur sistem dan printer struk hanya tersedia di versi desktop.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PwInput({
  label,
  value,
  onChange,
  show,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-base"
      />
    </label>
  );
}

function NoticeText({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`text-sm ${notice.tone === "ok" ? "text-emerald-600" : "text-red-600"}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  );
}
