import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import {
  CashierClosingError,
  approveCashierClosingReopen,
  getAllClosingsForReview,
  requestCashierClosingReopen,
  reviewCashierClosing,
} from "@/lib/cashier-closing";

function getSessionUser(session: unknown) {
  return (session as {
    user?: {
      role?: string;
      username?: string;
      loketCode?: string;
    };
  } | null)?.user as {
    role?: string;
    username?: string;
    loketCode?: string;
  } | undefined;
}

function handleError(error: unknown, fallbackMessage: string) {
  if (error instanceof CashierClosingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);
  const check = denyIfUnauthorized(user?.role, "/api/verifikasi-kasir", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const result = await getAllClosingsForReview({
      role: user?.role,
      businessDate: searchParams.get("businessDate"),
      status: searchParams.get("status"),
    });

    return NextResponse.json({ items: result });
  } catch (error) {
    return handleError(error, "Gagal mengambil data verifikasi kasir");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);
  const check = denyIfUnauthorized(user?.role, "/api/verifikasi-kasir", "PATCH");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const action = body.action as string | undefined;

    const result = action === "request_reopen"
      ? await requestCashierClosingReopen({
          role: user?.role,
          requesterUsername: user?.username,
          closingId: body.closingId,
          note: body.note,
        })
      : action === "approve_reopen"
        ? await approveCashierClosingReopen({
            role: user?.role,
            reviewerUsername: user?.username,
            closingId: body.closingId,
            note: body.note,
          })
        : await reviewCashierClosing({
            role: user?.role,
            reviewerUsername: user?.username,
            closingId: body.closingId,
            status: body.status,
            verifierNote: body.verifierNote,
            receivedAmount: body.receivedAmount,
          });

    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, "Gagal memproses verifikasi kasir");
  }
}
