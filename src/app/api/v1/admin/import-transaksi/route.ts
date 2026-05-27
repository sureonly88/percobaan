import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";
import { auditLog } from "@/lib/audit-log";

// Vercel / edge max execution time (adjust to hosting environment)
export const maxDuration = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExportPayment {
  multi_payment_code: string;
  idempotency_key: string;
  status: string;
  loket_code: string;
  loket_name: string;
  username: string;
  total_items: number;
  total_amount: number;
  total_admin: number;
  grand_total: number;
  paid_amount: number;
  change_amount: number;
  paid_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ExportItem {
  item_code: string;
  product_code?: string | null;
  provider: string;
  service_type: string;
  customer_id: string;
  customer_name: string;
  period_label: string | null;
  amount: number;
  admin_fee: number;
  total: number;
  status: string;
  transaction_code: string;
  provider_error_code: string | null;
  provider_error_message: string | null;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string | null;
  metadata_json: Record<string, unknown>;
}

interface ExportRecord {
  payment: ExportPayment;
  item: ExportItem;
}

interface ImportStats {
  inserted: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchExportPage(
  sourceUrl: string,
  token: string,
  params: Record<string, string>
): Promise<{ data: ExportRecord[]; pagination: { last_page: number; total: number } }> {
  const url = new URL("/report/export/transaksi", sourceUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "report-token": token },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (!json.status) {
    throw new Error(json.message || "API returned status false");
  }

  return json;
}

/**
 * Normalisasi record sebelum di-upsert.
 *
 * Masalah: server pedami-payment generate satu $unique_id per sesi pembayaran
 * bulk, lalu assign ke SEMUA item (berbeda blth) dalam satu sesi.
 * Akibatnya banyak item PDAM berbagi idempotency_key/item_code yang sama
 * → saat import hanya satu yang survive.
 *
 * Solusi sisi konsumen: untuk provider PDAM, override kunci unik menjadi
 * berbasis customer_id + period_label yang dijamin unik per tagihan.
 */
function normalizeRecord(record: ExportRecord): ExportRecord {
  const { payment, item } = record;

  // Semua provider: set product_code untuk kategorisasi laporan (LIKE 'pln-%')
  const productCode =
    item.service_type === "PLN_POSTPAID" ? "pln-postpaid" :
    item.service_type === "PLN_PREPAID"  ? "pln-prepaid"  : (item.product_code ?? null);

  if (item.provider !== "PDAM") {
    return { payment, item: { ...item, product_code: productCode } };
  }

  const custId  = item.customer_id.replace(/[^a-zA-Z0-9]/g, "");
  const blth    = String(item.period_label ?? "").replace(/[^a-zA-Z0-9]/g, "");
  const newCode = `LEGACY-PDAM-${custId}-${blth}`;
  const newKey  = `legacy-pdam-${custId.toLowerCase()}-${blth.toLowerCase()}`;

  return {
    payment: { ...payment, multi_payment_code: newCode, idempotency_key: newKey },
    item:    { ...item,    item_code: newCode, product_code: productCode },
  };
}

/**
 * MySQL trick: ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id) memastikan
 * LAST_INSERT_ID() selalu berisi ID row yang relevan.
 */
async function upsertPaymentRequest(payment: ExportPayment): Promise<{ id: number; isNew: boolean }> {
  const requestPayload = JSON.stringify({ source: "pedami-payment-import" });

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO multi_payment_requests (
       multi_payment_code, idempotency_key, status,
       loket_code, loket_name, username,
       total_items, total_amount, total_admin, grand_total,
       paid_amount, change_amount,
       request_payload,
       paid_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id           = LAST_INSERT_ID(id),
       status       = VALUES(status),
       loket_name   = VALUES(loket_name),
       username     = VALUES(username),
       total_amount = VALUES(total_amount),
       total_admin  = VALUES(total_admin),
       grand_total  = VALUES(grand_total),
       paid_amount  = VALUES(paid_amount),
       paid_at      = VALUES(paid_at),
       updated_at   = VALUES(updated_at)`,
    [
      payment.multi_payment_code,
      payment.idempotency_key,
      payment.status,
      payment.loket_code,
      payment.loket_name,
      payment.username,
      payment.total_items,
      payment.total_amount,
      payment.total_admin,
      payment.grand_total,
      payment.paid_amount,
      payment.change_amount,
      requestPayload,
      payment.paid_at || null,
      payment.created_at || null,
      payment.updated_at || null,
    ]
  );

  // affectedRows: 1 = inserted, 2 = updated, 0 = no change (duplicate identical)
  const isNew = result.affectedRows === 1;
  return { id: result.insertId, isNew };
}

/**
 * Upsert ke multi_payment_items.
 * Unique key: (multi_payment_id, item_code).
 */
async function upsertPaymentItem(multiPaymentId: number, item: ExportItem): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO multi_payment_items (
       multi_payment_id, item_code, product_code, provider, service_type,
       customer_id, customer_name, period_label,
       amount, admin_fee, total, status,
       transaction_code, provider_error_code, provider_error_message,
       metadata_json, paid_at, failed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       multi_payment_id        = VALUES(multi_payment_id),
       product_code            = VALUES(product_code),
       provider                = VALUES(provider),
       service_type            = VALUES(service_type),
       customer_id             = VALUES(customer_id),
       customer_name           = VALUES(customer_name),
       period_label            = VALUES(period_label),
       amount                  = VALUES(amount),
       admin_fee               = VALUES(admin_fee),
       total                   = VALUES(total),
       status                  = VALUES(status),
       transaction_code        = VALUES(transaction_code),
       provider_error_code     = VALUES(provider_error_code),
       provider_error_message  = VALUES(provider_error_message),
       metadata_json           = VALUES(metadata_json),
       paid_at                 = VALUES(paid_at),
       failed_at               = VALUES(failed_at),
       updated_at              = VALUES(updated_at)`,
    [
      multiPaymentId,
      item.item_code,
      item.product_code ?? null,
      item.provider,
      item.service_type,
      item.customer_id,
      item.customer_name,
      item.period_label || null,
      item.amount,
      item.admin_fee,
      item.total,
      item.status,
      item.transaction_code,
      item.provider_error_code || null,
      item.provider_error_message || null,
      JSON.stringify(item.metadata_json),
      item.paid_at || null,
      item.failed_at || null,
      item.created_at || null,
      item.created_at || null, // updated_at = created_at untuk data legacy
    ]
  );

  return result.affectedRows === 1; // true = inserted, false = updated
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/admin/import-transaksi", "POST");
  if (!check.allowed) {
    return NextResponse.json(check.response, { status: authToken ? 403 : 401 });
  }

  let body: {
    sourceUrl?: string;
    reportToken?: string;
    tglAwal?: string;
    tglAkhir?: string;
    jenis?: string[];
    loketCode?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }

  const { sourceUrl, reportToken, tglAwal, tglAkhir, jenis, loketCode } = body;

  if (!sourceUrl || !reportToken || !tglAwal || !tglAkhir || !jenis?.length) {
    return NextResponse.json(
      { error: "Parameter wajib: sourceUrl, reportToken, tglAwal, tglAkhir, jenis[]" },
      { status: 400 }
    );
  }

  // Validate URL (basic SSRF guard — hanya izinkan http/https)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("invalid protocol");
  } catch {
    return NextResponse.json({ error: "sourceUrl tidak valid" }, { status: 400 });
  }

  const validJenis = ["PDAM", "PLN_POSTPAID", "PLN_PREPAID"];
  const jenisToImport = jenis.filter((j) => validJenis.includes(j));
  if (!jenisToImport.length) {
    return NextResponse.json({ error: "jenis tidak valid" }, { status: 400 });
  }

  const stats: ImportStats = { inserted: 0, updated: 0, errors: 0, errorDetails: [] };
  const startTime = Date.now();

  for (const jenisItem of jenisToImport) {
    let page = 1;
    let lastPage = 1;

    do {
      const params: Record<string, string> = {
        tgl_awal:  tglAwal,
        tgl_akhir: tglAkhir,
        jenis:     jenisItem,
        page:      String(page),
        per_page:  "100",
      };
      if (loketCode) params.loket_code = loketCode;

      let pageData: Awaited<ReturnType<typeof fetchExportPage>>;
      try {
        pageData = await fetchExportPage(parsedUrl.toString(), reportToken, params);
      } catch (e) {
        stats.errors++;
        if (stats.errorDetails.length < 20) {
          stats.errorDetails.push(`[${jenisItem}] page ${page}: ${e instanceof Error ? e.message : String(e)}`);
        }
        break; // Hentikan untuk jenis ini jika fetch gagal
      }

      lastPage = pageData.pagination.last_page;

      for (const rawRecord of pageData.data) {
        const record = normalizeRecord(rawRecord);
        try {
          const { id: mpId, isNew } = await upsertPaymentRequest(record.payment);
          const itemIsNew = await upsertPaymentItem(mpId, record.item);

          if (isNew || itemIsNew) {
            stats.inserted++;
          } else {
            stats.updated++;
          }
        } catch (e) {
          stats.errors++;
          if (stats.errorDetails.length < 20) {
            stats.errorDetails.push(
              `[${jenisItem}] ${record.item.transaction_code}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }

      page++;
    } while (page <= lastPage);
  }

  const actorIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;

  await auditLog({
    actorType: "user",
    actorUsername: authToken!.username,
    actorRole: authToken!.role,
    actorIp,
    action: "IMPORT_TRANSAKSI",
    entityType: "import_transaksi",
    context: {
      sourceUrl: parsedUrl.origin,
      tglAwal,
      tglAkhir,
      jenis: jenisToImport,
      loketCode: loketCode || null,
      durationMs: Date.now() - startTime,
      inserted: stats.inserted,
      updated: stats.updated,
      errors: stats.errors,
      errorDetails: stats.errorDetails,
    },
  });

  return NextResponse.json({
    success: true,
    stats,
    message: `Import selesai. ${stats.inserted} baru, ${stats.updated} diperbarui, ${stats.errors} error.`,
  });
}

// ─── GET handler: preview (hitung total tanpa import) ─────────────────────────

export async function GET(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/admin/import-transaksi", "GET");
  if (!check.allowed) {
    return NextResponse.json(check.response, { status: authToken ? 403 : 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceUrl   = searchParams.get("sourceUrl");
  const reportToken = searchParams.get("reportToken");
  const tglAwal     = searchParams.get("tglAwal");
  const tglAkhir    = searchParams.get("tglAkhir");
  const loketCode   = searchParams.get("loketCode") || undefined;

  if (!sourceUrl || !reportToken || !tglAwal || !tglAkhir) {
    return NextResponse.json({ error: "Parameter tidak lengkap" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("invalid protocol");
  } catch {
    return NextResponse.json({ error: "sourceUrl tidak valid" }, { status: 400 });
  }

  const jenisAll = ["PDAM", "PLN_POSTPAID", "PLN_PREPAID"];
  const counts: Record<string, number> = {};

  for (const jenisItem of jenisAll) {
    const params: Record<string, string> = {
      tgl_awal:  tglAwal,
      tgl_akhir: tglAkhir,
      jenis:     jenisItem,
      page:      "1",
      per_page:  "1",
    };
    if (loketCode) params.loket_code = loketCode;

    try {
      const data = await fetchExportPage(parsedUrl.toString(), reportToken, params);
      counts[jenisItem] = data.pagination.total;
    } catch {
      counts[jenisItem] = -1; // -1 = error
    }
  }

  return NextResponse.json({ counts });
}

// ─── DELETE handler: hapus data legacy PDAM format lama ───────────────────────
// Format lama: idempotency_key = 'legacy-pdam-{transaction_code}' (UUID-like)
// Format baru: idempotency_key = 'legacy-pdam-{cust_id}-{blth}'
// Setelah bug fix di export API, perlu hapus data lama agar import ulang
// menghasilkan data yang benar (tidak ada sisa data format lama).

export async function DELETE(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/admin/import-transaksi", "DELETE");
  if (!check.allowed) {
    return NextResponse.json(check.response, { status: authToken ? 403 : 401 });
  }

  // Hapus semua multi_payment_requests yang idempotency_key-nya adalah format lama:
  // 'legacy-pdam-' + UUID-like (mengandung '-' lebih dari sekali setelah prefix)
  // Format baru: legacy-pdam-{cust_id}-{blth} — cust_id biasanya numerik, blth = YYYYMM
  // Format lama: legacy-pdam-{YYYYMMDDHHiiss}-{uniqid} — minimal 2 segmen UUID setelah prefix
  // Deteksi: format lama memiliki karakter hex/alphanum panjang setelah 'legacy-pdam-',
  // sedangkan format baru terdiri dari digit-digit pendek.
  // Cara paling aman: hapus semua 'legacy-pdam-%' dan biarkan user import ulang.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Hitung dulu berapa yang akan dihapus
    const [countRows] = await conn.query<import("mysql2").RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM multi_payment_requests
       WHERE request_payload = '{"source":"pedami-payment-import"}'
         AND idempotency_key LIKE 'legacy-pdam-%'`
    );
    const totalRequests = (countRows[0]?.total as number) ?? 0;

    // Hapus items dulu (FK constraint), lalu requests
    const [itemDel] = await conn.execute<import("mysql2").ResultSetHeader>(
      `DELETE i FROM multi_payment_items i
       INNER JOIN multi_payment_requests r ON i.multi_payment_id = r.id
       WHERE r.request_payload = '{"source":"pedami-payment-import"}'
         AND r.idempotency_key LIKE 'legacy-pdam-%'`
    );
    const [reqDel] = await conn.execute<import("mysql2").ResultSetHeader>(
      `DELETE FROM multi_payment_requests
       WHERE request_payload = '{"source":"pedami-payment-import"}'
         AND idempotency_key LIKE 'legacy-pdam-%'`
    );

    await conn.commit();

    const actorIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      null;

    await auditLog({
      actorType: "user",
      actorUsername: authToken!.username,
      actorRole: authToken!.role,
      actorIp,
      action: "IMPORT_TRANSAKSI_CLEANUP",
      entityType: "import_transaksi",
      context: {
        deletedRequests: reqDel.affectedRows,
        deletedItems:    itemDel.affectedRows,
        totalRequests,
      },
    });

    return NextResponse.json({
      success: true,
      deletedRequests: reqDel.affectedRows,
      deletedItems:    itemDel.affectedRows,
      message: `Berhasil menghapus ${reqDel.affectedRows} transaksi (${itemDel.affectedRows} item) data legacy PDAM.`,
    });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menghapus data" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

