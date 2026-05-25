"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/ui/ThemeProvider";

const BRIDGE_URL = "http://localhost:6789";

interface BridgePrinter {
  name: string;
  port: string;
  driver: string;
  default: boolean;
}

interface BridgeConfig {
  port: number;
  printerName: string;
  printMode: "ps" | "copy";
  portMapping: string;
  columns: number;
  feedLines: number;
}

interface BridgeTemplate {
  headerLine1: string;
  headerLine2: string;
  lunasText: string;
  footerLine1: string;
  footerLine2: string;
}

interface ProfileData {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  createdAt: string;
  loket: {
    id: number;
    loketCode: string;
    nama: string;
    alamat: string;
    status: string;
  } | null;
}

export default function PengaturanPage() {
  const { data: session, update: updateSession } = useSession();
  const userId = (session?.user as { id?: string })?.id;
  const userName = session?.user?.name || "";
  const userRole = (session?.user as { role?: string })?.role || "operator";

  // Tab state
  const [activeTab, setActiveTab] = useState<"profil" | "tampilan" | "printer">("profil");

  // --- Profile ---
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileName, setProfileName] = useState(userName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // --- Theme ---
  const { theme, setTheme } = useTheme();

  // Fetch profile data
  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    fetch(`/api/pengaturan/profil?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setProfile(data);
          setProfileName(data.name || "");
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [userId]);

  useEffect(() => {
    if (userName && !profile) setProfileName(userName);
  }, [userName, profile]);

  // ─────────────────────────── Printer Bridge ───────────────────────────
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfig | null>(null);
  const [bridgeTemplate, setBridgeTemplate] = useState<BridgeTemplate | null>(null);
  const [bridgeTemplateDefaults, setBridgeTemplateDefaults] = useState<BridgeTemplate | null>(null);
  const [bridgePrinters, setBridgePrinters] = useState<BridgePrinter[]>([]);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeMsg, setBridgeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [previewText, setPreviewText] = useState<string>("");

  const flashBridgeMsg = (type: "ok" | "err", text: string) => {
    setBridgeMsg({ type, text });
    setTimeout(() => setBridgeMsg(null), 4000);
  };

  const fetchBridgeAll = useCallback(async () => {
    setBridgeLoading(true);
    try {
      const [ping, cfg, tpl, prn] = await Promise.all([
        fetch(`${BRIDGE_URL}/ping`).then((r) => r.ok).catch(() => false),
        fetch(`${BRIDGE_URL}/config`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BRIDGE_URL}/template`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${BRIDGE_URL}/printers`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setBridgeOnline(ping);
      if (cfg?.ok) setBridgeConfig(cfg.config);
      if (tpl?.ok) {
        setBridgeTemplate(tpl.template);
        setBridgeTemplateDefaults(tpl.defaults);
      }
      if (prn?.ok) setBridgePrinters(prn.printers || []);
    } finally {
      setBridgeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "printer") void fetchBridgeAll();
  }, [activeTab, fetchBridgeAll]);

  const saveBridgeConfig = async () => {
    if (!bridgeConfig) return;
    setBridgeLoading(true);
    try {
      const res = await fetch(`${BRIDGE_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgeConfig),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        flashBridgeMsg("err", j.error || "Gagal menyimpan konfigurasi");
      } else {
        setBridgeConfig(j.config);
        flashBridgeMsg("ok", "Konfigurasi printer tersimpan");
      }
    } catch {
      flashBridgeMsg("err", "Print-bridge tidak dapat dihubungi");
    } finally {
      setBridgeLoading(false);
    }
  };

  const saveBridgeTemplate = async () => {
    if (!bridgeTemplate) return;
    setBridgeLoading(true);
    try {
      const res = await fetch(`${BRIDGE_URL}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgeTemplate),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        flashBridgeMsg("err", j.error || "Gagal menyimpan template");
      } else {
        setBridgeTemplate(j.template);
        flashBridgeMsg("ok", "Template struk tersimpan");
      }
    } catch {
      flashBridgeMsg("err", "Print-bridge tidak dapat dihubungi");
    } finally {
      setBridgeLoading(false);
    }
  };

  const loadPreview = useCallback(async () => {
    if (!bridgeTemplate) return;
    try {
      const sample = {
        loketName: profile?.loket?.nama || "LOKET DEMO",
        loketCode: profile?.loket?.loketCode || "DEMO",
        kasir: profile?.username || profileName || "TEST",
        tanggal: new Date().toISOString(),
        bills: [{
          idpel: "1234567890",
          nama: "PELANGGAN CONTOH",
          periode: "202605",
          tagihan: 75000, admin: 2500, total: 77500,
        }],
        totalTagihan: 75000, totalAdmin: 2500, totalBayar: 77500,
        tunai: 80000, kembalian: 2500,
      };
      const res = await fetch(`${BRIDGE_URL}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: sample, template: bridgeTemplate }),
      });
      const j = await res.json();
      if (j.ok) setPreviewText(j.text);
    } catch {
      setPreviewText("(Print-bridge tidak dapat dihubungi)");
    }
  }, [bridgeTemplate, profile, profileName]);

  useEffect(() => {
    if (activeTab === "printer" && bridgeTemplate) void loadPreview();
  }, [activeTab, bridgeTemplate, loadPreview]);

  const triggerTestPrint = async () => {
    setBridgeLoading(true);
    try {
      const res = await fetch(`${BRIDGE_URL}/test-print`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) flashBridgeMsg("err", j.error || "Gagal mencetak");
      else flashBridgeMsg("ok", "Perintah cetak terkirim ke printer");
    } catch {
      flashBridgeMsg("err", "Print-bridge tidak dapat dihubungi");
    } finally {
      setBridgeLoading(false);
    }
  };

  // Save profile
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setProfileError("Konfirmasi password tidak cocok");
      setProfileSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/pengaturan/profil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: profileName,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProfileError(json.error || "Gagal menyimpan");
      } else {
        setProfileSuccess("Profil berhasil diperbarui");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setProfileSuccess(""), 3000);
        // Refresh session to reflect name change
        await updateSession();
      }
    } catch {
      setProfileError("Gagal menyimpan profil");
    } finally {
      setProfileSaving(false);
    }
  };

  // Save theme
  const saveTheme = async (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    try {
      await fetch("/api/pengaturan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { theme: newTheme } }),
      });
    } catch {
      // silently fail
    }
  };

  const tabs = [
    { key: "profil" as const, label: "Profil", icon: "person" },
    { key: "tampilan" as const, label: "Tampilan", icon: "palette" },
    { key: "printer" as const, label: "Printer", icon: "print" },
  ];

  return (
    <>
      {/* Header */}
      <header className="mb-8">
        <h2 className="text-2xl font-bold">Pengaturan</h2>
        <p className="text-slate-500">Kelola konfigurasi aplikasi, profil, dan tampilan.</p>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== Tab: Profil ===== */}
      {activeTab === "profil" && (
        <div className="space-y-6">
          {/* User info card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            {profileLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-symbols-outlined animate-spin text-2xl text-slate-400">progress_activity</span>
                <span className="ml-2 text-slate-400 text-sm">Memuat data profil...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                    {profileName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{profileName}</h3>
                    <p className="text-sm text-slate-500 capitalize">{profile?.role || userRole}</p>
                    {profile?.username && (
                      <p className="text-xs text-slate-400 mt-0.5">@{profile.username}</p>
                    )}
                  </div>
                </div>

                {/* Detail info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-slate-400 text-lg">badge</span>
                      <span className="text-xs text-slate-400 font-medium">Username</span>
                    </div>
                    <p className="text-sm font-semibold">{profile?.username || "-"}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-slate-400 text-lg">mail</span>
                      <span className="text-xs text-slate-400 font-medium">Email</span>
                    </div>
                    <p className="text-sm font-semibold">{profile?.email || "-"}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-slate-400 text-lg">shield_person</span>
                      <span className="text-xs text-slate-400 font-medium">Role</span>
                    </div>
                    <p className="text-sm font-semibold capitalize">{profile?.role || userRole}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
                      <span className="text-xs text-slate-400 font-medium">Bergabung Sejak</span>
                    </div>
                    <p className="text-sm font-semibold">
                      {profile?.createdAt
                        ? new Date(profile.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Loket info */}
                {profile?.loket && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-xl">storefront</span>
                      <h4 className="font-bold text-blue-700 dark:text-blue-300">Informasi Loket</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Nama Loket</span>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{profile.loket.nama}</p>
                      </div>
                      <div>
                        <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Kode Loket</span>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{profile.loket.loketCode}</p>
                      </div>
                      {profile.loket.alamat && (
                        <div className="sm:col-span-2">
                          <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Alamat</span>
                          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{profile.loket.alamat}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Status</span>
                        <p className="mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                            profile.loket.status === "aktif"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              profile.loket.status === "aktif" ? "bg-emerald-500" : "bg-red-500"
                            }`} />
                            {profile.loket.status === "aktif" ? "Aktif" : "Nonaktif"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {!profile?.loket && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg">info</span>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Belum terhubung dengan loket manapun.</p>
                    </div>
                  </div>
                )}

            <form onSubmit={saveProfile} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Nama Lengkap
                </label>
                <input
                  className="w-full max-w-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Nama lengkap"
                  required
                />
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">Ubah Password</h4>
                <p className="text-xs text-slate-400 mb-4">Kosongkan jika tidak ingin mengubah password.</p>

                <div className="space-y-4 max-w-md">
                  {/* Current password */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Password Lama
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPw ? "text" : "password"}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showCurrentPw ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* New password */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Password Baru
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPw ? "text" : "password"}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showNewPw ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Confirm new password */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Konfirmasi Password Baru
                    </label>
                    <input
                      type="password"
                      className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary ${
                        confirmPassword && confirmPassword !== newPassword
                          ? "border-red-400"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi password baru"
                    />
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              {profileError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2 max-w-md">
                  <span className="material-symbols-outlined text-lg">error</span>
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2 max-w-md">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  {profileSuccess}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={profileSaving}
                className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-3 rounded-xl shadow-md shadow-primary/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {profileSaving ? (
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-lg">save</span>
                )}
                Simpan Profil
              </button>
            </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Tab: Tampilan ===== */}
      {activeTab === "tampilan" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-lg">
                <span className="material-symbols-outlined text-2xl">palette</span>
              </div>
              <div>
                <h3 className="font-bold text-lg">Preferensi Tampilan</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Pilih tema tampilan yang paling nyaman untuk Anda.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Light */}
              <button
                onClick={() => saveTheme("light")}
                className={`relative p-5 rounded-2xl border-2 transition-all text-left ${
                  theme === "light"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {theme === "light" && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-sm">check</span>
                  </div>
                )}
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-amber-500 text-2xl">light_mode</span>
                </div>
                <p className="font-bold text-sm">Light Mode</p>
                <p className="text-xs text-slate-400 mt-1">Tampilan terang untuk penggunaan siang hari.</p>

                {/* Preview */}
                <div className="mt-4 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="h-3 bg-white border-b border-slate-100 flex items-center gap-0.5 px-1">
                    <div className="w-1 h-1 rounded-full bg-red-400" />
                    <div className="w-1 h-1 rounded-full bg-yellow-400" />
                    <div className="w-1 h-1 rounded-full bg-green-400" />
                  </div>
                  <div className="flex h-8">
                    <div className="w-5 bg-white border-r border-slate-100" />
                    <div className="flex-1 bg-gray-50" />
                  </div>
                </div>
              </button>

              {/* Dark */}
              <button
                onClick={() => saveTheme("dark")}
                className={`relative p-5 rounded-2xl border-2 transition-all text-left ${
                  theme === "dark"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {theme === "dark" && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-sm">check</span>
                  </div>
                )}
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-indigo-500 text-2xl">dark_mode</span>
                </div>
                <p className="font-bold text-sm">Dark Mode</p>
                <p className="text-xs text-slate-400 mt-1">Tampilan gelap, lebih nyaman di malam hari.</p>

                {/* Preview */}
                <div className="mt-4 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="h-3 bg-slate-800 border-b border-slate-700 flex items-center gap-0.5 px-1">
                    <div className="w-1 h-1 rounded-full bg-red-400" />
                    <div className="w-1 h-1 rounded-full bg-yellow-400" />
                    <div className="w-1 h-1 rounded-full bg-green-400" />
                  </div>
                  <div className="flex h-8">
                    <div className="w-5 bg-slate-900 border-r border-slate-700" />
                    <div className="flex-1 bg-slate-800" />
                  </div>
                </div>
              </button>

              {/* System */}
              <button
                onClick={() => saveTheme("system")}
                className={`relative p-5 rounded-2xl border-2 transition-all text-left ${
                  theme === "system"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {theme === "system" && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-sm">check</span>
                  </div>
                )}
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-slate-500 text-2xl">computer</span>
                </div>
                <p className="font-bold text-sm">Ikuti Sistem</p>
                <p className="text-xs text-slate-400 mt-1">Otomatis menyesuaikan dengan pengaturan perangkat.</p>

                {/* Preview */}
                <div className="mt-4 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="h-3 bg-gradient-to-r from-white to-slate-800 flex items-center gap-0.5 px-1">
                    <div className="w-1 h-1 rounded-full bg-red-400" />
                    <div className="w-1 h-1 rounded-full bg-yellow-400" />
                    <div className="w-1 h-1 rounded-full bg-green-400" />
                  </div>
                  <div className="flex h-8">
                    <div className="w-5 bg-gradient-to-b from-white to-slate-900" />
                    <div className="flex-1 bg-gradient-to-r from-gray-50 to-slate-800" />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Tab: Printer ===== */}
      {activeTab === "printer" && (
        <div className="space-y-6">
          {/* Status card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${bridgeOnline ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" : "bg-red-50 dark:bg-red-900/20 text-red-600"}`}>
                  <span className="material-symbols-outlined text-2xl">{bridgeOnline ? "print" : "print_disabled"}</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pedami Print Bridge</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {bridgeOnline === null ? "Mengecek status..." :
                      bridgeOnline ? `Aktif di ${BRIDGE_URL}` :
                      `Tidak terdeteksi di ${BRIDGE_URL}. Pastikan service print-bridge sudah berjalan di komputer kasir.`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void fetchBridgeAll()}
                disabled={bridgeLoading}
                className="flex items-center gap-1.5 text-sm px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-lg ${bridgeLoading ? "animate-spin" : ""}`}>refresh</span>
                Refresh
              </button>
            </div>
            {bridgeMsg && (
              <div className={`mt-3 text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                bridgeMsg.type === "ok"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              }`}>
                <span className="material-symbols-outlined text-lg">{bridgeMsg.type === "ok" ? "check_circle" : "error"}</span>
                {bridgeMsg.text}
              </div>
            )}
          </div>

          {bridgeOnline && bridgeConfig && (
            <>
              {/* Printer auto-detect */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold">Pilih Printer</h3>
                    <p className="text-xs text-slate-500 mt-1">Printer yang terdeteksi di sistem operasi komputer kasir.</p>
                  </div>
                  <span className="text-xs text-slate-400">{bridgePrinters.length} terdeteksi</span>
                </div>

                {bridgePrinters.length === 0 ? (
                  <div className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                    Tidak ada printer terdeteksi. Anda tetap bisa mengetik nama printer secara manual di kolom di bawah.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    {bridgePrinters.map((p) => {
                      const selected = bridgeConfig.printerName === p.name;
                      return (
                        <button
                          key={p.name}
                          onClick={() => setBridgeConfig({ ...bridgeConfig, printerName: p.name })}
                          className={`text-left p-3 rounded-lg border-2 transition-all ${
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">{selected ? "radio_button_checked" : "radio_button_unchecked"}</span>
                            <span className="font-semibold text-sm">{p.name}</span>
                            {p.default && (
                              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Default OS</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-1 ml-7">
                            {p.port || "-"} {p.driver ? `• ${p.driver}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Nama Printer (manual)</label>
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                      value={bridgeConfig.printerName}
                      onChange={(e) => setBridgeConfig({ ...bridgeConfig, printerName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Mode Cetak</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        {
                          value: "ps" as const,
                          title: "PowerShell WinSpooler",
                          badge: "Rekomendasi",
                          desc: "Cetak via Windows print spooler. Cocok untuk printer USB / network yang terinstall di OS.",
                          icon: "print",
                        },
                        {
                          value: "copy" as const,
                          title: "copy /b ke port (LPT)",
                          badge: "Legacy",
                          desc: "Kirim byte ESC/P langsung ke virtual LPT port (mis. LPT3:). Pakai bila printer di-share via net use.",
                          icon: "cable",
                        },
                      ]).map((opt) => {
                        const checked = bridgeConfig.printMode === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`relative flex gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                              checked
                                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                                : "border-slate-200 dark:border-slate-700 hover:border-primary/50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="printMode"
                              className="sr-only"
                              value={opt.value}
                              checked={checked}
                              onChange={() => setBridgeConfig({ ...bridgeConfig, printMode: opt.value })}
                            />
                            <span
                              className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                checked ? "border-primary" : "border-slate-300 dark:border-slate-600"
                              }`}
                            >
                              {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-primary">{opt.icon}</span>
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{opt.title}</span>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                    opt.badge === "Rekomendasi"
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  {opt.badge}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">{opt.desc}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {bridgeConfig.printMode === "copy" && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Port Mapping</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                        value={bridgeConfig.portMapping}
                        onChange={(e) => setBridgeConfig({ ...bridgeConfig, portMapping: e.target.value })}
                        placeholder="LPT3:"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Lebar Kolom</label>
                    <input
                      type="number"
                      min={40}
                      max={132}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                      value={bridgeConfig.columns}
                      onChange={(e) => setBridgeConfig({ ...bridgeConfig, columns: Number(e.target.value) || 80 })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Feed Lines (baris kosong di akhir)</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                      value={bridgeConfig.feedLines}
                      onChange={(e) => setBridgeConfig({ ...bridgeConfig, feedLines: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => void saveBridgeConfig()}
                    disabled={bridgeLoading}
                    className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">save</span>
                    Simpan Konfigurasi
                  </button>
                  <button
                    onClick={() => void triggerTestPrint()}
                    disabled={bridgeLoading}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">print</span>
                    Test Print
                  </button>
                </div>
              </div>

              {/* Template editor */}
              {bridgeTemplate && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold">Template Struk</h3>
                      <p className="text-xs text-slate-500 mt-1">Ubah header dan footer struk tanpa edit kode.</p>
                    </div>
                    {bridgeTemplateDefaults && (
                      <button
                        onClick={() => setBridgeTemplate({ ...bridgeTemplateDefaults })}
                        className="text-xs text-slate-500 hover:text-primary flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                        Reset ke default
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {([
                        ["headerLine1", "Header Baris 1 (judul, bold)"],
                        ["headerLine2", "Header Baris 2 (subjudul)"],
                        ["lunasText", "Stempel LUNAS"],
                        ["footerLine1", "Footer Baris 1"],
                        ["footerLine2", "Footer Baris 2"],
                      ] as [keyof BridgeTemplate, string][]).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{label}</label>
                          <input
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                            value={bridgeTemplate[key]}
                            onChange={(e) => setBridgeTemplate({ ...bridgeTemplate, [key]: e.target.value })}
                            maxLength={200}
                          />
                        </div>
                      ))}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => void saveBridgeTemplate()}
                          disabled={bridgeLoading}
                          className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-lg">save</span>
                          Simpan Template
                        </button>
                        <button
                          onClick={() => void loadPreview()}
                          disabled={bridgeLoading}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                          Refresh Preview
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Preview (struk contoh)</label>
                      <pre className="bg-slate-950 text-emerald-300 text-[10px] leading-tight p-4 rounded-lg overflow-auto max-h-[420px] font-mono whitespace-pre">
{previewText || "(memuat preview...)"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
