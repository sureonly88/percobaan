import mysql, { Pool } from "mysql2/promise";

const globalForDb = globalThis as unknown as { _dbPool?: Pool };

// Hardening (OWASP A05): di production, JANGAN diam-diam pakai kredensial default
// (root + password kosong). Wajib gagal-cepat agar misconfig terdeteksi.
if (process.env.NODE_ENV === "production") {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    throw new Error(
      "DB_HOST, DB_USER, dan DB_NAME wajib diset di production (lihat .env)."
    );
  }
  if (process.env.DB_PASSWORD === undefined || process.env.DB_PASSWORD === "") {
    throw new Error(
      "DB_PASSWORD wajib diset (non-kosong) di production. " +
        "Menjalankan MySQL tanpa password tidak diizinkan."
    );
  }
}

const pool =
  globalForDb._dbPool ??
  mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pedami_payment",
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 30,
    queueLimit: 0,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    // Cegah serangan multi-statement injection (defense-in-depth);
    // semua query proyek pakai placeholder, jadi flag ini aman.
    multipleStatements: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._dbPool = pool;
}

export default pool;
