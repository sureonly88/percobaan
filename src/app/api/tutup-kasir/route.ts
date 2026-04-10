import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import {
  CashierClosingError,
  approveCashierClosingReopen,
  getCashierClosingOverview,
  requestCashierClosingReopen,
  reviewCashierClosing,
  saveCashierClosing,
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
  const check = denyIfUnauthorized(user?.role, "/api/tutup-kasir", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const result = await getCashierClosingOverview({
      role: user?.role,
      sessionUsername: user?.username,
      sessionLoketCode: user?.loketCode,
      businessDate: searchParams.get("businessDate"),
      username: searchParams.get("username"),
      loketCode: searchParams.get("loketCode"),
      shiftCode: searchParams.get("shiftCode"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, "Gagal mengambil data tutup kasir");
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);
  const check = denyIfUnauthorized(user?.role, "/api/tutup-kasir", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const result = await saveCashierClosing({
          role: user?.role,
          sessionUsername: user?.username,
          sessionLoketCode: user?.loketCode,
          businessDate: body.businessDate,
          username: body.username,
          loketCode: body.loketCode,
          shiftCode: body.shiftCode,
          openingCash: body.openingCash,
          otherCashAmount: body.otherCashAmount,
          retainedCash: body.retainedCash,
          cashierNote: body.cashierNote,
          discrepancyNote: body.discrepancyNote,
          discrepancyReasonCode: body.discrepancyReasonCode,
          proofReference: body.proofReference,
          proofNote: body.proofNote,
          denominations: body.denominations,
          action: body.action,
        });

    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, "Gagal menyimpan tutup kasir");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);
  const check = denyIfUnauthorized(user?.role, "/api/tutup-kasir", "PATCH");
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
    return handleError(error, "Gagal memverifikasi tutup kasir");
  }
}