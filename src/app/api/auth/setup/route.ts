import { NextResponse } from "next/server";

// DISABLED: This endpoint is only for initial development setup.
// To re-enable, set ALLOW_SETUP=true in environment variables.
export async function POST() {
  const allowSetup = process.env.ALLOW_SETUP === "true";
  if (!allowSetup) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Dynamic imports only when enabled
  const pool = (await import("@/lib/db")).default;
  const bcrypt = (await import("bcryptjs")).default;

  try {
    const [existing] = await pool.query<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
    );

    if ((existing as import("mysql2").RowDataPacket[]).length > 0) {
      return NextResponse.json({ message: "Admin user already exists" });
    }

    const hashedPassword = await bcrypt.hash("admin123", 12);
    await pool.query(
      "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
      ["admin", hashedPassword, "Administrator", "admin"]
    );

    return NextResponse.json({ message: "Setup complete" });
  } catch (error) {
    console.error("Setup Error:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
