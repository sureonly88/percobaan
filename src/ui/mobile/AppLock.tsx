"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Kunci aplikasi versi mobile (/m).
 *
 * - Wajib membuat PIN 6 digit (dengan password akun) sebelum memakai aplikasi.
 * - Terkunci saat aplikasi dibuka ulang dan setelah IDLE_MS tanpa sentuhan.
 * - PIN diverifikasi di server (hash bcrypt, salah 5x → sesi dipaksa keluar).
 * - Sidik jari/wajah (WebAuthn, opsional) hanya membuka kunci di perangkat ini.
 *
 * Catatan: ini lapisan pelindung bila HP dipinjam/hilang dalam keadaan login. Sesi server
 * (next-auth) tetap menjadi batas keamanan utama; layar kunci tidak menggantikan logout.
 * Lapisan ini menutupi konten (bukan unmount), sehingga pembayaran yang sedang berjalan
 * tidak terputus saat layar terkunci.
 */
const IDLE_MS = 5 * 60 * 1000;
const SS_UNLOCKED = "m_unlocked_at";
const SS_ACTIVE = "m_last_active";
const bioKey = (u: string) => `m_bio_cred_${u}`;

type Mode = "checking" | "setup" | "locked" | "unlocked";

function readNum(key: string): number {
  try {
    return Number(sessionStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}
function writeNum(key: string, v: number) {
  try {
    sessionStorage.setItem(key, String(v));
  } catch {
    /* abaikan */
  }
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buf)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): ArrayBuffer {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}
function randomChallenge(): ArrayBuffer {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return a.buffer as ArrayBuffer;
}

export function AppLock() {
  const { data: session, status } = useSession();
  const username = (session?.user as { username?: string } | undefined)?.username || "";
  const displayName = session?.user?.name || username;

  const [mode, setMode] = useState<Mode>("checking");
  const [changing, setChanging] = useState(false); // ganti PIN dari menu Akun
  const lastActive = useRef(Date.now());

  const lock = useCallback(() => {
    writeNum(SS_UNLOCKED, 0);
    setMode((m) => (m === "unlocked" ? "locked" : m));
  }, []);

  // Status awal
  useEffect(() => {
    if (status !== "authenticated" || !username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/pin");
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setMode("unlocked"); // role tanpa fitur PIN — jangan mengunci
          return;
        }
        if (!j.hasPin || j.lockedOut) {
          setMode("setup");
          return;
        }
        const recent = Date.now() - Math.max(readNum(SS_UNLOCKED), readNum(SS_ACTIVE)) < IDLE_MS && readNum(SS_UNLOCKED) > 0;
        setMode(recent ? "unlocked" : "locked");
      } catch {
        // Offline / gagal cek: tetap kunci bila sebelumnya terkunci
        if (!cancelled) setMode(readNum(SS_UNLOCKED) > 0 ? "unlocked" : "locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, username]);

  // Deteksi idle
  useEffect(() => {
    const touch = () => {
      lastActive.current = Date.now();
      writeNum(SS_ACTIVE, lastActive.current);
    };
    const checkIdle = () => {
      const last = Math.max(lastActive.current, readNum(SS_ACTIVE));
      if (Date.now() - last > IDLE_MS) lock();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkIdle();
    };
    const onChange = () => setChanging(true);
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("m-pin-change", onChange);
    const t = setInterval(checkIdle, 15_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("m-pin-change", onChange);
      clearInterval(t);
    };
  }, [lock]);

  const unlocked = useCallback(() => {
    const now = Date.now();
    lastActive.current = now;
    writeNum(SS_UNLOCKED, now);
    writeNum(SS_ACTIVE, now);
    setMode("unlocked");
    setChanging(false);
  }, []);

  if (status !== "authenticated" || mode === "unlocked") {
    return changing ? <PinSetup displayName={displayName} onDone={unlocked} onCancel={() => setChanging(false)} isChange /> : null;
  }
  if (mode === "checking") {
    return <div className="fixed inset-0 z-[70] bg-background-light dark:bg-background-dark" aria-hidden />;
  }
  if (mode === "setup") {
    return <PinSetup displayName={displayName} onDone={unlocked} />;
  }
  return <PinUnlock username={username} displayName={displayName} onUnlocked={unlocked} />;
}

// ─── Buka kunci ──────────────────────────────────────────────────────────────

function PinUnlock({ username, displayName, onUnlocked }: { username: string; displayName: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [offerBio, setOfferBio] = useState(false);

  useEffect(() => {
    let hasCred = false;
    try {
      hasCred = !!localStorage.getItem(bioKey(username));
    } catch {
      /* abaikan */
    }
    setBioAvailable(hasCred && typeof window.PublicKeyCredential !== "undefined");
  }, [username]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/m/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", pin: value }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok) {
          // Tawarkan sidik jari sekali bila perangkat mendukung dan belum diaktifkan
          let dismissed = false;
          let hasCred = false;
          try {
            dismissed = localStorage.getItem(`m_bio_dismissed_${username}`) === "1";
            hasCred = !!localStorage.getItem(bioKey(username));
          } catch {
            /* abaikan */
          }
          const canBio =
            !dismissed &&
            !hasCred &&
            typeof window.PublicKeyCredential !== "undefined" &&
            (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false));
          if (canBio) setOfferBio(true);
          else onUnlocked();
          return;
        }
        if (j.forceLogout) {
          setError(j.error || "PIN terkunci");
          setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
          return;
        }
        setError(j.error || "PIN salah");
        setPin("");
      } catch {
        setError("Tidak bisa menghubungi server. Periksa koneksi.");
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [onUnlocked, username],
  );

  async function unlockWithBio() {
    setError("");
    try {
      const id = localStorage.getItem(bioKey(username));
      if (!id) return;
      await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge(),
          allowCredentials: [{ id: fromB64url(id), type: "public-key", transports: ["internal"] }],
          userVerification: "required",
          timeout: 60_000,
        },
      });
      onUnlocked();
    } catch {
      setError("Sidik jari tidak dikenali atau dibatalkan. Gunakan PIN.");
    }
  }

  async function enableBio() {
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge(),
          rp: { name: "Pedami Payment" },
          user: { id: new TextEncoder().encode(username).buffer as ArrayBuffer, name: username, displayName },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (cred) localStorage.setItem(bioKey(username), b64url(cred.rawId));
    } catch {
      /* dibatalkan — tetap lanjut dengan PIN */
    }
    onUnlocked();
  }

  if (offerBio) {
    return (
      <LockFrame>
        <span className="material-symbols-outlined text-5xl text-primary">fingerprint</span>
        <p className="text-lg font-bold mt-3">Buka dengan sidik jari?</p>
        <p className="text-sm text-slate-500 mt-1 max-w-xs">
          Lain kali cukup sentuh sensor sidik jari / wajah. PIN tetap bisa dipakai kapan saja.
        </p>
        <div className="mt-6 w-full max-w-xs space-y-2">
          <button type="button" onClick={enableBio} className="w-full h-12 rounded-xl bg-primary text-white font-semibold">
            Aktifkan
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(`m_bio_dismissed_${username}`, "1");
              } catch {
                /* abaikan */
              }
              onUnlocked();
            }}
            className="w-full h-12 rounded-xl text-slate-600 dark:text-slate-300 font-semibold"
          >
            Nanti saja
          </button>
        </div>
      </LockFrame>
    );
  }

  return (
    <LockFrame>
      <span className="material-symbols-outlined text-4xl text-primary">lock</span>
      <p className="text-lg font-bold mt-2">Masukkan PIN</p>
      <p className="text-sm text-slate-500">{displayName}</p>
      <PinDots length={pin.length} />
      <p className={`h-5 text-sm ${error ? "text-red-600" : ""}`} role="alert">{error}</p>
      <Keypad
        disabled={busy}
        onDigit={(d) => {
          if (pin.length >= 6) return;
          const next = pin + d;
          setPin(next);
          if (next.length === 6) submit(next);
        }}
        onBackspace={() => setPin((p) => p.slice(0, -1))}
        extra={
          bioAvailable ? (
            <button type="button" onClick={unlockWithBio} className="h-16 rounded-2xl flex items-center justify-center text-primary" aria-label="Buka dengan sidik jari">
              <span className="material-symbols-outlined text-3xl">fingerprint</span>
            </button>
          ) : (
            <span />
          )
        }
      />
      <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="mt-4 text-sm text-slate-500 underline">
        Lupa PIN? Keluar dan masuk dengan password
      </button>
    </LockFrame>
  );
}

