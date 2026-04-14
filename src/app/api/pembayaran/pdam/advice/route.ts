import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment } from "@/lib/rbac";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { pdamAdvice, parsePdamNumber, PdamApiError } from "@/lib/pdam-api";
import { CircuitOpenError } from "@/lib/circuit-breaker";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { logTransactionEventSafe, logTransactionEventFireAndForget } from "@/lib/transaction-events";

// ── shared types ─────────────────────────────────────────────────────────────
interface ItemRow extends RowDataPacket {
  id: number;
  item_code: string;
  period_label: string | null;
  amount: number;
  admin_fee: number;
  total: number;
  multi_payment_id: number;
  advice_attempts: number;
  metadata_json: unknown;
  customer_name: string | null;
  customer_id: string;
  transaction_code: string;
  loket_code: string;
  loket_name: string;
  idempotency_key: string;
  created_at: string;
}

// ── shared helper: finalize one transaction group ────────────────────────────
async function processAdviceTransaction(
  items: ItemRow[],
  idpel: string,
  tanggal: string,
  username: string,
): Promise<{
  finalizedCount: number;
  totalDeduct: number;
  notFound: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const transactionCode = items[0].transaction_code;
  const loketCode       = items[0].loket_code;
  const loketName       = items[0].loket_name;
  const idempotencyKey  = items[0].idempotency_key;

  // Increment attempt counter before calling
  await pool.execute(
    "UPDATE multi_payment_items SET advice_attempts = advice_attempts + 1 WHERE transaction_code = ? AND status = 'PENDING_ADVICE'",
    [transactionCode]
  );

  logTransactionEventFireAndForget({
    idempotencyKey,
    transactionCode,
    provider: "PDAM",
    eventType: "ADVICE_REQUEST",
    severity: "INFO",
    username,
    loketCode,
    custId: idpel,
    message: `Advice PDAM transaksi ${transactionCode} tanggal ${tanggal}`,
    payload: { idpel, tanggal, itemCount: items.length },
  });

  // Call PDAM advice endpoint
  let adviceResult;
  try {
    adviceResult = await pdamAdvice({ idpel, tanggal });
  } catch (error: unknown) {
    const msg       = error instanceof Error ? error.message : "Advice gagal";
    const errorCode = error instanceof PdamApiError ? error.code : "ADVICE_ERROR";
    await logTransactionEventSafe({
      idempotencyKey, transactionCode, provider: "PDAM",
      eventType: "ADVICE_FAILED", severity: "ERROR",
      username, loketCode, custId: idpel, providerErrorCode: errorCode,
      message: msg,
      payload: { idpel, tanggal },
    });
    throw error; // re-throw so caller can classify circuit-open vs normal error
  }

  if (adviceResult.data.length === 0) {
    await logTransactionEventSafe({
      idempotencyKey, transactionCode, provider: "PDAM",
      eventType: "ADVICE_NOT_FOUND", severity: "WARN",
      username, loketCode, custId: idpel,
      message: "Advice dipanggil namun belum ada data pembayaran di sistem PDAM",
      payload: { idpel, tanggal },
    });
    return { finalizedCount: 0, totalDeduct: 0, notFound: true };
  }

  const adviceData = adviceResult.data;
  const itemByBlth = new Map<string, (typeof adviceData)[0]>();
  for (const d of adviceData) {
    if (d.thbln) itemByBlth.set(d.thbln, d);
  }

  const [balRows] = await pool.query<RowDataPacket[]>(
    "SELECT biaya_admin FROM lokets WHERE loket_code = ? LIMIT 1",
    [loketCode]
  );
  const biayaAdmin = balRows.length > 0 ? Number(balRows[0].biaya_admin || 0) : 0;

  let totalDeduct    = 0;
  let finalizedCount = 0;

  for (const row of items) {
    const blth = String(row.period_label || "");
    const resp = itemByBlth.get(blth) ?? (adviceData.length === 1 ? adviceData[0] : null);
    if (!resp) continue;

    const subTotal  = parsePdamNumber(resp.total);
    const itemTotal = subTotal + biayaAdmin;
    const metaBase  = row.metadata_json
      ? (typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json)
      : {};
    const updatedMeta = {
      ...(metaBase as Record<string, unknown>),
      alamat: resp.alamat || "",
      idgol: resp.gol || "",
      harga_air: parsePdamNumber(resp.harga),
      materai: parsePdamNumber(resp.materai),
      limbah: parsePdamNumber(resp.limbah),
      retribusi: parsePdamNumber(resp.retribusi),
      denda: parsePdamNumber(resp.denda),
      stand_lalu: resp.stand_l || "0",
      stand_kini: resp.stand_i || "0",
      biaya_meter: parsePdamNumber(resp.biaya_meter),
      advice_tanggal: tanggal,
      _advice_source: true,
    };

    await pool.execute(
      `UPDATE multi_payment_items
          SET status = 'SUCCESS', provider_response = ?, metadata_json = ?,
              amount = ?, total = ?,
              provider_error_code = NULL, provider_error_message = NULL,
              paid_at = NOW(), failed_at = NULL
        WHERE id = ?`,
      [JSON.stringify(resp), JSON.stringify(updatedMeta), subTotal, itemTotal, row.id]
    );

    totalDeduct    += itemTotal;
    finalizedCount += 1;
  }

  if (totalDeduct > 0) {
    await pool.execute(
      "UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?",
      [totalDeduct, loketCode]
    );
  }

  // Update parent request if all items done
  const [remaining] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt FROM multi_payment_items WHERE multi_payment_id = ? AND status NOT IN ('SUCCESS')",
    [items[0].multi_payment_id]
  );
  if (Number((remaining as RowDataPacket[])[0]?.cnt ?? 1) === 0) {
    await pool.execute(
      "UPDATE multi_payment_requests SET status = 'SUCCESS', paid_at = NOW() WHERE id = ?",
      [items[0].multi_payment_id]
    );
    await pool.execute(
      "UPDATE payment_requests SET status = 'SUCCESS', updated_at = NOW() WHERE idempotency_key = ?",
      [idempotencyKey]
    );
  }

  logTransactionEventFireAndForget({
    idempotencyKey, transactionCode, provider: "PDAM",
    eventType: "ADVICE_SUCCESS", severity: "INFO",
    username, loketCode: loketCode, custId: idpel,
    message: `Advice berhasil — ${finalizedCount} tagihan diselesaikan (loket: ${loketName})`,
    payload: { idpel, tanggal, finalizedCount, totalDeduct },
  });

  return { finalizedCount, totalDeduct, notFound: false };
}

