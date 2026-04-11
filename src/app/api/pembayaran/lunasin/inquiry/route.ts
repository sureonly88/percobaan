import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment } from "@/lib/rbac";
import { LunasinApiError, lunasinInquiry } from "@/lib/lunasin-api";
import pool from "@/lib/db";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  if (!canProcessPayment(token.role)) return forbidden("Anda tidak memiliki akses untuk inquiry");

  const body = await req.json();
  const { idpel, kodeProduk, input2, input3 } = body as {
    idpel: string;
    kodeProduk: string;
    input2?: string;
    input3?: string;
  };

  if (!idpel || typeof idpel !== "string" || idpel.trim().length === 0) {
    return NextResponse.json({ error: "Nomor pelanggan wajib diisi" }, { status: 400 });
  }
  if (!kodeProduk || typeof kodeProduk !== "string") {
    return NextResponse.json({ error: "Kode produk wajib diisi" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9]+$/.test(idpel.trim())) {
    return NextResponse.json({ error: "Nomor pelanggan tidak valid" }, { status: 400 });
  }

  const username = token.username || token.name || "";
  const loketCode = token.loketCode || "";

  // Normalize short product codes from mobile to full Lunasin product codes
  const PRODUCT_CODE_MAP: Record<string, string> = {
    "pdam":   "pdam-kota-banjarmasin",
    "bpjs":   "bpjs-kesehatan",
    "telkom": "telkom-telepon",
  };
  let resolvedKodeProduk = PRODUCT_CODE_MAP[kodeProduk] ?? kodeProduk;

  // PLN products require a tier suffix (e.g. "pln-postpaid-3000").
  // If caller sends only the base code (e.g. from mobile), resolve the tier
  // from the loket's pln_admin_tier setting and append it automatically.
  const PLN_BASE_CODES = ["pln-postpaid", "pln-prepaid", "pln-nonrek"];
  if (PLN_BASE_CODES.includes(resolvedKodeProduk) && loketCode) {
    try {
      const [rows] = await pool.query<import("mysql2").RowDataPacket[]>(
        "SELECT pln_admin_tier FROM lokets WHERE loket_code = ? LIMIT 1",
        [loketCode]
      );
      const tier = rows[0]?.pln_admin_tier ?? 3000;
      resolvedKodeProduk = `${resolvedKodeProduk}-${tier}`;
    } catch {
      resolvedKodeProduk = `${resolvedKodeProduk}-3000`;
    }
  }

  try {
    await logTransactionEventSafe({
      eventType: "INQUIRY_REQUEST",
      severity: "INFO",
      username,
      custId: idpel.trim(),
      provider: "LUNASIN",
      message: `Memulai inquiry Lunasin produk ${resolvedKodeProduk}`,
      payload: { idpel: idpel.trim(), kodeProduk: resolvedKodeProduk, input2, input3 },
    });

    const result = await lunasinInquiry({
      idpel: idpel.trim(),
      kodeProduk: resolvedKodeProduk,
      input2: input2 || "",
      input3: input3 || "",
    });
    const detailItems = Array.isArray(result.data.detail) ? result.data.detail : [];
    const periods = detailItems
      .map((item) => String(item.periode || ""))
      .filter(Boolean);
    const billCount = Number(result.data.jum_bill || periods.length || 1);

    // Log inquiry
    try {
      await pool.execute(
        "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
        [
          `LUNASIN_INQUIRY_${resolvedKodeProduk.toUpperCase()}`,
          JSON.stringify({ idpel: idpel.trim(), kodeProduk: resolvedKodeProduk, response: result.rawResponse }),
          username,
        ]
      );
    } catch {
      // Non-critical
    }

    await logTransactionEventSafe({
      eventType: "INQUIRY_SUCCESS",
      severity: "INFO",
      username,
      custId: idpel.trim(),
      provider: "LUNASIN",
      message: `Inquiry Lunasin berhasil untuk produk ${resolvedKodeProduk}`,
      payload: {
        idpel: idpel.trim(),
        kodeProduk: resolvedKodeProduk,
        idTrx: result.idTrx,
        billCount,
        periods,
        data: result.data,
        rawResponse: result.rawResponse,
      },
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      idTrx: result.idTrx,
      kodeProduk: resolvedKodeProduk,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal melakukan inquiry";
    const errorCode = err instanceof LunasinApiError ? err.code : "UNKNOWN_ERROR";

    await logTransactionEventSafe({
      eventType: "INQUIRY_FAILED",
      severity: "ERROR",
      username,
      custId: idpel.trim(),
      provider: "LUNASIN",
      providerErrorCode: errorCode,
      message,
      payload: {
        idpel: idpel.trim(),
        kodeProduk: resolvedKodeProduk,
        rawResponse: err instanceof LunasinApiError ? err.rawResponse ?? null : null,
      },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
