import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { auditLog } from "@/lib/audit-log";
import { buildReceiptBills } from "@/lib/receipt-bills";

// GET /api/pembayaran/reprint
//
// Mode:
//   ?idPelanggan=X&list=1     → daftar pembayaran sukses yang memuat pelanggan X (untuk dipilih)
//   ?multiPaymentCode=Y       → data struk satu pembayaran utuh (= struk asli setelah lunas)
//   ?transactionCode=Z        → data struk item dengan kode transaksi Z (Laporan, Riwayat, Cetak Ulang, dll)
//   ?idPelanggan=X            → data struk pembayaran TERAKHIR yang memuat pelanggan X
//
// Isi struk disusun oleh buildReceiptBills (lib/receipt-bills) — sama persis dengan
// cetak otomatis setelah pembayaran lunas. Setiap cetak ulang ditandai COPY dan
// dicatat di audit log (REPRINT_RECEIPT).
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const transactionCode = searchParams.get("transactionCode")?.trim() || "";
  const multiPaymentCodeParam = searchParams.get("multiPaymentCode")?.trim() || "";
  const idPelanggan = searchParams.get("idPelanggan")?.trim() || "";
  const listMode = searchParams.get("list") === "1";

  // Sama dengan /api/cetak-ulang/list: selain admin/supervisor hanya boleh loketnya sendiri
  const sessionRole = (session.user as { role?: string })?.role || "";
  const sessionLoketCode = (session.user as { loketCode?: string })?.loketCode || "";
  const canSeeAll = sessionRole === "admin" || sessionRole === "supervisor";
  const loketScope: LoketScope = canSeeAll ? null : sessionLoketCode || "__NO_LOKET__";
  const loketSql = loketScope ? " AND r.loket_code = ?" : "";
  const loketParams = loketScope ? [loketScope] : [];

  if (!transactionCode && !multiPaymentCodeParam && !idPelanggan) {
    return NextResponse.json(
      { error: "transactionCode, multiPaymentCode, atau idPelanggan wajib diisi" },
      { status: 400 }
    );
  }

  try {
    if (listMode && idPelanggan) {
      return listTransactions(idPelanggan, loketScope);
    }

    let multiPaymentCode = multiPaymentCodeParam;
    if (!transactionCode && !multiPaymentCode && idPelanggan) {
      // Tanpa pilihan: pakai pembayaran terakhir pelanggan ini
      const [latest] = await pool.query<RowDataPacket[]>(
        `SELECT r.multi_payment_code
           FROM multi_payment_items i
           JOIN multi_payment_requests r ON r.id = i.multi_payment_id
          WHERE i.status = 'SUCCESS' AND i.customer_id = ?${loketSql}
          ORDER BY COALESCE(i.paid_at, i.created_at) DESC, i.id DESC
          LIMIT 1`,
        [idPelanggan, ...loketParams]
      );
      if (latest.length === 0) {
        return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
      }
      multiPaymentCode = String(latest[0].multi_payment_code);
    }

    const where = transactionCode ? "i.transaction_code = ?" : "r.multi_payment_code = ?";
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        i.id, i.transaction_code AS transactionCode,
        i.customer_id AS idPelanggan,
        i.customer_name AS nama,
        i.provider, i.product_code AS productCode,
        i.period_label AS periode,
        i.admin_fee AS adminFee, i.total,
        CAST(i.metadata_json AS CHAR) AS metadataJson,
        CAST(i.provider_response AS CHAR) AS providerResponse,
        r.multi_payment_code AS multiPaymentCode,
        COALESCE(NULLIF(r.loket_name, ''), l.nama, '-')       AS loketName,
        COALESCE(NULLIF(r.loket_code, ''), l.loket_code, '-') AS loketCode,
        r.username,
        COALESCE(NULLIF(u.name, ''), r.username, '-') AS kasir,
        COALESCE(r.paid_at, i.paid_at, i.created_at) AS tanggal
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      LEFT JOIN lokets l ON l.loket_code = r.loket_code
      LEFT JOIN users u ON u.username = r.username
      WHERE i.status = 'SUCCESS' AND ${where}${loketSql}
      ORDER BY i.id ASC
      LIMIT 100`,
      [transactionCode || multiPaymentCode, ...loketParams]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const first = rows[0];

    // ── Audit & nomor copy ──
    const entityIdForAudit = transactionCode || multiPaymentCode;
    const sessionUser = session.user as { name?: string; username?: string; role?: string } | undefined;
    const actorUsername = sessionUser?.username || sessionUser?.name || "unknown";
    const actorRole = sessionUser?.role || null;
    const actorIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const reason = searchParams.get("reason") || null;

    // copyNumber = jumlah reprint sebelumnya + 2 (cetakan pertama = 1)
    let previousReprintCount = 0;
    try {
      const [auditRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM audit_logs
         WHERE action = 'REPRINT_RECEIPT' AND entity_id = ?`,
        [entityIdForAudit]
      );
      previousReprintCount = Number(auditRows[0]?.n ?? 0);
    } catch {
      previousReprintCount = 0;
    }
    const copyNumber = previousReprintCount + 2;
    const copyAt = new Date().toISOString();
    const providers = Array.from(new Set(rows.map((r) => String(r.provider))));

    void auditLog({
      action: "REPRINT_RECEIPT",
      entityType: transactionCode
        ? providers.length === 1 && providers[0] === "PDAM"
          ? "multi_payment_item_pdam"
          : "multi_payment_item_lunasin"
        : "multi_payment_request",
      entityId: entityIdForAudit,
      actorUsername,
      actorRole,
      actorIp,
      context: {
        transactionCode: transactionCode || null,
        multiPaymentCode: first.multiPaymentCode || null,
        idPelanggan: idPelanggan || null,
        loketCode: first.loketCode || null,
        provider: providers.join(",") || null,
        itemCount: rows.length,
        copyNumber,
        reason,
      },
      after: { copyNumber, copyAt },
    });

    const bills = buildReceiptBills(
      rows.map((r) => {
        const meta = parseJson(r.metadataJson);
        const prov = parseJson(r.providerResponse);
        const isLunasin = r.provider === "LUNASIN";
        return {
          provider: String(r.provider),
          idpel: String(r.idPelanggan || ""),
          nama: String(r.nama || ""),
          blth: String(r.periode || ""),
          kodeProduk: r.productCode ? String(r.productCode) : undefined,
          transactionCode: r.transactionCode ? String(r.transactionCode) : undefined,
          adminFee: Number(r.adminFee || 0),
          total: Number(r.total || 0),
          providerData: isLunasin ? prov : undefined,
          pdamSources: isLunasin ? undefined : [meta, prov],
        };
      })
    );

    const totalTagihan = bills.reduce((s, b) => s + b.tagihan, 0);
    const totalAdmin = bills.reduce((s, b) => s + b.admin, 0);
    const totalBayar = bills.reduce((s, b) => s + b.total, 0);

    return NextResponse.json({
      loketName: first.loketName || "-",
      loketCode: first.loketCode || "-",
      kasir: first.kasir || "-",
      tanggal: first.tanggal || "-",
      bills,
      totalTagihan,
      totalAdmin,
      totalBayar,
      tunai: totalBayar,
      kembalian: 0,
      multiPaymentCode: first.multiPaymentCode || null,
      isCopy: true,
      copyNumber,
      copyBy: actorUsername,
      copyAt,
    });
  } catch (error) {
    console.error("Reprint Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data struk" }, { status: 500 });
  }
}

