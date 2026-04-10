import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { RowDataPacket } from "mysql2";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { denyIfUnauthorized } from "@/lib/rbac";

type InquiryStatusFilter = "ALL" | "SUCCESS" | "FAILED";
type InquiryErrorCategoryFilter = "ALL" | "DB" | "NETWORK" | "PROVIDER" | "APPLICATION";

function categorizeInquiryError(errorCode: string | null, eventType: string | null): string {
  if (errorCode?.startsWith("DB_")) return "DB";
  if (errorCode?.startsWith("NETWORK_")) return "NETWORK";
  if (
    errorCode?.startsWith("PDAM_") ||
    errorCode?.startsWith("LUNASIN_") ||
    errorCode?.startsWith("HTTP_") ||
    /^\d{4}$/.test(errorCode || "")
  ) return "PROVIDER";
  if (eventType === "INQUIRY_FAILED") return errorCode ? "APPLICATION" : "APPLICATION";
  return "-";
}

function buildWhereClause(
  searchParams: URLSearchParams
): {
  whereClause: string;
  params: Array<string | number>;
} {
  const status = (searchParams.get("status") || "ALL") as InquiryStatusFilter;
  const errorCategory = (searchParams.get("errorCategory") || "ALL") as InquiryErrorCategoryFilter;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim();
  const username = searchParams.get("username")?.trim();
  const provider = searchParams.get("provider")?.trim().toUpperCase();

  const whereClauses = ["event_type IN ('INQUIRY_SUCCESS', 'INQUIRY_FAILED')"];
  const params: Array<string | number> = [];

  if (provider && provider !== "ALL") {
    whereClauses.push("provider = ?");
    params.push(provider);
  }

  if (status === "SUCCESS") {
    whereClauses.push("event_type = 'INQUIRY_SUCCESS'");
  } else if (status === "FAILED") {
    whereClauses.push("event_type = 'INQUIRY_FAILED'");
  }

  if (errorCategory === "DB") {
    whereClauses.push("provider_error_code LIKE 'DB_%'");
  } else if (errorCategory === "NETWORK") {
    whereClauses.push("provider_error_code LIKE 'NETWORK_%'");
  } else if (errorCategory === "PROVIDER") {
    whereClauses.push("(provider_error_code LIKE 'PDAM_%' OR provider_error_code LIKE 'HTTP_%')");
  } else if (errorCategory === "APPLICATION") {
    whereClauses.push("event_type = 'INQUIRY_FAILED'");
    whereClauses.push("provider_error_code IS NOT NULL");
    whereClauses.push("provider_error_code <> ''");
    whereClauses.push("provider_error_code NOT LIKE 'DB_%'");
    whereClauses.push("provider_error_code NOT LIKE 'NETWORK_%'");
    whereClauses.push("provider_error_code NOT LIKE 'PDAM_%'");
    whereClauses.push("provider_error_code NOT LIKE 'HTTP_%'");
  }

  if (startDate && endDate) {
    whereClauses.push("DATE(created_at) BETWEEN ? AND ?");
    params.push(startDate, endDate);
  }

  if (search) {
    const searchValue = `%${search}%`;
    whereClauses.push(`(
      cust_id LIKE ?
      OR username LIKE ?
      OR COALESCE(loket_code, '') LIKE ?
      OR COALESCE(provider_error_code, '') LIKE ?
      OR COALESCE(message, '') LIKE ?
    )`);
    params.push(searchValue, searchValue, searchValue, searchValue, searchValue);
  }

  if (username) {
    whereClauses.push("username LIKE ?");
    params.push(`%${username}%`);
  }

  return {
    whereClause: whereClauses.join(" AND "),
    params,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));

  try {
    const { whereClause, params } = buildWhereClause(searchParams);

    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT event_type, COUNT(*) AS count
         FROM transaction_events
        WHERE ${whereClause}
        GROUP BY event_type`,
      params
    );

    const summary = {
      total: 0,
      success: 0,
      failed: 0,
    };

    for (const row of summaryRows) {
      const count = Number(row.count ?? 0);
      summary.total += count;
      if (row.event_type === "INQUIRY_SUCCESS") summary.success += count;
      if (row.event_type === "INQUIRY_FAILED") summary.failed += count;
    }

    const [metricsRows] = await pool.query<RowDataPacket[]>(
      `SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN event_type = 'INQUIRY_SUCCESS' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN event_type = 'INQUIRY_FAILED' THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN provider_error_code LIKE 'DB_%' THEN 1 ELSE 0 END) AS db_failures,
          SUM(CASE WHEN provider_error_code LIKE 'NETWORK_%' THEN 1 ELSE 0 END) AS network_failures,
          SUM(CASE WHEN provider_error_code LIKE 'PDAM_%' OR provider_error_code LIKE 'LUNASIN_%' OR provider_error_code LIKE 'HTTP_%' OR provider_error_code REGEXP '^[0-9]{4}$' THEN 1 ELSE 0 END) AS provider_failures,
          SUM(CASE WHEN event_type = 'INQUIRY_FAILED'
                   AND provider_error_code IS NOT NULL
                   AND provider_error_code <> ''
                   AND provider_error_code NOT LIKE 'DB_%'
                   AND provider_error_code NOT LIKE 'NETWORK_%'
                   AND provider_error_code NOT LIKE 'PDAM_%'
                   AND provider_error_code NOT LIKE 'LUNASIN_%'
                   AND provider_error_code NOT LIKE 'HTTP_%'
              THEN 1 ELSE 0 END) AS application_failures
         FROM transaction_events
        WHERE ${whereClause}`,
      params
    );

    const metricRow = metricsRows[0] ?? {};
    const totalCount = Number(metricRow.total_count ?? 0);
    const successCount = Number(metricRow.success_count ?? 0);
    const failedCount = Number(metricRow.failed_count ?? 0);

    const [topErrorRows] = await pool.query<RowDataPacket[]>(
      `SELECT provider_error_code, COUNT(*) AS count
         FROM transaction_events
        WHERE ${whereClause}
          AND provider_error_code IS NOT NULL
          AND provider_error_code <> ''
        GROUP BY provider_error_code
        ORDER BY count DESC, provider_error_code ASC
        LIMIT 1`,
      params
    );

    const topError = topErrorRows[0]
      ? {
          code: String(topErrorRows[0].provider_error_code),
          count: Number(topErrorRows[0].count ?? 0),
        }
      : null;

    const [errorCategoryRows] = await pool.query<RowDataPacket[]>(
      `SELECT provider_error_code, event_type, COUNT(*) AS count
         FROM transaction_events
        WHERE ${whereClause}
        GROUP BY provider_error_code, event_type`,
      params
    );

    const errorCategoryMap = new Map<string, number>();
    for (const row of errorCategoryRows) {
      const category = categorizeInquiryError(
        row.provider_error_code ? String(row.provider_error_code) : null,
        row.event_type ? String(row.event_type) : null
      );
      errorCategoryMap.set(category, (errorCategoryMap.get(category) ?? 0) + Number(row.count ?? 0));
    }

    const errorCategorySummary = Array.from(errorCategoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
         FROM transaction_events
        WHERE ${whereClause}`,
      params
    );

    const totalItems = Number(countRows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;

    const [listRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, event_type, severity, provider, http_status, provider_error_code,
              message, CAST(payload_json AS CHAR) AS payload_json, created_at,
              cust_id, username, loket_code
         FROM transaction_events
        WHERE ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const inquiries = listRows.map((row) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = row.payload_json ? JSON.parse(row.payload_json) : null;
      } catch {
        payload = null;
      }

      const status = row.event_type === "INQUIRY_SUCCESS" ? "SUCCESS" : "FAILED";
      const periods = Array.isArray(payload?.periods)
        ? (payload?.periods as unknown[]).map((item) => String(item))
        : [];

      return {
        id: Number(row.id),
        status,
        eventType: String(row.event_type),
        severity: String(row.severity || (status === "FAILED" ? "ERROR" : "INFO")),
        provider: String(row.provider || "PDAM"),
        httpStatus: row.http_status != null ? Number(row.http_status) : null,
        providerErrorCode: row.provider_error_code ? String(row.provider_error_code) : null,
        errorCategory: categorizeInquiryError(
          row.provider_error_code ? String(row.provider_error_code) : null,
          row.event_type ? String(row.event_type) : null
        ),
        message: row.message ? String(row.message) : null,
        createdAt: row.created_at,
        custId: row.cust_id ? String(row.cust_id) : "-",
        username: row.username ? String(row.username) : "-",
        loketCode: row.loket_code ? String(row.loket_code) : "-",
        billCount: Number(payload?.billCount ?? periods.length ?? 0),
        periods,
        rawResponse: payload?.rawResponse ?? null,
        payload,
      };
    });

    return NextResponse.json({
      summary,
      metrics: {
        successRate: totalCount > 0 ? Number(((successCount / totalCount) * 100).toFixed(2)) : 0,
        failureRate: totalCount > 0 ? Number(((failedCount / totalCount) * 100).toFixed(2)) : 0,
        topError,
        providerFailures: Number(metricRow.provider_failures ?? 0),
        dbFailures: Number(metricRow.db_failures ?? 0),
        networkFailures: Number(metricRow.network_failures ?? 0),
        applicationFailures: Number(metricRow.application_failures ?? 0),
      },
      errorCategorySummary,
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
      inquiries,
    });
  } catch (error) {
    console.error("Monitoring inquiry error:", error);
    return NextResponse.json({ error: "Gagal mengambil data monitoring inquiry" }, { status: 500 });
  }
}