import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getTrustedClientIp } from "@/lib/request-client";
import {
  TransactionReviewError,
  approveFailedReview,
  listReviewQueue,
  listReviews,
  submitReviewDecision,
  type ReviewDecision,
} from "@/lib/transaction-review";

const API_PATH = "/api/transaksi/review";

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
  if (err instanceof TransactionReviewError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[transaksi/review]", err);
  return NextResponse.json({ error: "Gagal memproses review transaksi" }, { status: 500 });
}

/** GET ?view=queue (default) | PENDING | APPROVED | REJECTED */
export async function GET(req: NextRequest) {
  const auth = await authorize(req, "GET");
  if (auth.error) return auth.error;
  try {
    const view = req.nextUrl.searchParams.get("view") || "queue";
    if (view === "queue") return NextResponse.json({ data: await listReviewQueue() });
    return NextResponse.json({ data: await listReviews(view) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { transactionCode, decision: "SUCCESS" | "FAILED", evidence, note } */
export async function POST(req: NextRequest) {
  const auth = await authorize(req, "POST");
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as { transactionCode?: string; decision?: string; evidence?: string; note?: string };
    const review = await submitReviewDecision({
      transactionCode: String(body.transactionCode || ""),
      decision: body.decision as ReviewDecision,
      evidence: String(body.evidence || ""),
      note: body.note ?? null,
      actor: auth.actor,
    });
    return NextResponse.json(
      {
        data: review,
        message:
          review.decision === "SUCCESS"
            ? "Transaksi dikonfirmasi sukses"
            : "Pengajuan gagal dibuat — saldo dikembalikan setelah disetujui user lain",
      },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH { id, action: "approve" | "reject", note } — persetujuan pengembalian saldo (bukan oleh pengaju) */
export async function PATCH(req: NextRequest) {
  const auth = await authorize(req, "PATCH");
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as { id?: number; action?: string; note?: string };
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action harus approve atau reject" }, { status: 400 });
    }
    const review = await approveFailedReview({
      id: Number(body.id),
      action: body.action,
      note: body.note ?? null,
      actor: auth.actor,
    });
    return NextResponse.json({
      data: review,
      message: body.action === "approve" ? "Transaksi dinyatakan gagal, saldo dikembalikan" : "Pengajuan ditolak",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
