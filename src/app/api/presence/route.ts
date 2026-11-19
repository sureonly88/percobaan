import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { touchPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";

/** POST { channel: "mobile" | "web", path } — catat "terakhir aktif" pengguna yang login. */
export async function POST(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { channel?: string; path?: string };
  try {
    await touchPresence({
      username: token.username,
      channel: body.channel === "mobile" ? "mobile" : "web",
      // Hanya path aplikasi (tanpa query) — tidak menyimpan data pelanggan dari URL
      path: typeof body.path === "string" && body.path.startsWith("/") ? body.path.split("?")[0] : null,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    console.warn("[presence]", e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