// ── GET /api/pembayaran/pdam/advice?idpel=... ─────────────────────────────────
// Returns all PENDING_ADVICE PDAM items, optionally filtered by idpel.
export async function GET(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) {
    return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 403 });
  }

  const idpel = req.nextUrl.searchParams.get("idpel")?.trim() || "";

  const whereClauses = ["mpi.status = 'PENDING_ADVICE'", "mpi.provider = 'PDAM'"];
  const params: string[] = [];
  if (idpel) {
    whereClauses.push("mpi.customer_id = ?");
    params.push(idpel);
  }

  const [rows] = await pool.query<ItemRow[]>(
    `SELECT mpi.id, mpi.transaction_code, mpi.item_code, mpi.period_label,
            mpi.amount, mpi.admin_fee, mpi.total,
            mpi.customer_id, mpi.customer_name,
            mpi.advice_attempts, mpi.metadata_json,
            mpi.multi_payment_id, mpi.created_at,
            mpr.loket_code, mpr.loket_name, mpr.username,
            mpr.idempotency_key
       FROM multi_payment_items mpi
       JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY mpi.created_at ASC`,
    params
  );

  // Group by transactionCode
  const byTrx = new Map<string, {
    transactionCode: string;
    idpel: string;
    customerName: string;
    loketCode: string;
    loketName: string;
    createdAt: string;
    adviceTanggal: string;
    adviceAttempts: number;
    grandTotal: number;
    items: { itemCode: string; periodLabel: string; amount: number; adminFee: number; total: number }[];
  }>();

  for (const row of rows) {
    const meta = row.metadata_json
      ? (typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json as string) : row.metadata_json)
      : {};
    const adviceTanggal = (meta as Record<string, unknown>).advice_tanggal as string
      || new Date(row.created_at).toISOString().slice(0, 10);

    if (!byTrx.has(row.transaction_code)) {
      byTrx.set(row.transaction_code, {
        transactionCode: row.transaction_code,
        idpel: row.customer_id,
        customerName: row.customer_name || "",
        loketCode: row.loket_code,
        loketName: row.loket_name,
        createdAt: row.created_at,
        adviceTanggal,
        adviceAttempts: row.advice_attempts,
        grandTotal: 0,
        items: [],
      });
    }
    const trx = byTrx.get(row.transaction_code)!;
    trx.grandTotal    += Number(row.total);
    trx.adviceAttempts = Math.max(trx.adviceAttempts, row.advice_attempts);
    trx.items.push({
      itemCode:    row.item_code,
      periodLabel: row.period_label || "",
      amount:      Number(row.amount),
      adminFee:    Number(row.admin_fee),
      total:       Number(row.total),
    });
  }

  return NextResponse.json({
    transactions: Array.from(byTrx.values()),
    totalItems: rows.length,
    totalTransactions: byTrx.size,
  });
}

