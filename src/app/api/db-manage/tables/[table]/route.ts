import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifyDbManageToken } from "@/lib/db-manage-auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";

type Params = Promise<{ table: string }>;

function serialize(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (Buffer.isBuffer(val)) return `[BLOB ${val.length} bytes]`;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "bigint") return val.toString();
  return val;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, serialize(v)]));
}

async function getValidTable(name: string): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [name]
  );
  return rows.length > 0 ? (rows[0].TABLE_NAME as string) : null;
}

async function getColumns(tableName: string): Promise<RowDataPacket[]> {
  const [cols] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE,
            COLUMN_KEY, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return cols;
}

// GET: list rows or schema
export async function GET(req: NextRequest, { params }: { params: Params }) {
  if (!verifyDbManageToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await params;
  const tableName = await getValidTable(table);
  if (!tableName) return NextResponse.json({ error: "Tabel tidak ditemukan" }, { status: 404 });

  const { searchParams } = new URL(req.url);

  if (searchParams.get("action") === "schema") {
    const cols = await getColumns(tableName);
    return NextResponse.json({ columns: cols });
  }

  const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"));
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const offset = (page - 1) * limit;
  const search   = searchParams.get("search")?.trim() || "";
  const sortCol  = searchParams.get("sort") || "";
  const sortDir  = searchParams.get("dir") === "DESC" ? "DESC" : "ASC";

  try {
    const cols = await getColumns(tableName);
    const validCols = new Set(cols.map(c => c.COLUMN_NAME as string));

    // Build WHERE (search across text-like columns)
    let whereClause = "";
    const whereValues: string[] = [];
    if (search) {
      const searchable = cols.filter(c =>
        ["varchar","char","text","tinytext","mediumtext","longtext","enum","int","bigint","decimal","float","double"].includes(
          (c.DATA_TYPE as string).toLowerCase()
        )
      );
      if (searchable.length > 0) {
        const conditions = searchable.map(c => `CAST(\`${c.COLUMN_NAME}\` AS CHAR) LIKE ?`);
        whereClause = `WHERE ${conditions.join(" OR ")}`;
        whereValues.push(...searchable.map(() => `%${search}%`));
      }
    }

    // Build ORDER BY (validate column name)
    let orderClause = "";
    if (sortCol && validCols.has(sortCol)) {
      orderClause = `ORDER BY \`${sortCol}\` ${sortDir}`;
    }

    const [countResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereClause}`,
      whereValues
    );
    const total = countResult[0].total as number;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM \`${tableName}\` ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...whereValues, limit, offset]
    );

    return NextResponse.json({
      rows: rows.map(serializeRow),
      total,
      page,
      pages: Math.ceil(total / limit),
      columns: cols,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal" }, { status: 500 });
  }
}

// POST: insert row
export async function POST(req: NextRequest, { params }: { params: Params }) {
  if (!verifyDbManageToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await params;
  const tableName = await getValidTable(table);
  if (!tableName) return NextResponse.json({ error: "Tabel tidak ditemukan" }, { status: 404 });

  try {
    const body: Record<string, unknown> = await req.json();
    const cols = await getColumns(tableName);

    const insertCols: string[] = [];
    const insertVals: unknown[] = [];

    for (const col of cols) {
      const extra = (col.EXTRA as string) || "";
      if (extra.includes("GENERATED")) continue; // skip virtual/stored generated
      const colName = col.COLUMN_NAME as string;
      if (!(colName in body)) continue;
      const val = body[colName];
      // Skip empty auto_increment (let DB auto-assign)
      if (extra.includes("auto_increment") && (val === "" || val === null)) continue;
      insertCols.push(colName);
      insertVals.push(val === "" ? null : val);
    }

    if (insertCols.length === 0) {
      return NextResponse.json({ error: "Tidak ada kolom yang valid untuk diinsert" }, { status: 400 });
    }

    const colList = insertCols.map(c => `\`${c}\``).join(", ");
    const placeholders = insertCols.map(() => "?").join(", ");

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${tableName}\` (${colList}) VALUES (${placeholders})`,
      insertVals as (string | number | boolean | null)[]
    );

    return NextResponse.json({ success: true, insertId: result.insertId });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Insert gagal" }, { status: 400 });
  }
}

// PUT: update row
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  if (!verifyDbManageToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await params;
  const tableName = await getValidTable(table);
  if (!tableName) return NextResponse.json({ error: "Tabel tidak ditemukan" }, { status: 404 });

  try {
    const { where, data }: { where: Record<string, unknown>; data: Record<string, unknown> } = await req.json();
    if (!where || !data) return NextResponse.json({ error: "Missing where atau data" }, { status: 400 });

    const cols = await getColumns(tableName);
    const validCols = new Set(cols.map(c => c.COLUMN_NAME as string));
    const generatedCols = new Set(
      cols.filter(c => (c.EXTRA as string)?.includes("GENERATED")).map(c => c.COLUMN_NAME as string)
    );

    const setCols   = Object.keys(data).filter(k => validCols.has(k) && !generatedCols.has(k));
    const whereCols = Object.keys(where).filter(k => validCols.has(k));

    if (setCols.length === 0)   return NextResponse.json({ error: "Tidak ada kolom data yang valid" }, { status: 400 });
    if (whereCols.length === 0) return NextResponse.json({ error: "Tidak ada kolom where yang valid" }, { status: 400 });

    const setClause   = setCols.map(c => `\`${c}\` = ?`).join(", ");
    const whereClause = whereCols.map(c => `\`${c}\` = ?`).join(" AND ");

    await pool.execute(
      `UPDATE \`${tableName}\` SET ${setClause} WHERE ${whereClause}`,
      [
        ...setCols.map(c => (data[c] === "" ? null : data[c])),
        ...whereCols.map(c => where[c]),
      ] as (string | number | boolean | null)[]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update gagal" }, { status: 400 });
  }
}

// DELETE: delete row
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  if (!verifyDbManageToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await params;
  const tableName = await getValidTable(table);
  if (!tableName) return NextResponse.json({ error: "Tabel tidak ditemukan" }, { status: 404 });

  try {
    const { where }: { where: Record<string, unknown> } = await req.json();
    if (!where) return NextResponse.json({ error: "Missing where clause" }, { status: 400 });

    const cols = await getColumns(tableName);
    const validCols = new Set(cols.map(c => c.COLUMN_NAME as string));
    const whereCols = Object.keys(where).filter(k => validCols.has(k));

    if (whereCols.length === 0) return NextResponse.json({ error: "Tidak ada kolom where yang valid" }, { status: 400 });

    const whereClause = whereCols.map(c => `\`${c}\` = ?`).join(" AND ");

    await pool.execute(
      `DELETE FROM \`${tableName}\` WHERE ${whereClause}`,
      whereCols.map(c => where[c]) as (string | number | boolean | null)[]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete gagal" }, { status: 400 });
  }
}
