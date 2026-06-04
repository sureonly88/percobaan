import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { importProviderReconciliationFile, listReconciliationProviderImports } from "@/lib/reconciliation";

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
  const result = await listReconciliationProviderImports({
    provider: sp.get("provider") || "ALL",
    page: Number(sp.get("page") || 1),
    pageSize: Number(sp.get("pageSize") || 10),
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; username?: string; name?: string } | undefined;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user?.role !== "admin") return NextResponse.json({ error: "Hanya admin yang dapat import file provider" }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Form upload tidak valid" }, { status: 400 });

  const provider = getProvider(String(formData.get("provider") || ""));
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const loketCode = String(formData.get("loketCode") || "") || null;
  const file = formData.get("file");

  if (!provider) return NextResponse.json({ error: "provider wajib bernilai pdam atau lunasin" }, { status: 400 });
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate dan endDate wajib diisi" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "File Excel wajib diupload" }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Format file harus .xlsx atau .xls" }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importProviderReconciliationFile({
      provider,
      startDate,
      endDate,
      loketCode,
      filename: file.name,
      buffer,
      importedBy: user.username || user.name || "admin",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal import file provider";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
