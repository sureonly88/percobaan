"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/ui/ThemeProvider";

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
  const [activeTab, setActiveTab] = useState<"profil" | "tampilan">("profil");

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
    </>
  );
}
