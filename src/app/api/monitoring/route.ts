import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { logTransactionEventSafe } from "@/lib/transaction-events";

function categorizeError(errorCode: string | null, lastEventType: string | null): string {
  if (errorCode === "MANUALLY_RESOLVED" || lastEventType === "PAYMENT_MANUALLY_RESOLVED") {
    return "MANUAL";
  }
  if (errorCode?.startsWith("DB_") || lastEventType?.includes("DB_")) {
    return "DB";
  }
  if (errorCode?.startsWith("NETWORK_")) {
    return "NETWORK";
  }
  if (
    errorCode?.startsWith("PDAM_") ||
    errorCode?.startsWith("LUNASIN_") ||
    errorCode?.startsWith("HTTP_") ||
    /^\d{4}$/.test(errorCode || "")
  ) {
    return "PROVIDER";
  }
  if (lastEventType?.includes("PROVIDER") || lastEventType?.startsWith("ADVICE_")) {
    return "PROVIDER";
  }
  return errorCode ? "APPLICATION" : "-";
}

function formatTrendDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // PENDING, SUCCESS, PARTIAL_SUCCESS, FAILED, or null for all
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search");
  const username = searchParams.get("username")?.trim();
  const errorCategoryFilter = searchParams.get("errorCategory");
  const providerFilter = searchParams.get("provider")?.trim().toUpperCase();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));

  try {
    const providerClause = providerFilter && providerFilter !== "ALL" ? " AND provider = ?" : "";
    const providerParams = providerClause ? [providerFilter] : [];

    // --- Summary, stuck, metrics, topError, retries, trend, errorCategories in parallel ---
    const [
      [summaryRows],
      [stuckRows],
      [metricsRows],
      [topErrorRows],
      retryResult,
      [trendRows],
      [errorCategoryRows],
    ] = await Promise.all([
      pool.query<RowDataPacket[]>(`
        SELECT 
          status,
          COUNT(*) as count,
          COALESCE(SUM(
            CASE WHEN response_payload IS NOT NULL 
              THEN JSON_LENGTH(JSON_EXTRACT(response_payload, '$.results'))
              ELSE 0
            END
          ), 0) as bill_count
        FROM payment_requests
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${providerClause}
        GROUP BY status
      `, providerParams),
      pool.query<RowDataPacket[]>(`
        SELECT COUNT(*) as count
        FROM payment_requests
        WHERE status = 'PENDING'
          AND COALESCE(error_code, '') <> 'LUNASIN_PENDING'
          AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
          ${providerClause}
      `, providerParams),
      pool.query<RowDataPacket[]>(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
          COALESCE(AVG(CASE WHEN status <> 'PENDING' THEN TIMESTAMPDIFF(SECOND, created_at, updated_at) END), 0) AS avg_duration_seconds,
          SUM(CASE WHEN error_code LIKE 'DB_%' THEN 1 ELSE 0 END) AS db_failures,
          SUM(CASE WHEN error_code LIKE 'NETWORK_%' THEN 1 ELSE 0 END) AS network_failures,
          SUM(CASE WHEN error_code LIKE 'PDAM_%' OR error_code LIKE 'LUNASIN_%' OR error_code LIKE 'HTTP_%' OR error_code REGEXP '^[0-9]{4}$' THEN 1 ELSE 0 END) AS provider_failures
        FROM payment_requests
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${providerClause}
      `, providerParams),
      pool.query<RowDataPacket[]>(`
        SELECT error_code, COUNT(*) AS count
        FROM payment_requests
        WHERE error_code IS NOT NULL AND error_code <> ''
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${providerClause}
        GROUP BY error_code
        ORDER BY count DESC, error_code ASC
        LIMIT 1
      `, providerParams),
      pool.query<RowDataPacket[]>(`
        SELECT COALESCE(SUM(GREATEST(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.attempts')) AS UNSIGNED) - 1, 0)), 0) AS total_retries
        FROM transaction_events
        WHERE event_type IN ('PAYMENT_PROVIDER_SUCCESS', 'PAYMENT_PROVIDER_FAILED')
          AND JSON_EXTRACT(payload_json, '$.attempts') IS NOT NULL
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${providerClause}
      `, providerParams).catch(() => [[{ total_retries: 0 }] as RowDataPacket[]]),
      pool.query<RowDataPacket[]>(`
        SELECT DATE(created_at) AS trx_date, status, COUNT(*) AS count
        FROM payment_requests
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${providerClause}
        GROUP BY DATE(created_at), status
        ORDER BY trx_date ASC
      `, providerParams),
      pool.query<RowDataPacket[]>(`
        SELECT error_code, COUNT(*) AS count
        FROM payment_requests
        WHERE error_code IS NOT NULL AND error_code <> ''
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${providerClause}
        GROUP BY error_code
      `, providerParams),
    ]);

    const summary: Record<string, { count: number; billCount: number }> = {
      PENDING: { count: 0, billCount: 0 },
      SUCCESS: { count: 0, billCount: 0 },
      PARTIAL_SUCCESS: { count: 0, billCount: 0 },
      FAILED: { count: 0, billCount: 0 },
    };
    for (const row of summaryRows) {
      summary[row.status] = {
        count: Number(row.count),
        billCount: Number(row.bill_count),
      };
    }

    const stuckCount = Number(stuckRows[0]?.count ?? 0);

    const metricRow = metricsRows[0] ?? {};
    const totalCount = Number(metricRow.total_count ?? 0);
    const successCountOverall = Number(metricRow.success_count ?? 0);
    const failedCountOverall = Number(metricRow.failed_count ?? 0);
    const avgDurationSeconds = Number(metricRow.avg_duration_seconds ?? 0);

    const totalRetries = Number((retryResult as RowDataPacket[][])[0]?.[0]?.total_retries ?? 0);

    const topError = topErrorRows[0]
      ? {
          code: String(topErrorRows[0].error_code),
          count: Number(topErrorRows[0].count ?? 0),
        }
      : null;

    const [trendRowsData] = [trendRows];

    const trendMap = new Map<string, {
      date: string;
      label: string;
      total: number;
      success: number;
      failed: number;
      pending: number;
      partialSuccess: number;
    }>();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      trendMap.set(iso, {
        date: iso,
        label: formatTrendDate(iso),
        total: 0,
        success: 0,
        failed: 0,
        pending: 0,
        partialSuccess: 0,
      });
    }

    for (const row of trendRowsData) {
      const dateKey = row.trx_date instanceof Date
        ? `${row.trx_date.getFullYear()}-${String(row.trx_date.getMonth() + 1).padStart(2, "0")}-${String(row.trx_date.getDate()).padStart(2, "0")}`
        : String(row.trx_date);
      const entry = trendMap.get(dateKey);
      if (!entry) continue;

      const count = Number(row.count ?? 0);
      entry.total += count;
      if (row.status === "SUCCESS") entry.success += count;
      if (row.status === "FAILED") entry.failed += count;
      if (row.status === "PENDING") entry.pending += count;
      if (row.status === "PARTIAL_SUCCESS") entry.partialSuccess += count;
    }

    const dailyTrends = Array.from(trendMap.values());

    const [errorCategoryData] = [errorCategoryRows];

    const errorCategoryMap = new Map<string, number>();
    for (const row of errorCategoryData) {
      const category = categorizeError(String(row.error_code), null);
      errorCategoryMap.set(category, (errorCategoryMap.get(category) ?? 0) + Number(row.count ?? 0));
    }

    const errorCategorySummary = Array.from(errorCategoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const metrics = {
      successRate: totalCount > 0 ? Number(((successCountOverall / totalCount) * 100).toFixed(2)) : 0,
      failureRate: totalCount > 0 ? Number(((failedCountOverall / totalCount) * 100).toFixed(2)) : 0,
      avgDurationSeconds,
      topError,
      totalRetries,
      providerFailures: Number(metricRow.provider_failures ?? 0),
      dbFailures: Number(metricRow.db_failures ?? 0),
      networkFailures: Number(metricRow.network_failures ?? 0),
    };

    // --- Transaction list (LEFT JOIN instead of 5 correlated subqueries) ---
    let listQuery = `
      SELECT 
        pr.id,
        pr.idempotency_key,
        pr.status,
        pr.provider,
        pr.loket_code,
        pr.username,
        pr.error_code,
        pr.error_message,
        pr.created_at,
        pr.updated_at,
        TIMESTAMPDIFF(SECOND, pr.created_at, pr.updated_at) as duration_seconds,
        te_latest.transaction_code,
        te_latest.event_type as last_event_type,
        te_latest.severity as last_event_severity,
        te_latest.message as last_event_message,
        te_latest.attempts,
        CASE 
          WHEN pr.status = 'PENDING'
            AND COALESCE(pr.error_code, '') <> 'LUNASIN_PENDING'
            AND pr.created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
          THEN 1 ELSE 0 
        END as is_stuck,
        CASE WHEN pr.response_payload IS NOT NULL 
          THEN COALESCE(JSON_LENGTH(JSON_EXTRACT(pr.response_payload, '$.results')), 0)
          ELSE COALESCE(JSON_LENGTH(JSON_EXTRACT(pr.request_payload, '$.bills')), 0)
        END as bill_count,
        CAST(pr.request_payload AS CHAR) as request_payload,
        CAST(pr.response_payload AS CHAR) as response_payload
      FROM payment_requests pr
      LEFT JOIN (
        SELECT te1.idempotency_key,
               te1.transaction_code,
               te1.event_type,
               te1.severity,
               te1.message,
               CAST(JSON_UNQUOTE(JSON_EXTRACT(te1.payload_json, '$.attempts')) AS UNSIGNED) as attempts
        FROM transaction_events te1
        INNER JOIN (
          SELECT idempotency_key, MAX(id) as max_id
          FROM transaction_events
          GROUP BY idempotency_key
        ) te2 ON te1.id = te2.max_id
      ) te_latest ON te_latest.idempotency_key = pr.idempotency_key
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status && status !== "ALL") {
      if (status === "STUCK") {
        listQuery += " AND pr.status = 'PENDING' AND pr.created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)";
      } else {
        listQuery += " AND pr.status = ?";
        params.push(status);
      }
    }

    if (startDate && endDate) {
      listQuery += " AND DATE(pr.created_at) BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    if (search) {
      listQuery += " AND (pr.idempotency_key LIKE ? OR pr.username LIKE ? OR pr.loket_code LIKE ?)";
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    if (username) {
      listQuery += " AND pr.username LIKE ?";
      params.push(`%${username}%`);
    }

    if (providerClause) {
      listQuery += " AND pr.provider = ?";
      params.push(providerFilter as string);
    }

    listQuery += " ORDER BY pr.created_at DESC LIMIT 300";

    const [listRows] = await pool.query<RowDataPacket[]>(listQuery, params);

    const mappedTransactions = listRows.map((row) => {
      let billCount = Number(row.bill_count ?? 0);
      let successBills = 0;
      let failedBills = 0;
      let totalNominal = 0;

      if (row.response_payload) {
        try {
          const resp = JSON.parse(row.response_payload);
          const results = resp.results || [];
          billCount = results.length;
          successBills = results.filter((r: { success: boolean }) => r.success).length;
          failedBills = results.filter((r: { success: boolean }) => !r.success).length;
          totalNominal = results.reduce((sum: number, r: { total: number }) => sum + (r.total || 0), 0);
        } catch { /* ignore parse errors */ }
      } else if (row.request_payload) {
        try {
          const req = JSON.parse(row.request_payload);
          billCount = req.bills?.length || 0;
          totalNominal = (req.bills || []).reduce((sum: number, b: { total: number }) => sum + (b.total || 0), 0);
        } catch { /* ignore */ }
      }

      return {
        id: row.id,
        idempotencyKey: row.idempotency_key,
        transactionCode: row.transaction_code,
        status: row.status,
        provider: row.provider,
        loketCode: row.loket_code,
        username: row.username,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        errorCategory: categorizeError(row.error_code, row.last_event_type),
        lastEventType: row.last_event_type,
        lastEventSeverity: row.last_event_severity,
        lastEventMessage: row.last_event_message,
        attempts: row.attempts != null ? Number(row.attempts) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        durationSeconds: Number(row.duration_seconds),
        isStuck: row.is_stuck === 1,
        billCount,
        successBills,
        failedBills,
        totalNominal,
      };
    });

    const filteredTransactions = mappedTransactions.filter(
      (txn) => !errorCategoryFilter || errorCategoryFilter === "ALL" || txn.errorCategory === errorCategoryFilter
    );

    const totalFiltered = filteredTransactions.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const transactions = filteredTransactions.slice(offset, offset + pageSize);

    const alerts: Array<{ level: "WARN" | "ERROR"; title: string; message: string }> = [];

    if (stuckCount > 0) {
      alerts.push({
        level: "ERROR",
        title: "Transaksi gantung terdeteksi",
        message: `${stuckCount} transaksi masih PENDING lebih dari 5 menit dan perlu direview.`,
      });
    }

    if (metrics.failureRate >= 20 && totalCount >= 5) {
      alerts.push({
        level: "ERROR",
        title: "Failure rate tinggi",
        message: `Failure rate saat ini ${metrics.failureRate}% dari ${totalCount} request. Perlu investigasi error dominan.`,
      });
    }

    if (metrics.providerFailures >= 3) {
      alerts.push({
        level: "WARN",
        title: "Gangguan provider terindikasi",
        message: `${metrics.providerFailures} request gagal pada level provider/HTTP. Cek integrasi provider (PDAM/Lunasin) atau konektivitas eksternal.`,
      });
    }

    if (metrics.totalRetries >= 5) {
      alerts.push({
        level: "WARN",
        title: "Retry transaksi meningkat",
        message: `Total retry tercatat ${metrics.totalRetries}. Ini bisa menandakan latency atau instabilitas provider.`,
      });
    }

    return NextResponse.json({
      summary,
      metrics,
      dailyTrends,
      errorCategorySummary,
      alerts,
      stuckCount,
      pagination: {
        page: currentPage,
        pageSize,
        totalItems: totalFiltered,
        totalPages,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
      transactions,
    });
  } catch (error) {
    console.error("Monitoring error:", error);
    return NextResponse.json({ error: "Gagal mengambil data monitoring" }, { status: 500 });
  }
}

// Force-resolve a stuck PENDING transaction
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "PATCH");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const body = await req.json();
  const { id, action } = body as { id: number; action: "resolve_stuck" };

  if (action !== "resolve_stuck") {
    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  }

  try {
    const actor = (session?.user as { username?: string; email?: string; name?: string } | undefined);
    const actorName = actor?.username || actor?.email || actor?.name || "";

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, status, created_at, idempotency_key, loket_code, username, provider
         FROM payment_requests
        WHERE id = ?
        LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }
    if (row.status !== "PENDING") {
      return NextResponse.json({ error: `Transaksi berstatus ${row.status}, bukan PENDING` }, { status: 400 });
    }

    await pool.execute(
      `UPDATE payment_requests
          SET status = 'FAILED',
              error_code = 'MANUALLY_RESOLVED',
              error_message = 'Transaksi gantung diselesaikan secara manual oleh admin',
              updated_at = NOW()
        WHERE id = ? AND status = 'PENDING'`,
      [id]
    );

    await logTransactionEventSafe({
      idempotencyKey: row.idempotency_key,
      provider: row.provider || "PDAM",
      eventType: "PAYMENT_MANUALLY_RESOLVED",
      severity: "WARN",
      username: actorName,
      loketCode: row.loket_code,
      message: "Transaksi gantung diselesaikan manual oleh admin/supervisor",
      providerErrorCode: "MANUALLY_RESOLVED",
      payload: {
        resolvedBy: actorName,
        originalUsername: row.username,
        previousStatus: row.status,
        action,
      },
    });

    return NextResponse.json({ success: true, message: "Transaksi berhasil diresolve sebagai FAILED" });
  } catch (error) {
    console.error("Resolve stuck error:", error);
    return NextResponse.json({ error: "Gagal meresolve transaksi" }, { status: 500 });
  }
}
