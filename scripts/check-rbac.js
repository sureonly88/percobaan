#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/check-rbac.js
// Cek kesesuaian hak akses HALAMAN (ROLE_PAGES) dengan izin API yang dipanggil
// halaman tersebut. Mencegah kasus "menu bisa dibuka tapi data ditolak server".
//
// Untuk setiap role & halaman yang boleh dibuka:
//   - kumpulkan fetch("/api/...") di page.tsx halaman itu
//   - cek izin lewat API_PERMISSIONS (lib/rbac.ts) dan pengecekan role yang ditulis
//     langsung di handler (mis. `role !== "admin"`)
// GET yang ditolak  → ERROR (halaman kosong/gagal dimuat)
// Aksi tulis ditolak → INFO (wajar bila tombolnya disembunyikan untuk role itu)
//
// Jalankan: npm run check:rbac   (exit code 1 bila ada ERROR)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src", "app");

function loadRbac() {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/rbac.ts"), "utf8");
  // ROLE_PAGES & API_PERMISSIONS tidak diekspor — ekspor sementara untuk dibaca skrip ini
  const patched = src
    .replace("const ROLE_PAGES", "export const ROLE_PAGES")
    .replace("const API_PERMISSIONS", "export const API_PERMISSIONS");
  const { outputText } = ts.transpileModule(patched, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", outputText)(mod, mod.exports, require);
  return mod.exports;
}

function pageFile(route) {
  const f = path.join(APP, route === "/" ? "" : route, "page.tsx");
  return fs.existsSync(f) ? f : null;
}

/** fetch() ke /api/* di file halaman beserta method-nya. */
function apiCalls(file) {
  const src = fs.readFileSync(file, "utf8");
  const calls = [];
  const re = /fetch\(\s*[`"'](\/api\/[^`"'?$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    // Penanda `rbac-check: <role,...>` di 3 baris sebelum fetch = pemanggilan dijaga di UI
    // hanya untuk role tersebut (mis. `if (!isAdmin) return;`).
    const before = src.slice(Math.max(0, m.index - 300), m.index).split("\n").slice(-4).join("\n");
    const marker = before.match(/rbac-check:\s*([a-z,\s]+)/);
    const apiPath = m[1].replace(/\/$/, "");
    const tail = src.slice(m.index, m.index + 400);
    const methodMatch = tail.match(/method:\s*[`"'](GET|POST|PUT|PATCH|DELETE)[`"']/);
    // Hanya hitung method bila masih di dalam pemanggilan fetch yang sama
    const closeIdx = tail.indexOf("});");
    const method =
      methodMatch && (closeIdx === -1 || methodMatch.index < closeIdx) ? methodMatch[1] : "GET";
    calls.push({ apiPath, method, onlyFor: marker ? marker[1].split(",").map((s) => s.trim()).filter(Boolean) : null });
  }
  return calls;
}

/** Pengecekan role yang ditulis langsung di handler method tertentu. */
function inlineDenies(apiPath, method, role) {
  const f = path.join(APP, apiPath, "route.ts");
  if (!fs.existsSync(f)) return false;
  const src = fs.readFileSync(f, "utf8");
  const start = src.search(new RegExp(`export\\s+(async\\s+function|const)\\s+${method}\\b`));
  if (start === -1) return false;
  const next = src.slice(start + 10).search(/\nexport\s+(async\s+function|const)\s+/);
  const body = next === -1 ? src.slice(start) : src.slice(start, start + 10 + next);
  // Hanya gerbang peran murni: if (role !== "admin" [&& role !== "supervisor" ...]).
  // Kondisi campuran (mis. "admin ATAU pemilik data") diabaikan karena tidak menolak per peran.
  const conds = [...body.matchAll(/if\s*\(([^()]*!==\s*["']admin["'][^()]*)\)/g)].map((x) => x[1]);
  for (const cond of conds) {
    const parts = cond.split("&&").map((p) => p.trim());
    const roles = parts.map((p) => (p.match(/role\s*!==\s*["'](\w+)["']$/) || [])[1]);
    if (roles.some((r) => !r)) continue;
    if (!roles.includes(role)) return true;
  }
  return false;
}

function main() {
  const { ROLE_PAGES, canAccessApi } = loadRbac();
  const errors = [];
  const infos = [];

  for (const [role, pages] of Object.entries(ROLE_PAGES)) {
    for (const route of pages) {
      const file = pageFile(route);
      if (!file) continue;
      const seen = new Set();
      for (const { apiPath, method, onlyFor } of apiCalls(file)) {
        if (onlyFor && !onlyFor.includes(role)) continue;
        const key = `${method} ${apiPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const denied = !canAccessApi(role, apiPath, method) || inlineDenies(apiPath, method, role);
        if (!denied) continue;
        const line = `[${role}] ${route} → ${method} ${apiPath}`;
        (method === "GET" ? errors : infos).push(line);
      }
    }
  }

  if (infos.length) {
    console.log("INFO — aksi tulis ditolak untuk role (pastikan tombolnya disembunyikan):");
    infos.forEach((l) => console.log("  " + l));
  }
  if (errors.length) {
    console.error("\nERROR — halaman bisa dibuka tapi data (GET) ditolak server:");
    errors.forEach((l) => console.error("  " + l));
    console.error(`\n${errors.length} ketidaksesuaian. Perbaiki ROLE_PAGES atau izin API di src/lib/rbac.ts.`);
    process.exit(1);
  }
  console.log("\nOK — semua halaman yang boleh dibuka setiap role dapat memuat datanya.");
}

main();
