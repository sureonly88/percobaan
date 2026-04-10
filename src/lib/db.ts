import mysql, { Pool } from "mysql2/promise";

const globalForDb = globalThis as unknown as { _dbPool?: Pool };

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
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._dbPool = pool;
}

export default pool;