// ─── Buat / ganti PIN ────────────────────────────────────────────────────────

function PinSetup({ displayName, onDone, onCancel, isChange }: { displayName: string; onDone: () => void; onCancel?: () => void; isChange?: boolean }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(pin)) return setError("PIN harus 6 digit angka");
    if (pin !== pin2) return setError("Konfirmasi PIN tidak sama");
    setBusy(true);
    try {
      const res = await fetch("/api/m/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", password, pin }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Gagal menyimpan PIN");
        return;
      }
      setPassword("");
      onDone();
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3";
  return (
    <LockFrame>
      <span className="material-symbols-outlined text-4xl text-primary">password</span>
      <p className="text-lg font-bold mt-2">{isChange ? "Ganti PIN" : "Buat PIN aplikasi"}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">
        {isChange
          ? "Masukkan password akun lalu PIN baru."
          : `Halo ${displayName}. PIN 6 digit dipakai untuk membuka aplikasi setelah tidak digunakan beberapa menit.`}
      </p>
      <form onSubmit={save} className="mt-5 w-full max-w-xs space-y-3 text-left">
        <label className="block">
          <span className="text-sm font-medium">Password akun</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">PIN baru (6 digit)</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={`${input} tracking-[0.5em]`} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Ulangi PIN</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className={`${input} tracking-[0.5em]`} required />
        </label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">
          {busy ? "Menyimpan…" : "Simpan PIN"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="w-full h-11 text-slate-600 dark:text-slate-300 font-semibold">Batal</button>
        ) : (
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="w-full h-11 text-slate-500 text-sm underline">Keluar</button>
        )}
      </form>
    </LockFrame>
  );
}

