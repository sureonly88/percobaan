import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { canWrite } from "@/lib/rbac";
import { cached, invalidateCache } from "@/lib/cache";
import { auditLog } from "@/lib/audit-log";

function maskSensitiveSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      /secret|password|pass|token|key/i.test(key) ? "[REDACTED]" : value,
    ])
  );
}

// GET: Retrieve all settings (authenticated users only)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await cached(
      "app_settings",
      async () => {
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT setting_key, setting_value FROM app_settings"
        );
        const result: Record<string, string> = {};
        for (const row of rows) {
          result[row.setting_key] = row.setting_value;
        }
        return result;
      },
      2 * 60 * 1000 // 2 min TTL
    );

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Settings GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil pengaturan" }, { status: 500 });
  }
}

// PUT: Update settings (key-value pairs) - admin only
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; username?: string; name?: string } | undefined;
  const role = user?.role;
  if (!role || !canWrite(role)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk operasi ini" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Data pengaturan tidak valid" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(settings)) {
      await pool.query<ResultSetHeader>(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }

    invalidateCache("app_settings");
    invalidateCache("feature_flags");

    await auditLog({
      actorType: "user",
      actorUsername: user?.username || user?.name || null,
      actorRole: role || null,
      actorIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
      action: "APP_SETTINGS_UPDATE",
      entityType: "app_settings",
      after: maskSensitiveSettings(Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)]))),
    });

    return NextResponse.json({ message: "Pengaturan berhasil disimpan" });
  } catch (error) {
    console.error("Settings PUT Error:", error);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 });
  }
}
