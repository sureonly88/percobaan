import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { auditLog } from "@/lib/audit-log";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Salah PIN berturut-turut sebelum sesi dipaksa keluar. */
const MAX_PIN_FAILS = 5;

function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 000000, 111111, …
  const seq = "0123456789012345";
  const rev = seq.split("").reverse().join("");
  return seq.includes(pin) || rev.includes(pin); // 123456, 654321, …
}

async function getPinRow(username: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT pin_hash, failed_attempts FROM user_app_pins WHERE username = ? LIMIT 1",
    [username]
  );
  return rows[0] as { pin_hash: string; failed_attempts: number } | undefined;
}

/** GET /api/m/pin → status PIN pengguna yang login. */
export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  const check = denyIfUnauthorized(token.role, "/api/m/pin", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const row = await getPinRow(token.username);
  return NextResponse.json({
    hasPin: Boolean(row),
    lockedOut: Boolean(row && Number(row.failed_attempts) >= MAX_PIN_FAILS),
    maxFails: MAX_PIN_FAILS,
  });
}

/**
 * POST /api/m/pin
 *  { action: "set", password, pin }  → buat/ganti PIN (wajib password akun)
 *  { action: "verify", pin }         → buka kunci; salah MAX_PIN_FAILS kali → forceLogout
 */
export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  const check = denyIfUnauthorized(token.role, "/api/m/pin", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const username = token.username;
  const body = (await req.json().catch(() => ({}))) as { action?: string; pin?: unknown; password?: unknown };
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  if (body.action === "set") {
    const password = typeof body.password === "string" ? body.password : "";
    const rl = checkRateLimit(`app-pin-set:${username}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(rl.retryAfterMs / 60000)} menit.` },
        { status: 429 }
      );
    }
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN harus 6 digit angka" }, { status: 400 });
    }
    if (isWeakPin(pin)) {
      return NextResponse.json({ error: "PIN terlalu mudah ditebak (angka sama / berurutan). Pilih PIN lain." }, { status: 400 });
    }
    const [users] = await pool.query<RowDataPacket[]>("SELECT password FROM users WHERE username = ? LIMIT 1", [username]);
    const ok = users[0] && password ? await bcrypt.compare(password, String(users[0].password)) : false;
    if (!ok) {
      return NextResponse.json({ error: "Password akun salah" }, { status: 401 });
    }
    resetRateLimit(`app-pin-set:${username}`);
    const hadPin = Boolean(await getPinRow(username));
    const hash = await bcrypt.hash(pin, 10);
    await pool.execute(
      `INSERT INTO user_app_pins (username, pin_hash, failed_attempts) VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), failed_attempts = 0`,
      [username, hash]
    );
    await auditLog({
      actorUsername: username,
      actorRole: token.role,
      actorIp: ip,
      action: hadPin ? "APP_PIN_RESET" : "APP_PIN_SET",
      entityType: "user_app_pin",
      entityId: username,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    const row = await getPinRow(username);
    if (!row) return NextResponse.json({ error: "PIN belum dibuat", needsSetup: true }, { status: 404 });
    if (Number(row.failed_attempts) >= MAX_PIN_FAILS) {
      return NextResponse.json({ error: "PIN terkunci. Masuk ulang dengan password.", forceLogout: true }, { status: 423 });
    }
    if (/^\d{6}$/.test(pin) && (await bcrypt.compare(pin, row.pin_hash))) {
      if (Number(row.failed_attempts) > 0) {
        await pool.execute("UPDATE user_app_pins SET failed_attempts = 0 WHERE username = ?", [username]);
      }
      return NextResponse.json({ ok: true });
    }
    // Atomik agar dua tebakan bersamaan tidak lolos dari batas
    await pool.execute("UPDATE user_app_pins SET failed_attempts = failed_attempts + 1 WHERE username = ?", [username]);
    const fails = Number(row.failed_attempts) + 1;
    const remaining = Math.max(0, MAX_PIN_FAILS - fails);
    if (remaining === 0) {
      await auditLog({
        actorUsername: username,
        actorRole: token.role,
        actorIp: ip,
        action: "APP_PIN_LOCKOUT",
        entityType: "user_app_pin",
        entityId: username,
        context: { maxFails: MAX_PIN_FAILS },
      });
      return NextResponse.json({ error: "PIN salah 5 kali. Silakan masuk ulang dengan password.", forceLogout: true }, { status: 423 });
    }
    return NextResponse.json({ error: `PIN salah. Sisa ${remaining} percobaan.`, remaining }, { status: 401 });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}
