import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

// GET: List transaksi from multi_payment_items with search, filter, pagination
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/pelanggan", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "pdam"; // "pdam" | "pln"
  const kategori = searchParams.get("kategori") || ""; // sub-category filter for Lunasin
  const search = searchParams.get("search") || "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const golongan = searchParams.get("golongan") || "";
  const loketCode = searchParams.get("loketCode") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const userLoketCode = (session?.user as { loketCode?: string })?.loketCode || "";
  const canSeeAll = role === "admin" || role === "supervisor";
  const effectiveLoketCode = canSeeAll ? loketCode : (userLoketCode || "__NO_LOKET__");

  try {
    if (type === "pln") {
      return await getPlnTransaksi({
        search, page, limit,
        loketCode: effectiveLoketCode,
        startDate, endDate, canSeeAll,
        userLoketCode, kategori,
      });
    }

    // === PDAM ===
    let where = "WHERE i.status = 'SUCCESS' AND i.provider = 'PDAM'";
    const params: (string | number)[] = [];

    if (search) {
      where += " AND (i.customer_id LIKE ? OR i.customer_name LIKE ? OR i.transaction_code LIKE ?)";
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (golongan && golongan !== "semua") {
      where += " AND i.meta_idgol = ?";
      params.push(golongan);
    }
    if (effectiveLoketCode && effectiveLoketCode !== "semua") {
      where += " AND r.loket_code = ?";
      params.push(effectiveLoketCode);
    }
    if (startDate) {
      where += " AND COALESCE(i.paid_at, i.created_at) >= ?";
      params.push(startDate + " 00:00:00");
    }
    if (endDate) {
      where += " AND COALESCE(i.paid_at, i.created_at) <= ?";
      params.push(endDate + " 23:59:59");
    }

    const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;

    const [countResult] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total ${baseFrom} ${where}`, params
    );
    const total = Number(countResult[0]?.total ?? 0);

    const [summaryResult] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(i.total), 0) as totalNominal,
        COALESCE(SUM(i.amount), 0) as totalSubtotal,
        COALESCE(SUM(i.admin_fee), 0) as totalAdmin,
        COUNT(DISTINCT i.customer_id) as uniqueCustomers
       ${baseFrom} ${where}`, params
    );
    const summary = {
      totalTransaksi: total,
      totalNominal: Number(summaryResult[0]?.totalNominal ?? 0),
      totalSubtotal: Number(summaryResult[0]?.totalSubtotal ?? 0),
      totalAdmin: Number(summaryResult[0]?.totalAdmin ?? 0),
      uniqueCustomers: Number(summaryResult[0]?.uniqueCustomers ?? 0),
    };

    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT i.*, r.loket_name, r.loket_code, r.username,
              COALESCE(i.paid_at, i.created_at) as transaction_date
       ${baseFrom} ${where}
       ORDER BY COALESCE(i.paid_at, i.created_at) DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Get distinct golongan & loket for filters
    const [golList] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT i.meta_idgol as idgol
       ${baseFrom}
       WHERE i.provider = 'PDAM' AND i.status = 'SUCCESS'
         AND i.meta_idgol IS NOT NULL
       ${!canSeeAll && userLoketCode ? " AND r.loket_code = ?" : ""}
       ORDER BY idgol`,
      !canSeeAll && userLoketCode ? [userLoketCode] : []
    );
    const [loketListRows] = await pool.query<RowDataPacket[]>(
      canSeeAll
        ? "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' ORDER BY nama"
        : "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' AND loket_code = ? ORDER BY nama",
      canSeeAll ? [] : [userLoketCode || "__NO_LOKET__"]
    );

    return NextResponse.json({
      transaksi: rows.map((r) => {
        const prov = parseJson(r.provider_response);
        const meta = parseJson(r.metadata_json);
        return {
          id: r.id,
          transactionCode: r.transaction_code,
          transactionDate: r.transaction_date,
          custId: r.customer_id,
          nama: r.customer_name,
          alamat: String(prov.alamat ?? ""),
          blth: r.period_label,
          hargaAir: parseMetaNum(prov.harga),
          abodemen: parseMetaNum(prov.byadmin),
          materai: parseMetaNum(prov.materai),
          limbah: parseMetaNum(prov.limbah),
          retribusi: parseMetaNum(prov.retribusi),
          denda: parseMetaNum(prov.denda),
          standLalu: parseMetaNum(prov.stand_l),
          standKini: parseMetaNum(prov.stand_i),
          subTotal: Number(r.amount),
          admin: Number(r.admin_fee),
          total: Number(r.total),
          username: r.username,
          loketName: r.loket_name,
          loketCode: r.loket_code,
          idgol: String(prov.gol ?? meta.idgol ?? ""),
          jenisLoket: meta.jenis_loket ?? meta.jenisLoket ?? "",
          bebanTetap: parseMetaNum(prov.biaya_tetap),
          biayaMeter: parseMetaNum(prov.biaya_meter),
          flagTransaksi: r.status,
          diskon: parseMetaNum(prov.diskon),
        };
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary,
      golonganList: golList.map((r) => r.idgol).filter(Boolean),
      loketList: loketListRows.map((r) => ({ nama: r.nama, loketCode: r.loket_code })),
    });
  } catch (error) {
    console.error("Pelanggan GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data transaksi" }, { status: 500 });
  }
}

function parseJson(val: unknown): Record<string, unknown> {
  if (!val) return {};
  try {
    return typeof val === "string" ? JSON.parse(val) : (val as Record<string, unknown>);
  } catch {
    return {};
  }
}

/** Parse a numeric value that may use Indonesian comma notation (e.g. "1600,79") */
function parseMetaNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const n = parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// Category prefix map for Lunasin products
const KATEGORI_PREFIX: Record<string, string> = {
  pln: "pln-%",
  bpjs: "bpjs-%",
  telkom: "telkom-%",
  pulsa: "pulsa-%",
  paketdata: "paketdata-%",
  "pdam-lunasin": "pdam-%",
};

// --- PLN/Lunasin GET handler ---
async function getPlnTransaksi(opts: {
  search: string; page: number; limit: number;
  loketCode: string; startDate: string; endDate: string;
  canSeeAll: boolean; userLoketCode: string; kategori: string;
}) {
  const { search, page, limit, loketCode, startDate, endDate, canSeeAll, userLoketCode, kategori } = opts;

  let where = "WHERE i.status = 'SUCCESS' AND i.provider = 'LUNASIN'";
  const params: (string | number)[] = [];

  // Filter by product category
  if (kategori && KATEGORI_PREFIX[kategori]) {
    where += " AND i.product_code LIKE ?";
    params.push(KATEGORI_PREFIX[kategori]);
  }

  if (search) {
    where += " AND (i.customer_id LIKE ? OR i.customer_name LIKE ? OR i.product_code LIKE ? OR r.loket_name LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (loketCode && loketCode !== "semua") {
    where += " AND r.loket_code = ?";
    params.push(loketCode);
  }
  if (startDate) {
    where += " AND COALESCE(i.paid_at, i.created_at) >= ?";
    params.push(startDate + " 00:00:00");
  }
  if (endDate) {
    where += " AND COALESCE(i.paid_at, i.created_at) <= ?";
    params.push(endDate + " 23:59:59");
  }

  const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;

  const [countResult] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total ${baseFrom} ${where}`, params
  );
  const total = Number(countResult[0]?.total ?? 0);

  const [summaryResult] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(i.total), 0) as totalNominal,
       COALESCE(SUM(i.amount), 0) as totalTagihan,
       COALESCE(SUM(i.admin_fee), 0) as totalAdmin,
       COUNT(DISTINCT i.customer_id) as uniqueCustomers
     ${baseFrom} ${where}`, params
  );
  const summary = {
    totalTransaksi: total,
    totalNominal: Number(summaryResult[0]?.totalNominal ?? 0),
    totalTagihan: Number(summaryResult[0]?.totalTagihan ?? 0),
    totalAdmin: Number(summaryResult[0]?.totalAdmin ?? 0),
    uniqueCustomers: Number(summaryResult[0]?.uniqueCustomers ?? 0),
  };

  const offset = (page - 1) * limit;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.*, r.loket_name, r.loket_code, r.username,
            COALESCE(i.paid_at, i.created_at) as transaction_date
     ${baseFrom} ${where}
     ORDER BY COALESCE(i.paid_at, i.created_at) DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [loketListRows] = await pool.query<RowDataPacket[]>(
    canSeeAll
      ? "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' ORDER BY nama"
      : "SELECT nama, loket_code FROM lokets WHERE status = 'aktif' AND loket_code = ? ORDER BY nama",
    canSeeAll ? [] : [userLoketCode || "__NO_LOKET__"]
  );

  return NextResponse.json({
    transaksi: rows.map((r) => {
      const meta = parseJson(r.metadata_json);
      const prov = parseJson(r.provider_response);
      const provData = (prov.data && typeof prov.data === "object" && !Array.isArray(prov.data))
        ? (prov.data as Record<string, unknown>)
        : prov;
      return {
        id: r.id,
        transactionCode: r.transaction_code,
        transactionDate: r.transaction_date,
        custId: r.customer_id,
        nama: r.customer_name,
        kodeProduk: r.product_code,
        idTrx: String(provData.id_trx ?? provData.idTrx ?? meta.id_trx ?? meta.idTrx ?? ""),
        periode: r.period_label ?? "",
        jumBill: Number(provData.jum_bill ?? provData.jumBill ?? 0),
        tarif: String(provData.tarif ?? ""),
        daya: String(provData.daya ?? ""),
        standMeter: String(provData.stand_meter ?? provData.nometer ?? ""),
        rpAmount: Number(r.amount ?? 0),
        rpAdmin: Number(r.admin_fee ?? 0),
        rpTotal: Number(r.total ?? 0),
        refnumLunasin: String(provData.refnum_lunasin ?? provData.refnumLunasin ?? ""),
        tokenPln: String(provData.token ?? ""),
        username: r.username,
        loketName: r.loket_name,
        loketCode: r.loket_code,
        jenisLoket: meta.jenis_loket ?? "",
        flagTransaksi: r.status,
        processingStatus: r.status ?? "",
        paidAt: r.paid_at,
        failedAt: r.failed_at,
        providerDetail: Object.keys(prov).length > 0 ? prov : null,
        metadata: Object.keys(meta).length > 0 ? meta : null,
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    summary,
    loketList: loketListRows.map((r) => ({ nama: r.nama, loketCode: r.loket_code })),
  });
}

// POST: Tambah transaksi baru
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/pelanggan", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { type } = body;

    const now = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const dateStr =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const hex = Math.random().toString(16).substring(2, 15).toUpperCase();
    const transactionCode = `${dateStr}-${hex}`;
    const multiPaymentCode = `MANUAL-${transactionCode}`;
    const idempotencyKey = `manual-${transactionCode}`;

    if (type === "pln") {
      const { custId, nama, kodeProduk, periode, rpAmount, rpAdmin, rpTotal, username, loketName, loketCode } = body;
      if (!custId || !nama) {
        return NextResponse.json({ error: "ID Pelanggan dan Nama wajib diisi" }, { status: 400 });
      }

      const totalAmount = Number(rpAmount || 0);
      const totalAdmin = Number(rpAdmin || 0);
      const grandTotal = Number(rpTotal || (totalAmount + totalAdmin));

      const [parentResult] = await pool.query<ResultSetHeader>(
        `INSERT INTO multi_payment_requests
          (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
           total_items, total_amount, total_admin, grand_total, paid_amount, change_amount, paid_at)
         VALUES (?, ?, 'SUCCESS', ?, ?, ?, 1, ?, ?, ?, ?, 0, NOW())`,
        [multiPaymentCode, idempotencyKey, loketCode || "", loketName || "", username || "",
         totalAmount, totalAdmin, grandTotal, grandTotal]
      );

      await pool.query<ResultSetHeader>(
        `INSERT INTO multi_payment_items
          (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
           product_code, period_label, amount, admin_fee, total, status, transaction_code,
           metadata_json, paid_at)
         VALUES (?, ?, 'LUNASIN', 'PLN', ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
        [parentResult.insertId, `MANUAL-${custId}-${Date.now()}`,
         custId, nama, kodeProduk || "", periode || "",
         totalAmount, totalAdmin, grandTotal, transactionCode,
         JSON.stringify({ flag: "MANUAL" })]
      );

      return NextResponse.json({ message: "Transaksi Lunasin berhasil ditambahkan" });
    }

    // === PDAM ===
    const {
      custId, nama, alamat, blth, hargaAir, abodemen, materai,
      limbah, retribusi, denda, standLalu, standKini, subTotal,
      admin, total, username, loketName, loketCode, idgol,
      jenisLoket, bebanTetap, biayaMeter,
    } = body;

    if (!custId || !nama) {
      return NextResponse.json({ error: "ID Pelanggan dan Nama wajib diisi" }, { status: 400 });
    }

    const totalAmount = Number(subTotal || 0);
    const totalAdmin = Number(admin || 0);
    const grandTotal = Number(total || 0);

    const [parentResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO multi_payment_requests
        (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
         total_items, total_amount, total_admin, grand_total, paid_amount, change_amount, paid_at)
       VALUES (?, ?, 'SUCCESS', ?, ?, ?, 1, ?, ?, ?, ?, 0, NOW())`,
      [multiPaymentCode, idempotencyKey, loketCode || "", loketName || "", username || "",
       totalAmount, totalAdmin, grandTotal, grandTotal]
    );

    const metadata = {
      alamat: alamat || "", idgol: idgol || "", blth: blth || "",
      hargaAir: hargaAir || 0, abodemen: abodemen || 0, materai: materai || 0,
      limbah: limbah || 0, retribusi: retribusi || 0, denda: denda || 0,
      standLalu: standLalu || 0, standKini: standKini || 0,
      bebanTetap: bebanTetap || 0, biayaMeter: biayaMeter || 0,
      jenisLoket: jenisLoket || "SWITCHING", diskon: 0,
      flag: "MANUAL",
    };

    await pool.query<ResultSetHeader>(
      `INSERT INTO multi_payment_items
        (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
         period_label, amount, admin_fee, total, status, transaction_code,
         metadata_json, paid_at)
       VALUES (?, ?, 'PDAM', 'PDAM', ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, NOW())`,
      [parentResult.insertId, `MANUAL-${custId}-${Date.now()}`,
       custId, nama, blth || "",
       totalAmount, totalAdmin, grandTotal, transactionCode,
       JSON.stringify(metadata)]
    );

    return NextResponse.json({ message: "Transaksi berhasil ditambahkan" });
  } catch (error) {
    console.error("Pelanggan POST Error:", error);
    return NextResponse.json({ error: "Gagal menambah transaksi" }, { status: 500 });
  }
}

// PUT: Edit transaksi
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/pelanggan", "PUT");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { id, type } = body;

    if (!id) {
      return NextResponse.json({ error: "ID wajib diisi" }, { status: 400 });
    }

    // Read current item
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM multi_payment_items WHERE id = ?", [id]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const item = existing[0];
    const currentMeta = parseJson(item.metadata_json);

    if (type === "pln") {
      const directFields: string[] = [];
      const directValues: (string | number)[] = [];

      const plnMap: Record<string, string> = {
        custId: "customer_id", nama: "customer_name",
        kodeProduk: "product_code", periode: "period_label",
        rpAmount: "amount", rpAdmin: "admin_fee", rpTotal: "total",
      };

      for (const [key, col] of Object.entries(plnMap)) {
        if (body[key] !== undefined) {
          directFields.push(`${col} = ?`);
          directValues.push(body[key]);
        }
      }

      if (directFields.length === 0) {
        return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
      }

      directValues.push(id);
      await pool.query<ResultSetHeader>(
        `UPDATE multi_payment_items SET ${directFields.join(", ")}, updated_at = NOW() WHERE id = ?`,
        directValues
      );

      // Also update parent totals
      await updateParentTotals(item.multi_payment_id);

      return NextResponse.json({ message: "Transaksi Lunasin berhasil diperbarui" });
    }

    // === PDAM ===
    const directFields: string[] = [];
    const directValues: (string | number)[] = [];
    const metaUpdates: Record<string, unknown> = {};

    const directMap: Record<string, string> = {
      custId: "customer_id", nama: "customer_name",
      blth: "period_label", subTotal: "amount", admin: "admin_fee", total: "total",
    };

    const metaMap = [
      "alamat", "idgol", "hargaAir", "abodemen", "materai", "limbah",
      "retribusi", "denda", "standLalu", "standKini", "bebanTetap", "biayaMeter",
      "jenisLoket", "diskon",
    ];

    for (const [key, col] of Object.entries(directMap)) {
      if (body[key] !== undefined) {
        directFields.push(`${col} = ?`);
        directValues.push(body[key]);
      }
    }

    for (const key of metaMap) {
      if (body[key] !== undefined) {
        metaUpdates[key] = body[key];
      }
    }

    if (directFields.length === 0 && Object.keys(metaUpdates).length === 0) {
      return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    // Merge metadata
    if (Object.keys(metaUpdates).length > 0) {
      const newMeta = { ...currentMeta, ...metaUpdates };
      directFields.push("metadata_json = ?");
      directValues.push(JSON.stringify(newMeta));
    }

    directValues.push(id);
    await pool.query<ResultSetHeader>(
      `UPDATE multi_payment_items SET ${directFields.join(", ")}, updated_at = NOW() WHERE id = ?`,
      directValues
    );

    // Also update parent totals
    await updateParentTotals(item.multi_payment_id);

    return NextResponse.json({ message: "Transaksi berhasil diperbarui" });
  } catch (error) {
    console.error("Pelanggan PUT Error:", error);
    return NextResponse.json({ error: "Gagal memperbarui transaksi" }, { status: 500 });
  }
}

async function updateParentTotals(multiPaymentId: number) {
  await pool.query<ResultSetHeader>(
    `UPDATE multi_payment_requests SET
       total_amount = (SELECT COALESCE(SUM(amount), 0) FROM multi_payment_items WHERE multi_payment_id = ?),
       total_admin = (SELECT COALESCE(SUM(admin_fee), 0) FROM multi_payment_items WHERE multi_payment_id = ?),
       grand_total = (SELECT COALESCE(SUM(total), 0) FROM multi_payment_items WHERE multi_payment_id = ?),
       paid_amount = (SELECT COALESCE(SUM(total), 0) FROM multi_payment_items WHERE multi_payment_id = ?),
       updated_at = NOW()
     WHERE id = ?`,
    [multiPaymentId, multiPaymentId, multiPaymentId, multiPaymentId, multiPaymentId]
  );
}

// DELETE: Hapus transaksi
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/pelanggan", "DELETE");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID wajib diisi" }, { status: 400 });
    }

    // Get parent ID before deleting
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT multi_payment_id FROM multi_payment_items WHERE id = ?", [id]
    );

    await pool.query<ResultSetHeader>("DELETE FROM multi_payment_items WHERE id = ?", [id]);

    // Clean up parent if no more items
    if (existing.length > 0) {
      const parentId = existing[0].multi_payment_id;
      const [remaining] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as cnt FROM multi_payment_items WHERE multi_payment_id = ?", [parentId]
      );
      if (Number(remaining[0]?.cnt ?? 0) === 0) {
        await pool.query<ResultSetHeader>("DELETE FROM multi_payment_requests WHERE id = ?", [parentId]);
      } else {
        await updateParentTotals(parentId);
      }
    }

    return NextResponse.json({ message: "Transaksi berhasil dihapus" });
  } catch (error) {
    console.error("Pelanggan DELETE Error:", error);
    return NextResponse.json({ error: "Gagal menghapus transaksi" }, { status: 500 });
  }
}
