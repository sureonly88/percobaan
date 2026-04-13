import { NextRequest, NextResponse } from "next/server";
import { generateDbManageToken } from "@/lib/db-manage-auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { password } = body;

  const expected = process.env.MANAGE_DB_PASS?.trim();
  if (!expected) {
    return NextResponse.json({ error: "MANAGE_DB_PASS tidak dikonfigurasi di .env" }, { status: 500 });
  }

  if (!password || password !== expected) {
    return NextResponse.json({ error: "Password salah" }, { status: 401 });
  }

  return NextResponse.json({ token: generateDbManageToken() });
}
