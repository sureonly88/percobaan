import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

export const dynamic = "force-dynamic";

const SCOPES = ["GLOBAL", "LOKET", "PROVIDER", "LOKET_PROVIDER"] as const;
const TARGETS = ["KASIR", "LOKET"] as const;
const TYPES = ["PERCENT", "FLAT"] as const;
const BASES = ["AMOUNT", "ADMIN_FEE", "TOTAL"] as const;

type Scope = (typeof SCOPES)[number];
type Target = (typeof TARGETS)[number];
type Type = (typeof TYPES)[number];
type Basis = (typeof BASES)[number];

interface RuleRow extends RowDataPacket {
  id: number;
  name: string;
  scope: Scope;
  loket_code: string | null;
  provider: string | null;
  service_type: string | null;
  target: Target;
  type: Type;
  value: string;
  basis: Basis;
  min_amount: string | null;
  max_amount: string | null;
  priority: number;
  is_active: number;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapRule(r: RuleRow) {
  return {
    id: r.id,
    name: r.name,
    scope: r.scope,
    loketCode: r.loket_code,
    provider: r.provider,
    serviceType: r.service_type,
    target: r.target,
    type: r.type,
    value: Number(r.value),
    basis: r.basis,
    minAmount: r.min_amount != null ? Number(r.min_amount) : null,
    maxAmount: r.max_amount != null ? Number(r.max_amount) : null,
    priority: r.priority,
    isActive: r.is_active === 1,
    validFrom: r.valid_from ?? null,
    validTo: r.valid_to ?? null,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/rules", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const activeOnly = sp.get("activeOnly") === "1";
  const target = sp.get("target");
  const loketCode = sp.get("loketCode");
  const provider = sp.get("provider");

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (activeOnly) where.push("is_active = 1");
  if (target && TARGETS.includes(target as Target)) {
    where.push("target = ?");
    params.push(target);
  }
  if (loketCode) {
    where.push("(loket_code = ? OR loket_code IS NULL)");
    params.push(loketCode);
  }
  if (provider) {
    where.push("(provider = ? OR provider IS NULL)");
    params.push(provider);
  }

  const sql = `SELECT * FROM commission_rules
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY is_active DESC,
                        FIELD(scope,'LOKET_PROVIDER','LOKET','PROVIDER','GLOBAL'),
                        priority DESC, id DESC`;
  const [rows] = await pool.query<RuleRow[]>(sql, params);
  return NextResponse.json({ items: rows.map(mapRule) });
}

function validateBody(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const scope = String(body.scope ?? "GLOBAL").toUpperCase() as Scope;
  const target = String(body.target ?? "").toUpperCase() as Target;
  const type = String(body.type ?? "").toUpperCase() as Type;
  const basis = String(body.basis ?? "ADMIN_FEE").toUpperCase() as Basis;
  const value = Number(body.value);
  if (!name) return { error: "Nama wajib" };
  if (!SCOPES.includes(scope)) return { error: "scope invalid" };
  if (!TARGETS.includes(target)) return { error: "target invalid (KASIR/LOKET)" };
  if (!TYPES.includes(type)) return { error: "type invalid (PERCENT/FLAT)" };
  if (!BASES.includes(basis)) return { error: "basis invalid" };
  if (isNaN(value) || value < 0) return { error: "value harus angka >= 0" };
  if (type === "PERCENT" && value > 100) return { error: "PERCENT tidak boleh > 100" };
  return {
    data: {
      name,
      scope,
      target,
      type,
      basis,
      value,
      loket_code: body.loketCode ? String(body.loketCode) : null,
      provider: body.provider ? String(body.provider).toUpperCase() : null,
      service_type: body.serviceType ? String(body.serviceType) : null,
      min_amount: body.minAmount != null && body.minAmount !== "" ? Number(body.minAmount) : null,
      max_amount: body.maxAmount != null && body.maxAmount !== "" ? Number(body.maxAmount) : null,
      priority: body.priority != null ? Number(body.priority) : 100,
      is_active: body.isActive === false ? 0 : 1,
      valid_from: body.validFrom ? String(body.validFrom) : null,
      valid_to: body.validTo ? String(body.validTo) : null,
      notes: body.notes ? String(body.notes).slice(0, 255) : null,
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/rules", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const v = validateBody(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const d = v.data;

  // Konsistensi scope vs field
  if (d.scope === "LOKET" && !d.loket_code) {
    return NextResponse.json({ error: "scope LOKET wajib loketCode" }, { status: 400 });
  }
  if (d.scope === "PROVIDER" && !d.provider) {
    return NextResponse.json({ error: "scope PROVIDER wajib provider" }, { status: 400 });
  }
  if (d.scope === "LOKET_PROVIDER" && (!d.loket_code || !d.provider)) {
    return NextResponse.json({ error: "scope LOKET_PROVIDER wajib loketCode & provider" }, { status: 400 });
  }
  if (d.scope === "GLOBAL") {
    d.loket_code = null;
    d.provider = null;
  }

  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO commission_rules
      (name, scope, loket_code, provider, service_type, target, type, value, basis,
       min_amount, max_amount, priority, is_active, valid_from, valid_to, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.name,
      d.scope,
      d.loket_code,
      d.provider,
      d.service_type,
      d.target,
      d.type,
      d.value,
      d.basis,
      d.min_amount,
      d.max_amount,
      d.priority,
      d.is_active,
      d.valid_from,
      d.valid_to,
      d.notes,
      auth.username ?? null,
    ]
  );
  return NextResponse.json({ success: true, id: res.insertId });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/rules", "PATCH");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });
  const v = validateBody(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const d = v.data;
  if (d.scope === "GLOBAL") {
    d.loket_code = null;
    d.provider = null;
  }

  await pool.execute(
    `UPDATE commission_rules SET
       name = ?, scope = ?, loket_code = ?, provider = ?, service_type = ?,
       target = ?, type = ?, value = ?, basis = ?,
       min_amount = ?, max_amount = ?, priority = ?, is_active = ?,
       valid_from = ?, valid_to = ?, notes = ?
     WHERE id = ?`,
    [
      d.name,
      d.scope,
      d.loket_code,
      d.provider,
      d.service_type,
      d.target,
      d.type,
      d.value,
      d.basis,
      d.min_amount,
      d.max_amount,
      d.priority,
      d.is_active,
      d.valid_from,
      d.valid_to,
      d.notes,
      id,
    ]
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthToken(req);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/keuangan/komisi/rules", "DELETE");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

  // Soft delete (set is_active=0) untuk menjaga referensi historis di ledger
  await pool.execute(`UPDATE commission_rules SET is_active = 0 WHERE id = ?`, [id]);
  return NextResponse.json({ success: true });
}