// ─── Komponen kecil ──────────────────────────────────────────────────────────

function LockFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-background-light dark:bg-background-dark overflow-y-auto" role="dialog" aria-modal="true" aria-label="Kunci aplikasi">
      <div className="min-h-full mx-auto max-w-md flex flex-col items-center justify-center text-center px-6 py-[max(2rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
  );
}

function PinDots({ length }: { length: number }) {
  return (
    <div className="flex gap-3 my-6" aria-label={`${length} dari 6 digit`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < length ? "bg-primary" : "border-2 border-slate-300 dark:border-slate-600"}`} />
      ))}
    </div>
  );
}

function Keypad({ onDigit, onBackspace, disabled, extra }: { onDigit: (d: string) => void; onBackspace: () => void; disabled?: boolean; extra: React.ReactNode }) {
  const key = "h-16 rounded-2xl text-2xl font-semibold active:bg-slate-200 dark:active:bg-slate-800 disabled:opacity-40";
  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-[18rem] mt-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => onDigit(d)} className={key}>{d}</button>
      ))}
      {extra}
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={key}>0</button>
      <button type="button" disabled={disabled} onClick={onBackspace} className={`${key} flex items-center justify-center`} aria-label="Hapus">
        <span className="material-symbols-outlined">backspace</span>
      </button>
    </div>
  );
}