/** Daftar pembayaran sukses (terbaru dulu) yang memuat pelanggan tertentu. */
type LoketScope = string | null;

async function listTransactions(idPelanggan: string, loketScope: LoketScope): Promise<NextResponse> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.id AS multiPaymentId, r.multi_payment_code AS multiPaymentCode,
            COALESCE(NULLIF(r.loket_name, ''), r.loket_code, '-') AS loketName,
            COALESCE(NULLIF(u.name, ''), r.username, '-') AS kasir,
            COALESCE(r.paid_at, MAX(i.paid_at), MAX(i.created_at)) AS tanggal
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       LEFT JOIN users u ON u.username = r.username
      WHERE i.status = 'SUCCESS' AND i.customer_id = ?${loketScope ? " AND r.loket_code = ?" : ""}
      GROUP BY r.id
      ORDER BY tanggal DESC, r.id DESC
      LIMIT 20`,
    loketScope ? [idPelanggan, loketScope] : [idPelanggan]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }

  // Rincian item sukses tiap pembayaran (semua pelanggan dalam pembayaran itu = isi struk)
  const ids = rows.map((r) => r.multiPaymentId);
  const [items] = await pool.query<RowDataPacket[]>(
    `SELECT multi_payment_id AS multiPaymentId, customer_id AS idpel, customer_name AS nama,
            provider, product_code AS productCode, period_label AS periode, total
       FROM multi_payment_items
      WHERE status = 'SUCCESS' AND multi_payment_id IN (?)
      ORDER BY id ASC`,
    [ids]
  );

  const transactions = rows.map((r) => {
    const own = items.filter((it) => it.multiPaymentId === r.multiPaymentId);
    return {
      multiPaymentCode: String(r.multiPaymentCode),
      tanggal: r.tanggal,
      loketName: r.loketName,
      kasir: r.kasir,
      itemCount: own.length,
      totalBayar: own.reduce((s, it) => s + Number(it.total || 0), 0),
      items: own.map((it) => ({
        idpel: String(it.idpel || ""),
        nama: String(it.nama || ""),
        provider: String(it.provider || ""),
        kodeProduk: it.productCode ? String(it.productCode) : null,
        periode: String(it.periode || ""),
        total: Number(it.total || 0),
      })),
    };
  });

  return NextResponse.json({ transactions });
}

function parseJson(val: unknown): Record<string, unknown> {
  if (!val) return {};
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
