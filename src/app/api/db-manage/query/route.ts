import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { authorizeDbManage, getDbManageActor } from "@/lib/db-manage-auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { auditLog } from "@/lib/audit-log";

function serialize(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (Buffer.isBuffer(val)) return `[BLOB ${val.length} bytes]`;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "bigint") return val.toString();
  return val;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeDbManage(req);
  if (auth) return auth;

  const { sql } = await req.json();
  if (!sql || typeof sql !== "string" || !sql.trim()) {
    return NextResponse.json({ error: "Query SQL kosong" }, { status: 400 });
  }

  try {
    const [result] = await pool.execute(sql.trim());

    if (Array.isArray(result)) {
      const rows = (result as RowDataPacket[]).map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, serialize(v)]))
      );
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const actor = await getDbManageActor(req);
      await auditLog({
        actorType: "user",
        actorUsername: actor.username,
        actorRole: actor.role,
        actorIp: actor.ip,
        action: "DB_MANAGE_QUERY_SELECT",
        entityType: "db_manage_query",
        context: { sql: sql.trim().slice(0, 500), rowCount: rows.length },
      });
      return NextResponse.json({ type: "SELECT", columns, rows, count: rows.length });
    } else {
      const r = result as ResultSetHeader;
      const actor = await getDbManageActor(req);
      await auditLog({
        actorType: "user",
        actorUsername: actor.username,
        actorRole: actor.role,
        actorIp: actor.ip,
        action: "DB_MANAGE_QUERY_MODIFY",
        entityType: "db_manage_query",
        context: { sql: sql.trim().slice(0, 500), affectedRows: r.affectedRows, insertId: r.insertId || null },
      });
      return NextResponse.json({
        type: "MODIFY",
        affectedRows: r.affectedRows,
        insertId: r.insertId,
        message: `${r.affectedRows} baris terpengaruh${r.insertId ? `, insertId: ${r.insertId}` : ""}`,
      });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query gagal" },
      { status: 400 }
    );
  }
}
