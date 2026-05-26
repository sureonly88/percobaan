import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public health check endpoint untuk load balancer / uptime monitoring.
// Memverifikasi konektivitas database dengan query ringan.
export async function GET() {
  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1");
    const dbLatencyMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        dbLatencyMs,
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || "1.0.0",
        uptimeSec: Math.round(process.uptime()),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        error: message,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
