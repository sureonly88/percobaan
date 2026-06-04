import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { generateReconciliationBatch, listReconciliationBatches } from "@/lib/reconciliation";

function getProvider(value: string | null): "pdam" | "lunasin" | null {
  if (value === "pdam" || value === "lunasin") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/rekonsiliasi", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const result = await listReconciliationBatches({
    provider: sp.get("provider") || "ALL",
    page: Number(sp.get("page") || 1),
    pageSize: Number(sp.get("pageSize") || 10),
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; username?: string; name?: string; loketCode?: string } | undefined;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user?.role !== "admin") return NextResponse.json({ error: "Hanya admin yang dapat generate batch rekonsiliasi" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    provider?: string;
    providerImportId?: number;
    startDate?: string;
    endDate?: string;
    loketCode?: string;
  };
  const provider = getProvider(body.provider || null);
  if (!provider) return NextResponse.json({ error: "provider wajib bernilai pdam atau lunasin" }, { status: 400 });
  if (!body.startDate || !body.endDate) return NextResponse.json({ error: "startDate dan endDate wajib diisi" }, { status: 400 });

  try {
    const result = await generateReconciliationBatch({
      provider,
      providerImportId: Number(body.providerImportId || 0),
      role: user.role,
      userLoketCode: user.loketCode,
      loketCode: body.loketCode || null,
      startDate: body.startDate,
      endDate: body.endDate,
      createdBy: user.username || user.name || "admin",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal generate batch rekonsiliasi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
