import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/admin/import-transaksi/logs", "GET");
  if (!check.allowed) {
    return NextResponse.json(check.response, { status: authToken ? 403 : 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20", 10), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       id,
       actor_username,
       actor_role,
       actor_ip,
       context_json,
       created_at
     FROM audit_logs
     WHERE action = 'IMPORT_TRANSAKSI'
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'IMPORT_TRANSAKSI'`
  );
  const total = (countRows[0]?.total as number) ?? 0;

  const logs = rows.map((r) => {
    const ctx =
      r.context_json
        ? (typeof r.context_json === "string" ? JSON.parse(r.context_json) : r.context_json)
        : {};
    return {
      id:            r.id,
      actorUsername: r.actor_username,
      actorRole:     r.actor_role,
      actorIp:       r.actor_ip,
      sourceUrl:     ctx.sourceUrl   ?? null,
      tglAwal:       ctx.tglAwal     ?? null,
      tglAkhir:      ctx.tglAkhir    ?? null,
      jenis:         ctx.jenis       ?? [],
      loketCode:     ctx.loketCode   ?? null,
      durationMs:    ctx.durationMs  ?? null,
      inserted:      ctx.inserted    ?? 0,
      updated:       ctx.updated     ?? 0,
      errors:        ctx.errors      ?? 0,
      errorDetails:  ctx.errorDetails ?? [],
      createdAt:     r.created_at,
    };
  });

  return NextResponse.json({ logs, total, limit, offset });
}
