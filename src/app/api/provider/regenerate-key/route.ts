import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { randomBytes } from "crypto";
import { invalidateCachePrefix } from "@/lib/cache";

// POST: Regenerate API key and secret for a provider
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Provider ID diperlukan" }, { status: 400 });
    }

    const apiKey = randomBytes(32).toString("hex");
    const apiSecret = randomBytes(64).toString("hex");

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE api_providers SET api_key = ?, api_secret = ? WHERE id = ?`,
      [apiKey, apiSecret, Number(id)]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Provider tidak ditemukan" }, { status: 404 });
    }

    invalidateCachePrefix("provider:");

    return NextResponse.json({
      message: "API credentials berhasil di-regenerate",
      credentials: {
        apiKey,
        apiSecret,
        note: "Simpan api_secret ini! Tidak akan ditampilkan lagi.",
      },
    });
  } catch (error) {
    console.error("Regenerate Key Error:", error);
    return NextResponse.json({ error: "Gagal regenerate credentials" }, { status: 500 });
  }
}
