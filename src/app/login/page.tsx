"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Username atau password salah");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 flex bg-white dark:bg-slate-950">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full">
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            {/* Arcs */}
            <svg className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-[0.08]" viewBox="0 0 600 600" fill="none">
              <circle cx="500" cy="500" r="200" stroke="white" strokeWidth="1"/>
              <circle cx="500" cy="500" r="300" stroke="white" strokeWidth="1"/>
              <circle cx="500" cy="500" r="400" stroke="white" strokeWidth="1"/>
              <circle cx="500" cy="500" r="500" stroke="white" strokeWidth="1"/>
            </svg>
          </div>
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/5 rounded-full blur-xl" />
          <div className="absolute bottom-20 right-10 w-48 h-48 bg-white/5 rounded-full blur-xl" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top: Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 backdrop-blur-sm rounded-xl">
              <span className="material-symbols-outlined text-white text-2xl">bolt</span>
            </div>
            <span className="text-white/90 text-lg font-bold tracking-tight">Pedami Payment</span>
          </div>

          {/* Center: Headline + Illustration */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-5xl font-extrabold text-white leading-tight tracking-tight">
              Pembayaran<br />Online<br />
              <span className="inline-flex items-baseline gap-2">
                Lebih Mudah
                <span className="text-4xl">💳</span>
              </span>
            </h1>
            <p className="text-white/70 mt-6 text-lg leading-relaxed max-w-md">
              Kelola pembayaran PDAM &amp; PLN dalam satu dashboard. Cepat, aman, dan efisien untuk semua loket.
            </p>

            {/* Illustration */}
            <div className="mt-10 max-w-sm">
              <Image
                src="/payment-illustration.svg"
                alt="Pembayaran Online"
                width={400}
                height={320}
                className="w-full h-auto drop-shadow-2xl"
                priority
              />
            </div>
          </div>

          {/* Bottom: Stats */}
          <div className="flex items-center gap-8 pt-4">
            <div>
              <p className="text-2xl font-black text-white">500+</p>
              <p className="text-xs text-white/50 font-medium">Loket Aktif</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <p className="text-2xl font-black text-white">10rb+</p>
              <p className="text-xs text-white/50 font-medium">Transaksi / Bulan</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <p className="text-2xl font-black text-white">99.9%</p>
              <p className="text-xs text-white/50 font-medium">Uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12">
        <div className="w-full max-w-md">
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
              Selamat Datang! 👋
            </h2>
            <p className="text-slate-500 mt-2">
              Masuk ke akun Anda untuk mengakses dashboard pembayaran.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2 border border-red-100 dark:border-red-800">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
                  person
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Masukkan username"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
                  lock
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-12 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Masukkan password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                  Memproses...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">login</span>
                  Masuk
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-10">
            &copy; {new Date().getFullYear()} Pedami Payment &mdash; Sistem Pembayaran Terpadu
          </p>
        </div>
      </div>
    </div>
  );
}
