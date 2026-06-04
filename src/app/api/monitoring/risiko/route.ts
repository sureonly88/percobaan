import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type RiskSeverity = "critical" | "high" | "medium" | "low";

interface RiskItem {
  id: string;
  type: string;
  severity: RiskSeverity;
  title: string;
  description: string;
  metric: string;
  href: string;
  createdAt: string | null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function scoreForSeverity(severity: RiskSeverity): number {
  if (severity === "critical") return 25;
  if (severity === "high") return 15;
  if (severity === "medium") return 8;
  return 3;
}

async function safeQuery<T extends RowDataPacket[]>(sql: string, params: Array<string | number> = []): Promise<T> {
  try {
    const [rows] = await pool.query<T>(sql, params);
    return rows;
  } catch (error) {
    console.warn("Risk dashboard query skipped:", error instanceof Error ? error.message : error);
    return [] as unknown as T;
  }
}

export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (token.role !== "admin" && token.role !== "supervisor") {
    return forbidden("Hanya admin dan supervisor yang dapat melihat dashboard risiko");
  }

  const [
    staleRows,
    invoiceRows,
    providerRows,
    loketRows,
    loketAnomalyRows,
    settlementRows,
    jobRows,
  ] = await Promise.all([
    safeQuery<RowDataPacket[]>(
      `SELECT mpi.id, mpi.provider, mpi.service_type, mpi.customer_id, mpi.customer_name,
              mpi.total, mpi.status, mpi.transaction_code, mpi.created_at, mpi.updated_at,
              TIMESTAMPDIFF(MINUTE, mpi.created_at, NOW()) AS age_minutes,
              mpr.multi_payment_code, mpr.idempotency_key, mpr.loket_code, mpr.loket_name
         FROM multi_payment_items mpi
         JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
        WHERE mpi.status IN ('PENDING','PENDING_PROVIDER','PENDING_ADVICE')
          AND mpi.created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        ORDER BY mpi.created_at ASC
        LIMIT 20`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT invoice_code, status, customer_name, customer_phone, grand_total,
              loket_code, loket_name, created_at, updated_at, paid_gateway_at,
              TIMESTAMPDIFF(MINUTE, COALESCE(paid_gateway_at, updated_at, created_at), NOW()) AS age_minutes
         FROM payment_invoices
        WHERE status IN ('PAID_GATEWAY','PROCESSING_PROVIDER','FAILED_PROVIDER','PARTIAL_SUCCESS','PENDING_REVIEW')
        ORDER BY FIELD(status, 'FAILED_PROVIDER','PAID_GATEWAY','PENDING_REVIEW','PARTIAL_SUCCESS','PROCESSING_PROVIDER'), updated_at ASC
        LIMIT 20`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT provider_name, state, failure_count, success_24h, failure_24h,
              avg_latency_ms_24h, p95_latency_ms_24h, last_failure_at, opened_at, rollup_updated_at
         FROM provider_health
        WHERE state <> 'CLOSED'
           OR failure_count > 0
           OR (success_24h + failure_24h >= 10 AND (success_24h / NULLIF(success_24h + failure_24h, 0)) < 0.95)
           OR p95_latency_ms_24h >= 8000
        ORDER BY FIELD(state, 'OPEN','HALF_OPEN','CLOSED'), failure_count DESC, p95_latency_ms_24h DESC`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT loket_code, nama, pulsa, status, is_blok, blok_message
         FROM lokets
        WHERE status <> 'aktif'
           OR is_blok = 1
           OR pulsa <= 200000
        ORDER BY is_blok DESC, pulsa ASC
        LIMIT 20`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT mpr.loket_code, COALESCE(mpr.loket_name, mpr.loket_code) AS loket_name,
              COUNT(*) AS total_items,
              SUM(mpi.status = 'FAILED') AS failed_items,
              SUM(mpi.status IN ('PENDING','PENDING_PROVIDER','PENDING_ADVICE')) AS pending_items,
              ROUND((SUM(mpi.status = 'FAILED') / NULLIF(COUNT(*), 0)) * 100, 2) AS failed_rate
         FROM multi_payment_items mpi
         JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
        WHERE mpi.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY mpr.loket_code, mpr.loket_name
       HAVING total_items >= 5 AND (failed_rate >= 10 OR pending_items >= 3)
        ORDER BY failed_rate DESC, pending_items DESC
        LIMIT 10`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT id, batch_date, loket_code, status, net_payable, created_at, updated_at,
              TIMESTAMPDIFF(HOUR, created_at, NOW()) AS age_hours
         FROM settlement_batches
        WHERE status IN ('DRAFT','APPROVED')
          AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY created_at ASC
        LIMIT 10`
    ),
    safeQuery<RowDataPacket[]>(
      `SELECT job_name, is_locked, locked_at, last_run_at, last_status, fail_count,
              TIMESTAMPDIFF(MINUTE, COALESCE(last_run_at, locked_at), NOW()) AS idle_minutes
         FROM system_jobs
        WHERE last_status = 'FAILED'
           OR fail_count > 0
           OR (job_name IN ('auto_resolve_pending','provider_health_rollup','process_paid_invoices','expire_payment_links')
               AND COALESCE(last_run_at, locked_at) < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
        ORDER BY last_status = 'FAILED' DESC, fail_count DESC`
    ),
  ]);

  const items: RiskItem[] = [];

  for (const row of staleRows) {
    const minutes = Number(row.age_minutes ?? 0);
    const severity: RiskSeverity = minutes >= 60 ? "critical" : minutes >= 30 ? "high" : "medium";
    items.push({
      id: `stale-${row.id}`,
      type: "Pending Lama",
      severity,
      title: `${row.provider} ${row.customer_id} masih ${row.status}`,
      description: `${row.loket_name || row.loket_code || "Loket"} · ${row.multi_payment_code || row.transaction_code || row.idempotency_key}`,
      metric: `${minutes} menit`,
      href: "/pending-transaksi",
      createdAt: iso(row.created_at),
    });
  }

  for (const row of invoiceRows) {
    const status = String(row.status);
    const minutes = Number(row.age_minutes ?? 0);
    const severity: RiskSeverity = status === "FAILED_PROVIDER" ? "critical" : status === "PAID_GATEWAY" && minutes >= 10 ? "high" : "medium";
    items.push({
      id: `invoice-${row.invoice_code}`,
      type: "Payment Link",
      severity,
      title: `${row.invoice_code} berstatus ${status}`,
      description: `${row.customer_name || row.customer_phone || "Pelanggan"} · ${row.loket_name || row.loket_code || "Online"}`,
      metric: `Rp ${Number(row.grand_total || 0).toLocaleString("id-ID")}`,
      href: "/payment-links",
      createdAt: iso(row.updated_at || row.created_at),
    });
  }

  for (const row of providerRows) {
    const state = String(row.state);
    const total = Number(row.success_24h ?? 0) + Number(row.failure_24h ?? 0);
    const successRate = total > 0 ? (Number(row.success_24h ?? 0) / total) * 100 : 100;
    const severity: RiskSeverity = state === "OPEN" ? "critical" : state === "HALF_OPEN" || successRate < 90 ? "high" : "medium";
    items.push({
      id: `provider-${row.provider_name}`,
      type: "Provider",
      severity,
      title: `${row.provider_name} ${state}`,
      description: `Success rate 24 jam ${successRate.toFixed(1)}%, p95 ${Number(row.p95_latency_ms_24h || 0).toLocaleString("id-ID")} ms`,
      metric: `${Number(row.failure_count || 0)} gagal beruntun`,
      href: "/monitoring/provider-health",
      createdAt: iso(row.opened_at || row.last_failure_at || row.rollup_updated_at),
    });
  }

  for (const row of loketRows) {
    const blocked = Number(row.is_blok ?? 0) === 1;
    const inactive = String(row.status) !== "aktif";
    const pulsa = Number(row.pulsa ?? 0);
    const severity: RiskSeverity = blocked || inactive ? "high" : pulsa <= 50000 ? "high" : "medium";
    items.push({
      id: `loket-${row.loket_code}`,
      type: "Saldo/Loket",
      severity,
      title: `${row.nama || row.loket_code} ${blocked ? "diblokir" : inactive ? "nonaktif" : "saldo rendah"}`,
      description: row.blok_message || `Status ${row.status}, saldo tersisa Rp ${pulsa.toLocaleString("id-ID")}`,
      metric: `Rp ${pulsa.toLocaleString("id-ID")}`,
      href: "/loket",
      createdAt: null,
    });
  }

  for (const row of loketAnomalyRows) {
    const failedRate = Number(row.failed_rate ?? 0);
    const pending = Number(row.pending_items ?? 0);
    items.push({
      id: `loket-anomaly-${row.loket_code}`,
      type: "Anomali Loket",
      severity: failedRate >= 20 || pending >= 5 ? "high" : "medium",
      title: `${row.loket_name || row.loket_code} perlu dicek`,
      description: `${Number(row.total_items || 0)} item 24 jam terakhir, ${Number(row.failed_items || 0)} gagal, ${pending} pending`,
      metric: `${failedRate.toFixed(1)}% gagal`,
      href: "/monitoring",
      createdAt: null,
    });
  }

  for (const row of settlementRows) {
    const hours = Number(row.age_hours ?? 0);
    items.push({
      id: `settlement-${row.id}`,
      type: "Settlement",
      severity: hours >= 72 ? "high" : "medium",
      title: `Settlement ${row.loket_code} masih ${row.status}`,
      description: `Batch ${row.batch_date}, umur ${hours} jam`,
      metric: `Rp ${Number(row.net_payable || 0).toLocaleString("id-ID")}`,
      href: `/settlement/${row.id}`,
      createdAt: iso(row.created_at),
    });
  }

  for (const row of jobRows) {
    const failed = String(row.last_status || "") === "FAILED";
    const idle = Number(row.idle_minutes ?? 0);
    items.push({
      id: `job-${row.job_name}`,
      type: "Background Job",
      severity: failed ? "high" : "medium",
      title: `${row.job_name} ${failed ? "gagal" : "tidak berjalan"}`,
      description: `Terakhir aktif ${idle || 0} menit lalu, total fail ${Number(row.fail_count || 0)}`,
      metric: failed ? "FAILED" : `${idle} menit`,
      href: "/monitoring/provider-health",
      createdAt: iso(row.last_run_at || row.locked_at),
    });
  }

  items.sort((a, b) => scoreForSeverity(b.severity) - scoreForSeverity(a.severity));

  const summary = {
    total: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    high: items.filter((item) => item.severity === "high").length,
    medium: items.filter((item) => item.severity === "medium").length,
    low: items.filter((item) => item.severity === "low").length,
    score: Math.min(100, items.reduce((sum, item) => sum + scoreForSeverity(item.severity), 0)),
    pendingStale: staleRows.length,
    paymentLinkIssues: invoiceRows.length,
    providerIssues: providerRows.length,
    loketIssues: loketRows.length + loketAnomalyRows.length,
    settlementIssues: settlementRows.length,
    jobIssues: jobRows.length,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary,
    priorityItems: items.slice(0, 30),
    groups: {
      stalePending: staleRows.length,
      paymentLinks: invoiceRows.length,
      providers: providerRows.length,
      lokets: loketRows.length,
      loketAnomalies: loketAnomalyRows.length,
      settlements: settlementRows.length,
      jobs: jobRows.length,
    },
  });
}
