import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getTrustedClientIp } from "@/lib/request-client";
import {
  TransactionVoidError,
  listTransactionVoids,
  requestTransactionVoid,
  reviewTransactionVoid,
} from "@/lib/transaction-void";

const API_PATH = "/api/transaksi/pembatalan";

async function authorize(req: NextRequest, method: string) {
  const token = await getAuthToken(req);
  if (!token) return { error: unauthorized() };
  const check = denyIfUnauthorized(token.role, API_PATH, method);
  if (!check.allowed) return { error: NextResponse.json(check.response, { status: 403 }) };
  return {
    actor: {
      username: token.username || token.name,
      role: token.role,
      ip: getTrustedClientIp(req),
    },
  };
}

function errorResponse(err: unknown) {
  if (err instanceof TransactionVoidError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[transaksi/pembatalan]", err);
  return NextResponse.json({ error: "Gagal memproses pembatalan transaksi" }, { status: 500 });
}

/** GET ?status=PENDING|APPROVED|REJECTED — daftar pengajuan pembatalan */
export async function GET(req: NextRequest) {
  const auth = await authorize(req, "GET");
  if (auth.error) return auth.error;
  try {
    const status = req.nextUrl.searchParams.get("status");
    return NextResponse.json({ data: await listTransactionVoids(status) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { transactionCode, reason, providerReference } — ajukan pembatalan */
export async function POST(req: NextRequest) {
  const auth = await authorize(req, "POST");
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as { transactionCode?: string; reason?: string; providerReference?: string };
    const created = await requestTransactionVoid({
      transactionCode: String(body.transactionCode || ""),
      reason: String(body.reason || ""),
      providerReference: body.providerReference ?? null,
      actor: auth.actor,
    });
    return NextResponse.json({ data: created, message: "Pengajuan pembatalan dibuat, menunggu persetujuan" }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH { id, action: "approve" | "reject", note } — setujui / tolak (bukan oleh pengaju) */
export async function PATCH(req: NextRequest) {
  const auth = await authorize(req, "PATCH");
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as { id?: number; action?: string; note?: string };
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action harus approve atau reject" }, { status: 400 });
    }
    const updated = await reviewTransactionVoid({
      id: Number(body.id),
      action: body.action,
      note: body.note ?? null,
      actor: auth.actor,
    });
    return NextResponse.json({
      data: updated,
      message: body.action === "approve" ? "Transaksi berhasil dibatalkan" : "Pengajuan pembatalan ditolak",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
