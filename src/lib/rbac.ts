// Role-Based Access Control (RBAC) configuration
// Roles: admin, supervisor, kasir

export type UserRole = "admin" | "supervisor" | "kasir" | "switcher";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  kasir: "Kasir",
  switcher: "Switcher",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Akses penuh ke semua fitur",
  supervisor: "Bisa melihat laporan, tidak bisa edit data",
  kasir: "Khusus proses pembayaran di loket",
  switcher: "Akses dokumentasi API provider",
};

export const ROLE_ICONS: Record<UserRole, string> = {
  admin: "shield_person",
  supervisor: "supervisor_account",
  kasir: "person",
  switcher: "swap_horiz",
};

export const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  admin: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
  },
  supervisor: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-400",
  },
  kasir: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
  },
  switcher: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-400",
  },
};

// Pages each role can access
const ROLE_PAGES: Record<UserRole, string[]> = {
  admin: [
    "/", "/pembayaran", "/payment-links", "/advice-lunasin", "/advice-pdam", "/pending-transaksi", "/laporan", "/rekonsiliasi", "/tutup-kasir", "/verifikasi-kasir", "/riwayat", "/cetak-ulang",
    "/loket", "/loket/members", "/saldo", "/biaya-admin", "/pelanggan", "/users", "/users/registrations", "/pengaturan", "/monitoring", "/notifikasi", "/provider", "/topup",
    "/db-manage", "/import-transaksi",
    "/keuangan", "/keuangan/jurnal", "/keuangan/buku-besar", "/keuangan/neraca-saldo", "/keuangan/margin", "/keuangan/akun", "/keuangan/komisi", "/keuangan/komisi/laporan",
    "/settlement",
  ],
  supervisor: [
    // Operasional
    "/", "/payment-links", "/advice-lunasin", "/advice-pdam", "/pending-transaksi", "/notifikasi",
    // Kasir & Laporan
    "/tutup-kasir", "/verifikasi-kasir", "/laporan", "/rekonsiliasi", "/riwayat", "/cetak-ulang", "/monitoring",
    // Pelanggan & Loket
    "/pelanggan", "/loket", "/loket/members", "/saldo", "/topup",
    // Keuangan
    "/keuangan", "/keuangan/jurnal", "/keuangan/buku-besar", "/keuangan/neraca-saldo", "/keuangan/margin", "/keuangan/komisi", "/keuangan/komisi/laporan",
    "/settlement",
    // Administrasi (view-level)
    "/biaya-admin", "/users/registrations", "/pengaturan",
  ],
  kasir: [
    // Operasional
    "/", "/pembayaran", "/payment-links", "/notifikasi",
    // Kasir & Laporan
    "/tutup-kasir", "/laporan", "/riwayat", "/cetak-ulang",
    // Pelanggan & Loket
    "/pelanggan", "/loket/members", "/topup",
    // Akun pribadi
    "/pengaturan",
  ],
  switcher: [
    "/provider/docs",
  ],
};

