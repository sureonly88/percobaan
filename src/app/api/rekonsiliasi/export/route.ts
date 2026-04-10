import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { buildReconciliationExport } from "@/lib/reconciliation";

function getProvider(value: string | null): "pdam" | "lunasin" | null {
  if (value === "pdam" || value === "lunasin") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/rekonsiliasi/export", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const provider = getProvider(searchParams.get("provider"));
  if (!provider) {
    return NextResponse.json({ error: "provider wajib bernilai pdam atau lunasin" }, { status: 400 });
  }

  try {
    const file = await buildReconciliationExport({
      provider,
      role,
      userLoketCode: (session?.user as { loketCode?: string })?.loketCode,
      loketCode: searchParams.get("loketCode"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return new Response(file.buffer.toString("utf8"), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Rekonsiliasi export error:", error);
    return NextResponse.json({ error: "Gagal mengekspor data rekonsiliasi" }, { status: 500 });
  }
}