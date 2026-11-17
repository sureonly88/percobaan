import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { MOBILE_PRODUCTS } from "@/lib/mobile/products";

export const dynamic = "force-dynamic";

/** Batas jumlah pelanggan per agen. */
const MAX_PER_AGENT = 300;
const SLUGS = new Set(MOBILE_PRODUCTS.map((p) => p.slug));

interface Row extends RowDataPacket {
  id: number;
  product_slug: string;
  product_code: string;
  customer_id: string;
  customer_name: string | null;
  alias_name: string | null;
  wa_number: string | null;
  note: string | null;
  last_paid_at: string | null;
  updated_at: string;
}

function map(r: Row) {
  return {
    id: Number(r.id),
    productSlug: r.product_slug,
    productCode: r.product_code || "",
    customerId: r.customer_id,
    customerName: r.customer_name,
    aliasName: r.alias_name,
    waNumber: r.wa_number,
    note: r.note,
    lastPaidAt: r.last_paid_at,
    updatedAt: r.updated_at,
  };
}

const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};
const cleanWa = (v: unknown) => {
  const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return d.length >= 9 && d.length <= 15 ? d : null;
};

async function auth(req: NextRequest, method: string) {
  const token = await getAuthToken(req);
  if (!token) return { ok: false as const, res: unauthorized() };
  const check = denyIfUnauthorized(token.role, "/api/m/pelanggan", method);
  if (!check.allowed) return { ok: false as const, res: NextResponse.json(check.response, { status: 403 }) };
  return { ok: true as const, username: token.username };
}

/** GET: daftar pelanggan milik agen yang login. */
export async function GET(req: NextRequest) {
  const a = await auth(req, "GET");
  if (!a.ok) return a.res;
  const [rows] = await pool.query<Row[]>(
    `SELECT id, product_slug, product_code, customer_id, customer_name, alias_name, wa_number, note, last_paid_at, updated_at
       FROM agent_customers WHERE username = ?
      ORDER BY COALESCE(alias_name, customer_name, customer_id) ASC
      LIMIT ?`,
    [a.username, MAX_PER_AGENT]
  );
  return NextResponse.json({ customers: rows.map(map), max: MAX_PER_AGENT });
}

/**
 * POST: tambah / perbarui (berdasarkan produk + ID). Field kosong tidak menimpa data lama.
 * markPaid: true → catat waktu bayar terakhir (dipanggil setelah pembayaran lunas).
 */
export async function POST(req: NextRequest) {
  const a = await auth(req, "POST");
  if (!a.ok) return a.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const productSlug = String(b.productSlug || "");
  const productCode = clean(b.productCode, 100) || "";
  const customerId = String(b.customerId || "").trim();
  if (!SLUGS.has(productSlug)) return NextResponse.json({ error: "Produk tidak valid" }, { status: 400 });
  if (!/^[a-zA-Z0-9]{3,64}$/.test(customerId)) return NextResponse.json({ error: "ID pelanggan tidak valid" }, { status: 400 });
  if (productSlug === "pdam-lain" && !/^pdam-[a-z0-9-]+$/.test(productCode)) {
    return NextResponse.json({ error: "Pilih PDAM daerah" }, { status: 400 });
  }

  const [[cnt]] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM agent_customers WHERE username = ?", [a.username]);
  const [exists] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM agent_customers WHERE username = ? AND product_slug = ? AND product_code = ? AND customer_id = ? LIMIT 1",
    [a.username, productSlug, productCode, customerId]
  );
  if (!exists[0] && Number(cnt.n) >= MAX_PER_AGENT) {
    return NextResponse.json({ error: `Maksimal ${MAX_PER_AGENT} pelanggan` }, { status: 409 });
  }

  await pool.execute<ResultSetHeader>(
    `INSERT INTO agent_customers (username, product_slug, product_code, customer_id, customer_name, alias_name, wa_number, note, last_paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${b.markPaid ? "NOW()" : "NULL"})
     ON DUPLICATE KEY UPDATE
       customer_name = COALESCE(VALUES(customer_name), customer_name),
       alias_name = COALESCE(VALUES(alias_name), alias_name),
       wa_number = COALESCE(VALUES(wa_number), wa_number),
       note = COALESCE(VALUES(note), note),
       last_paid_at = ${b.markPaid ? "NOW()" : "last_paid_at"}`,
    [a.username, productSlug, productCode, customerId, clean(b.customerName, 255), clean(b.aliasName, 100), cleanWa(b.waNumber), clean(b.note, 255)]
  );
  const [rows] = await pool.query<Row[]>(
    `SELECT id, product_slug, product_code, customer_id, customer_name, alias_name, wa_number, note, last_paid_at, updated_at
       FROM agent_customers WHERE username = ? AND product_slug = ? AND product_code = ? AND customer_id = ? LIMIT 1`,
    [a.username, productSlug, productCode, customerId]
  );
  return NextResponse.json({ customer: rows[0] ? map(rows[0]) : null, created: !exists[0] });
}

/** PATCH ?id= : ubah alias / WA / catatan (string kosong = hapus nilai). */
export async function PATCH(req: NextRequest) {
  const a = await auth(req, "PATCH");
  if (!a.ok) return a.res;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const [res] = await pool.execute<ResultSetHeader>(
    "UPDATE agent_customers SET alias_name = ?, wa_number = ?, note = ? WHERE id = ? AND username = ?",
    [clean(b.aliasName, 100), cleanWa(b.waNumber), clean(b.note, 255), id, a.username]
  );
  if (res.affectedRows === 0) return NextResponse.json({ error: "Pelanggan tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= : hapus dari daftar agen (tidak menyentuh data transaksi). */
export async function DELETE(req: NextRequest) {
  const a = await auth(req, "DELETE");
  if (!a.ok) return a.res;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
  const [res] = await pool.execute<ResultSetHeader>("DELETE FROM agent_customers WHERE id = ? AND username = ?", [id, a.username]);
  if (res.affectedRows === 0) return NextResponse.json({ error: "Pelanggan tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
