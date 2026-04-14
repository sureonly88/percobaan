#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/migrate.js
// Jalankan semua file SQL di database/migrations secara berurutan.
// Setiap file hanya sekali dijalankan — dicatat di tabel `schema_migrations`.
// Setelah migrasi, buat loket & user admin pertama jika belum ada.
// Aman dijalankan ulang (idempotent).
//
// Env vars untuk seed admin (opsional — ada default-nya):
//   ADMIN_USERNAME   default: admin
//   ADMIN_PASSWORD   default: Admin@1234
//   ADMIN_EMAIL      default: admin@pedami.local
//   ADMIN_NAME       default: Administrator
//   LOKET_NAMA       default: Loket Utama
//   LOKET_CODE       default: LKT-001
// ─────────────────────────────────────────────────────────────────────────────
const fs    = require("fs");
const path  = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "127.0.0.1",
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || "yakinyakin",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME     || "pedami_payment",
    multipleStatements: true,
  });

  try {
    // Buat tabel pencatat migrasi jika belum ada
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename  VARCHAR(255) NOT NULL,
        run_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (filename)
      ) ENGINE=InnoDB;
    `);

    const migrationsDir = path.join(__dirname, "../database/migrations");
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // urutan leksikografis — sesuai penamaan timestamp

    const [rows] = await conn.query("SELECT filename FROM schema_migrations");
    const done = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (done.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      process.stdout.write(`  run   ${file} ... `);
      await runStatements(conn, sql, file);
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      console.log("OK");
      ran++;
    }

    if (ran === 0) {
      console.log("Semua migrasi sudah up-to-date.");
    } else {
      console.log(`\n${ran} migrasi berhasil dijalankan.`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Seed: loket utama + user admin pertama
    // ─────────────────────────────────────────────────────────────────────
    await seedAdmin(conn);
  } finally {
    await conn.end();
  }
}

async function seedAdmin(conn) {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";
  const adminEmail    = process.env.ADMIN_EMAIL    || "admin@pedami.local";
  const adminName     = process.env.ADMIN_NAME     || "Administrator";
  const loketNama     = process.env.LOKET_NAMA     || "Loket Utama";
  const loketCode     = process.env.LOKET_CODE     || "LKT-001";

  // 1. Buat loket utama jika belum ada
  const [[existingLoket]] = await conn.query(
    "SELECT id FROM lokets WHERE loket_code = ? LIMIT 1",
    [loketCode]
  );
  let loketId;
  if (existingLoket) {
    loketId = existingLoket.id;
    console.log(`  skip  seed loket (${loketCode} sudah ada)`);
  } else {
    const [result] = await conn.query(
      `INSERT INTO lokets (nama, loket_code, jenis, status, pulsa, biaya_admin)
       VALUES (?, ?, 'admin', 'aktif', 0, 0)`,
      [loketNama, loketCode]
    );
    loketId = result.insertId;
    console.log(`  seed  loket "${loketNama}" (${loketCode}) dibuat — id: ${loketId}`);
  }

  // 2. Buat user admin jika belum ada
  const [[existingUser]] = await conn.query(
    "SELECT id FROM users WHERE username = ? LIMIT 1",
    [adminUsername]
  );
  if (existingUser) {
    console.log(`  skip  seed user admin (username "${adminUsername}" sudah ada)`);
  } else {
    const hashed = await bcrypt.hash(adminPassword, 12);
    await conn.query(
      `INSERT INTO users (name, username, email, password, role, loket_id)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [adminName, adminUsername, adminEmail, hashed, loketId]
    );
    console.log(`  seed  user admin "${adminUsername}" dibuat`);
    console.log(`        username : ${adminUsername}`);
    console.log(`        password : ${adminPassword}`);
    console.log(`        GANTI PASSWORD setelah login pertama!`);
  }
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Jalankan setiap statement SQL satu per satu.
// Error berikut di-skip karena artinya objek sudah ada (idempotent):
//   1060 ER_DUP_FIELDNAME   — ADD COLUMN yang sudah ada
//   1061 ER_DUP_KEYNAME     — ADD INDEX/KEY yang sudah ada
//   1050 ER_TABLE_EXISTS    — CREATE TABLE (tanpa IF NOT EXISTS)
//   1091 ER_CANT_DROP_FIELD — DROP COLUMN/INDEX yang sudah tidak ada
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_ERRNO = new Set([1060, 1061, 1050, 1091]);

async function runStatements(conn, sql, filename) {
  // Split pada titik-koma yang berada di posisi "atas" (bukan di dalam string/komentar)
  const statements = sql
    .split(/;\s*(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/m)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      if (SKIP_ERRNO.has(err.errno)) {
        // Tulis warning tapi lanjutkan
        process.stdout.write(`\n    warn  [${filename}] ${err.message} — skipped`);
      } else {
        throw err;
      }
    }
  }
}