// API route permissions: [method] -> roles that can use it
// If not listed, all authenticated users can access
const API_PERMISSIONS: Record<string, Record<string, UserRole[]>> = {
  "/api/v1/admin/import-transaksi": { GET: ["admin"], POST: ["admin"], DELETE: ["admin"] },
  "/api/v1/admin/import-transaksi/logs": { GET: ["admin"] },
  "/api/dashboard": { GET: ["admin", "supervisor", "kasir"] },
  "/api/loket": {
    GET: ["admin", "supervisor"],
    POST: ["admin"],
    PUT: ["admin"],
  },
  "/api/loket/members": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin", "kasir"],
    PUT: ["admin", "kasir"],
    DELETE: ["admin", "kasir"],
  },
  "/api/saldo": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin", "kasir"],
  },
  "/api/biaya-admin": {
    GET: ["admin"],
    PUT: ["admin"],
  },
  "/api/pelanggan": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin"],
    PUT: ["admin"],
    DELETE: ["admin"],
  },
  "/api/laporan": {
    GET: ["admin", "supervisor", "kasir"],
  },
  "/api/laporan/detail": {
    GET: ["admin", "supervisor", "kasir"],
  },
  "/api/rekonsiliasi": {
    GET: ["admin", "supervisor"],
  },
  "/api/rekonsiliasi/export": {
    GET: ["admin", "supervisor"],
  },
  "/api/tutup-kasir": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin", "supervisor", "kasir"],
    PATCH: ["admin", "supervisor", "kasir"],
  },
  "/api/verifikasi-kasir": {
    GET: ["admin", "supervisor"],
    PATCH: ["admin", "supervisor"],
  },
  "/api/monitoring": {
    GET: ["admin", "supervisor", "kasir"],
    PATCH: ["admin"],
  },
  "/api/monitoring/risiko": {
    GET: ["admin", "supervisor"],
  },
  "/api/v1/transactions": {
    GET: ["admin", "supervisor", "kasir"],
  },
  "/api/users": {
    GET: ["admin"],
    POST: ["admin"],
    PUT: ["admin"],
    DELETE: ["admin"],
  },
  "/api/provider": {
    GET: ["admin"],
    POST: ["admin"],
    PUT: ["admin"],
    DELETE: ["admin"],
  },
  "/api/notifications": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin"],
    PATCH: ["admin", "supervisor", "kasir"],
  },
  "/api/topup": {
    GET: ["admin", "supervisor", "kasir"],
  },
  "/api/topup/create": {
    POST: ["admin", "kasir"],
  },
  "/api/payment-links": {
    GET: ["admin", "supervisor", "kasir"],
    POST: ["admin", "supervisor", "kasir"],
  },
  "/api/payment-links/disputes": {
    GET: ["admin", "supervisor"],
    PATCH: ["admin", "supervisor"],
  },
  "/api/pembayaran/stale-pending": {
    GET: ["admin", "supervisor"],
    PATCH: ["admin", "supervisor"],
  },
  "/api/keuangan/jurnal": {
    GET: ["admin", "supervisor"],
  },
  "/api/keuangan/buku-besar": {
    GET: ["admin", "supervisor"],
  },
  "/api/keuangan/neraca-saldo": {
    GET: ["admin", "supervisor"],
  },
  "/api/keuangan/margin": {
    GET: ["admin", "supervisor"],
  },
  "/api/keuangan/akun": {
    GET: ["admin", "supervisor"],
    POST: ["admin"],
    PATCH: ["admin"],
  },
  "/api/keuangan/komisi/rules": {
    GET: ["admin", "supervisor"],
    POST: ["admin"],
    PATCH: ["admin"],
    DELETE: ["admin"],
  },
  "/api/keuangan/komisi/laporan": {
    GET: ["admin", "supervisor"],
  },
  "/api/keuangan/komisi/backfill": {
    POST: ["admin"],
  },
  "/api/settlement/batches": {
    GET: ["admin", "supervisor"],
    POST: ["admin"],
    PATCH: ["admin"],
  },
};

// Check if a role can access a page
export function canAccessPage(role: string, path: string): boolean {
  const r = normalizeRole(role);
  const allowed = ROLE_PAGES[r];
  if (!allowed) return false;
  return allowed.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));
}

// Check if a role can access an API route with a specific method
export function canAccessApi(role: string, apiPath: string, method: string): boolean {
  const r = normalizeRole(role);
  if (r === "admin") return true;

  const perms = API_PERMISSIONS[apiPath];
  if (!perms) return true; // No restriction defined = allow all
  const methodPerms = perms[method];
  if (!methodPerms) return true; // No restriction for this method
  return methodPerms.includes(r);
}

// Check if role can perform write operations (create/edit/delete)
export function canWrite(role: string): boolean {
  const r = normalizeRole(role);
  return r === "admin";
}

// Check if role can process payments
export function canProcessPayment(role: string): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "kasir" || r === "supervisor";
}

// Get accessible sidebar items for a role
export function getAccessiblePages(role: string): string[] {
  const r = normalizeRole(role);
  return ROLE_PAGES[r] || [];
}

// Normalize legacy role values
export function normalizeRole(role: string): UserRole {
  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  if (role === "switcher") return "switcher";
  // "user", "operator", "kasir", or any other value → kasir
  return "kasir";
}

// Get all roles for admin UI
export function getAllRoles(): UserRole[] {
  return ["admin", "supervisor", "kasir", "switcher"];
}

// Helper for API route permission checking
// Returns null if allowed, or a NextResponse with 403 if denied
export function denyIfUnauthorized(
  role: string | undefined | null,
  apiPath: string,
  method: string
): { allowed: false; response: { error: string } } | { allowed: true } {
  if (!role) return { allowed: false, response: { error: "Unauthorized" } };
  if (!canAccessApi(role, apiPath, method)) {
    return { allowed: false, response: { error: "Anda tidak memiliki akses untuk operasi ini" } };
  }
  return { allowed: true };
}
