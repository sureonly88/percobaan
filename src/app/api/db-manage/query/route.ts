import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifyDbManageToken } from "@/lib/db-manage-auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";

function serialize(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (Buffer.isBuffer(val)) return `[BLOB ${val.length} bytes]`;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "bigint") return val.toString();
  return val;
}

export async function POST(req: NextRequest) {
  if (!verifyDbManageToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      return NextResponse.json({ type: "SELECT", columns, rows, count: rows.length });
    } else {
      const r = result as ResultSetHeader;
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
