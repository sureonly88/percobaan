import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import pool from "@/lib/db";
import { listAccounts } from "@/lib/gl/reports";
import { NORMAL_BALANCE, ACCOUNT_TYPES, type AccountType } from "@/lib/gl/accounts";
import type { ResultSetHeader } from "mysql2";

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/akun", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const activeOnly = sp.get("activeOnly") === "1";
  const items = await listAccounts({ activeOnly });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/akun", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const accountType = String(body.accountType ?? "").toUpperCase() as AccountType;
  const parentCode = body.parentCode ? String(body.parentCode).trim() : null;
  const description = body.description ? String(body.description).slice(0, 255) : null;
  const isActive = body.isActive === false ? 0 : 1;

  if (!code || !name) {
    return NextResponse.json({ error: "code & name wajib" }, { status: 400 });
  }
  if (!ACCOUNT_TYPES.includes(accountType)) {
    return NextResponse.json({ error: "accountType invalid" }, { status: 400 });
  }
  const normalBalance = NORMAL_BALANCE[accountType];

  try {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO gl_accounts (code, name, account_type, normal_balance, parent_code, description, is_active, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [code, name, accountType, normalBalance, parentCode, description, isActive]
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "Kode akun sudah ada" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message ?? "Gagal membuat akun" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/akun", "PATCH");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "code wajib" }, { status: 400 });

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (typeof body.name === "string") {
    sets.push("name = ?");
    params.push(body.name);
  }
  if (typeof body.description === "string" || body.description === null) {
    sets.push("description = ?");
    params.push(body.description ?? null);
  }
  if (typeof body.isActive === "boolean") {
    sets.push("is_active = ?");
    params.push(body.isActive ? 1 : 0);
  }
  if (sets.length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });

  params.push(code);
  await pool.execute(
    `UPDATE gl_accounts SET ${sets.join(", ")} WHERE code = ? AND is_system = 0`,
    params
  );
  return NextResponse.json({ success: true });
}
