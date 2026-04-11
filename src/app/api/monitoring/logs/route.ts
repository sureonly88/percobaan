import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: authToken ? 403 : 401 });

  const { searchParams } = new URL(request.url);
  const idempotencyKey = searchParams.get("idempotencyKey");
  const transactionCode = searchParams.get("transactionCode");
  const username = searchParams.get("username");
  const createdAt = searchParams.get("createdAt");

  if (!idempotencyKey && !transactionCode && (!username || !createdAt)) {
    return NextResponse.json(
      { error: "Parameter idempotencyKey / transactionCode atau username + createdAt diperlukan" },
      { status: 400 }
    );
  }

  try {
    if (idempotencyKey || transactionCode) {
      const whereClauses: string[] = [];
      const params: string[] = [];

      if (idempotencyKey) {
        whereClauses.push("idempotency_key = ?");
        params.push(idempotencyKey);
      }
      if (transactionCode) {
        whereClauses.push("transaction_code = ?");
        params.push(transactionCode);
      }

      try {
        const [eventRows] = await pool.query<RowDataPacket[]>(
          `SELECT id, event_type, severity, provider, http_status, provider_error_code,
                  message, CAST(payload_json AS CHAR) AS payload_json, created_at,
                  idempotency_key, transaction_code, cust_id, username, loket_code
             FROM transaction_events
            WHERE ${whereClauses.join(" OR ")}
            ORDER BY created_at ASC, id ASC
            LIMIT 200`,
          params
        );

        const logs = eventRows.map((row) => {
          let parsedPayload: unknown = null;
          try {
            parsedPayload = row.payload_json ? JSON.parse(row.payload_json) : null;
          } catch {
            parsedPayload = row.payload_json;
          }

          return {
            id: row.id,
            eventType: row.event_type,
            severity: row.severity,
            provider: row.provider,
            httpStatus: row.http_status,
            providerErrorCode: row.provider_error_code,
            message: row.message,
            payload: parsedPayload,
            createdAt: row.created_at,
            idempotencyKey: row.idempotency_key,
            transactionCode: row.transaction_code,
            custId: row.cust_id,
            username: row.username,
            loketCode: row.loket_code,
          };
        });

        return NextResponse.json({ logs, source: "transaction_events" });
      } catch {
        // fallback to legacy logs below if migration/table is not ready yet
      }
    }

    if (!username || !createdAt) {
      return NextResponse.json({ logs: [], source: "transaction_events" });
    }

    // Legacy fallback: infer logs around transaction time
    const localDate = new Date(createdAt);
    const mysqlDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")} ${String(localDate.getHours()).padStart(2, "0")}:${String(localDate.getMinutes()).padStart(2, "0")}:${String(localDate.getSeconds()).padStart(2, "0")}`;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, jenis, CAST(log AS CHAR) as log, created_at, user_login
       FROM log_inquery
       WHERE user_login = ?
         AND created_at BETWEEN DATE_SUB(?, INTERVAL 5 MINUTE) AND DATE_ADD(?, INTERVAL 5 MINUTE)
       ORDER BY created_at ASC
       LIMIT 20`,
      [username, mysqlDate, mysqlDate]
    );

    const logs = rows.map((r) => {
      let parsed = null;
      try {
        parsed = JSON.parse(r.log);
      } catch { /* keep as string */ }
      return {
        id: r.id,
        jenis: r.jenis,
        log: parsed ?? r.log,
        createdAt: r.created_at,
        userLogin: r.user_login,
      };
    });

    return NextResponse.json({ logs, source: "log_inquery" });
  } catch (error) {
    console.error("Monitoring logs error:", error);
    return NextResponse.json({ error: "Gagal mengambil log" }, { status: 500 });
  }
}
