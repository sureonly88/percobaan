"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    username:     "",
    password:     "",
    confirmPass:  "",
    name:         "",
    email:        "",
    phone:        "",
    namaUsaha:    "",
    alamatUsaha:  "",
  });
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm,  setShowConfirm]      = useState(false);
  const [loading,      setLoading]          = useState(false);
  const [error,        setError]            = useState("");
  const [success,      setSuccess]          = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPass) {
      setError("Konfirmasi password tidak cocok");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          username:     form.username,
          password:     form.password,
          name:         form.name,
          email:        form.email,
          phone:        form.phone,
          namaUsaha:    form.namaUsaha,
          alamatUsaha:  form.alamatUsaha,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal mendaftarkan akun");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex bg-white dark:bg-slate-950 overflow-auto">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 overflow-hidden">
        <div className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          <svg className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-[0.08]" viewBox="0 0 600 600" fill="none">
            <circle cx="500" cy="500" r="200" stroke="white" strokeWidth="1" />
            <circle cx="500" cy="500" r="350" stroke="white" strokeWidth="1" />
            <circle cx="500" cy="500" r="500" stroke="white" strokeWidth="1" />
          </svg>
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/5 rounded-full blur-xl" />
          <div className="absolute bottom-20 right-10 w-48 h-48 bg-white/5 rounded-full blur-xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 backdrop-blur-sm rounded-xl">
              <span className="material-symbols-outlined text-white text-2xl">bolt</span>
            </div>
            <span className="text-white/90 text-lg font-bold tracking-tight">Pedami Payment</span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              Bergabung<br />Sebagai Mitra<br />
              <span className="inline-flex items-baseline gap-2">
                Loket Agen
                <span className="text-3xl">🤝</span>
              </span>
            </h1>
            <p className="text-white/70 mt-6 text-lg leading-relaxed max-w-md">
              Daftarkan diri Anda dan mulai layani pembayaran PDAM, PLN, BPJS, dan tagihan lainnya dari loket Anda.
            </p>
            <div className="mt-8 space-y-3">
              {[
                { icon: "check_circle", text: "Proses pembayaran cepat & aman" },
                { icon: "check_circle", text: "Dashboard real-time transaksi & saldo" },
                { icon: "check_circle", text: "Multi-layanan dalam satu platform" },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-3 text-white/80">
                  <span className="material-symbols-outlined text-white/60 text-xl">{item.icon}</span>
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 pt-4">
            <div><p className="text-2xl font-black text-white">500+</p><p className="text-xs text-white/50 font-medium">Loket Aktif</p></div>
            <div className="w-px h-10 bg-white/20" />
            <div><p className="text-2xl font-black text-white">10rb+</p><p className="text-xs text-white/50 font-medium">Transaksi / Bulan</p></div>
            <div className="w-px h-10 bg-white/20" />
            <div><p className="text-2xl font-black text-white">99.9%</p><p className="text-xs text-white/50 font-medium">Uptime</p></div>
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-start justify-center px-6 sm:px-10 py-10 overflow-y-auto">
        <div className="w-full max-w-2xl">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center bg-indigo-600 rounded-2xl p-3.5 text-white mb-3">
              <span className="material-symbols-outlined text-3xl">bolt</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Pedami Payment</h2>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="hidden lg:flex items-center gap-2 mb-6">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                <span className="material-symbols-outlined text-indigo-600 text-xl">bolt</span>
              </div>
              <span className="text-indigo-600 font-bold text-lg">Pedami Payment</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Daftar Akun Baru
            </h2>
            <p className="text-slate-500 mt-2">
              Isi data di bawah. Akun Anda akan aktif setelah disetujui admin.
            </p>
          </div>

          {/* ── Success state ──────────────────────────────────────────────── */}
          {success ? (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-6">
                <span className="material-symbols-outlined text-emerald-600 text-5xl">check_circle</span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-3">
                Pendaftaran Terkirim!
              </h3>
              <p className="text-slate-500 mb-2">
                Permintaan Anda sedang diproses oleh admin.
              </p>
              <p className="text-slate-400 text-sm mb-8">
                Anda akan dihubungi setelah akun disetujui dan dapat login ke sistem.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-lg">login</span>
                Kembali ke Login
              </Link>
            </div>
          ) : (
            <>
              {/* Error */}
              {error && (
                <div className="mb-5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2 border border-red-100 dark:border-red-800">
                  <span className="material-symbols-outlined text-lg">error</span>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ── Informasi Akun ─────────────────────────── */}
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-1">Informasi Akun</p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">person</span>
                    <input
                      type="text"
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      required
                      autoFocus
                      autoComplete="username"
                      placeholder="cth: agen_banjar01"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Huruf kecil, angka, dan underscore (3–30 karakter)</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        placeholder="Min. 8 karakter"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-10 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        tabIndex={-1}
                      >
                        <span className="material-symbols-outlined text-xl">{showPassword ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Konfirmasi <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock_reset</span>
                      <input
                        type={showConfirm ? "text" : "password"}
                        name="confirmPass"
                        value={form.confirmPass}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        placeholder="Ulangi password"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-10 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        tabIndex={-1}
                      >
                        <span className="material-symbols-outlined text-xl">{showConfirm ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Informasi Pribadi ─────────────────────── */}
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">Informasi Pribadi</p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">badge</span>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      placeholder="Nama sesuai KTP"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Nomor HP <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">phone</span>
                      <input
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        required
                        autoComplete="tel"
                        placeholder="08xxxxxxxxxx"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">email</span>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        autoComplete="email"
                        placeholder="opsional"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Informasi Usaha ──────────────────────── */}
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">Informasi Usaha</p>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Nama Usaha / Loket
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">storefront</span>
                    <input
                      type="text"
                      name="namaUsaha"
                      value={form.namaUsaha}
                      onChange={handleChange}
                      placeholder="cth: Loket Pak Budi RT 03"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Alamat Usaha
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-[14px] text-slate-400 text-xl">location_on</span>
                    <textarea
                      name="alamatUsaha"
                      value={form.alamatUsaha}
                      onChange={handleChange}
                      rows={2}
                      placeholder="Alamat lengkap loket / tempat usaha"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                      Mendaftar...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">how_to_reg</span>
                      Daftar Sekarang
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500 pt-1">
                  Sudah punya akun?{" "}
                  <Link href="/login" className="text-indigo-600 font-bold hover:underline">
                    Masuk di sini
                  </Link>
                </p>
              </form>
            </>
          )}

          <p className="text-center text-xs text-slate-400 mt-8">
            &copy; {new Date().getFullYear()} Pedami Payment &mdash; Sistem Pembayaran Terpadu
          </p>
        </div>
      </div>
    </div>
  );
}