// ── POST /api/pembayaran/pdam/advice ──────────────────────────────────────────
// Body: { idpel: string; transactionCode?: string }
//   - With transactionCode: process that single transaction only
//   - Without transactionCode: process ALL pending transactions for this idpel
export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) {
    return NextResponse.json({ error: "Tidak memiliki akses untuk proses pembayaran" }, { status: 403 });
  }

  const body = await req.json() as { idpel?: unknown; transactionCode?: unknown };
  const idpel           = typeof body.idpel === "string" ? body.idpel.trim() : "";
  const transactionCode = typeof body.transactionCode === "string" ? body.transactionCode.trim() : "";
  const username        = String(token.username || token.name || "");

  if (!idpel) {
    return NextResponse.json({ error: "idpel wajib diisi" }, { status: 400 });
  }

  // Build query to find pending items
  const whereClauses = [
    "mpi.status = 'PENDING_ADVICE'",
    "mpi.provider = 'PDAM'",
    "mpi.customer_id = ?",
  ];
  const params: (string | number)[] = [idpel];

  if (transactionCode) {
    whereClauses.push("mpi.transaction_code = ?");
    params.push(transactionCode);
  }

  const [allItems] = await pool.query<ItemRow[]>(
    `SELECT mpi.id, mpi.transaction_code, mpi.item_code, mpi.period_label,
            mpi.amount, mpi.admin_fee, mpi.total,
            mpi.customer_id, mpi.customer_name,
            mpi.advice_attempts, mpi.metadata_json,
            mpi.multi_payment_id, mpi.created_at,
            mpr.loket_code, mpr.loket_name, mpr.idempotency_key
       FROM multi_payment_items mpi
       JOIN multi_payment_requests mpr ON mpr.id = mpi.multi_payment_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY mpi.created_at ASC`,
    params
  );

  if (allItems.length === 0) {
    // Check if already resolved
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM multi_payment_items
        WHERE customer_id = ? AND provider = 'PDAM' AND status = 'SUCCESS' LIMIT 1`,
      [idpel]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Semua transaksi untuk pelanggan ini sudah berhasil" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Tidak ada transaksi PENDING ADVICE untuk pelanggan ini" },
      { status: 404 }
    );
  }

  // Group by (transactionCode, advice_tanggal)
  const groups = new Map<string, { tanggal: string; items: ItemRow[] }>();
  for (const row of allItems) {
    const meta = row.metadata_json
      ? (typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json as string) : row.metadata_json)
      : {};
    const tanggal = (meta as Record<string, unknown>).advice_tanggal as string
      || new Date(row.created_at).toISOString().slice(0, 10);
    const key = `${row.transaction_code}::${tanggal}`;
    if (!groups.has(key)) {
      groups.set(key, { tanggal, items: [] });
    }
    groups.get(key)!.items.push(row);
  }

  // Process each group
  let totalFinalized = 0;
  let totalDeducted  = 0;
  let notFoundCount  = 0;
  const groupResults: { transactionCode: string; tanggal: string; finalizedCount: number; notFound: boolean; error?: string }[] = [];

  for (const [, group] of groups) {
    const trxCode = group.items[0].transaction_code;
    try {
      const res = await processAdviceTransaction(group.items, idpel, group.tanggal, username);
      totalFinalized += res.finalizedCount;
      totalDeducted  += res.totalDeduct;
      if (res.notFound) notFoundCount += 1;
      groupResults.push({ transactionCode: trxCode, tanggal: group.tanggal, finalizedCount: res.finalizedCount, notFound: res.notFound });
    } catch (error: unknown) {
      if (error instanceof CircuitOpenError) {
        return NextResponse.json({ error: error.message, errorCode: "CIRCUIT_OPEN" }, { status: 503 });
      }
      const msg       = error instanceof Error ? error.message : "Advice gagal";
      const errorCode = error instanceof PdamApiError ? error.code : "ADVICE_ERROR";
      groupResults.push({ transactionCode: trxCode, tanggal: group.tanggal, finalizedCount: 0, notFound: false, error: msg });
      // Continue processing other groups even if one fails
      if (groups.size === 1) {
        return NextResponse.json({ error: `Advice PDAM gagal: ${msg}`, errorCode }, { status: 502 });
      }
    }
  }

  if (totalFinalized === 0 && notFoundCount === groups.size) {
    return NextResponse.json(
      { error: "Data pembayaran belum tersedia di sistem PDAM. Coba lagi beberapa saat." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `${totalFinalized} tagihan berhasil diselesaikan via advice PDAM`,
    totalFinalized,
    totalDeducted,
    groupResults,
    idpel,
    customerName: allItems[0].customer_name || "",
    processedGroups: groups.size,
  });
}
