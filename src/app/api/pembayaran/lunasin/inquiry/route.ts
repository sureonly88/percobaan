import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canProcessPayment } from "@/lib/rbac";
import { LunasinApiError, lunasinInquiry } from "@/lib/lunasin-api";
import pool from "@/lib/db";
import { logTransactionEventSafe } from "@/lib/transaction-events";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canProcessPayment(token.role as string)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk inquiry" }, { status: 403 });
  }

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

  const username = String(token.username || token.name || "");

  try {
    await logTransactionEventSafe({
      eventType: "INQUIRY_REQUEST",
      severity: "INFO",
      username,
      custId: idpel.trim(),
      provider: "LUNASIN",
      message: `Memulai inquiry Lunasin produk ${kodeProduk}`,
      payload: { idpel: idpel.trim(), kodeProduk, input2, input3 },
    });

    const result = await lunasinInquiry({
      idpel: idpel.trim(),
      kodeProduk,
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
          `LUNASIN_INQUIRY_${kodeProduk.toUpperCase()}`,
          JSON.stringify({ idpel: idpel.trim(), kodeProduk, response: result.rawResponse }),
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
      message: `Inquiry Lunasin berhasil untuk produk ${kodeProduk}`,
      payload: {
        idpel: idpel.trim(),
        kodeProduk,
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
        kodeProduk,
        rawResponse: err instanceof LunasinApiError ? err.rawResponse ?? null : null,
      },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
