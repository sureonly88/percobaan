import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifyDbManageToken } from "@/lib/db-manage-auth";
import { RowDataPacket } from "mysql2";

export async function GET(req: NextRequest) {
  if (!verifyDbManageToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT TABLE_NAME,
              COALESCE(TABLE_ROWS, 0) as TABLE_ROWS,
              COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as DATA_SIZE,
              TABLE_COMMENT
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME`
    );
    return NextResponse.json({ tables: rows });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengambil daftar tabel" }, { status: 500 });
  }
}
