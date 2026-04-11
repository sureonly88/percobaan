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
    "/", "/pembayaran", "/advice-lunasin", "/laporan", "/rekonsiliasi", "/tutup-kasir", "/verifikasi-kasir", "/riwayat",
    "/loket", "/saldo", "/biaya-admin", "/pelanggan", "/users", "/pengaturan", "/monitoring", "/notifikasi", "/provider", "/topup",
  ],
  supervisor: [
    "/", "/laporan", "/rekonsiliasi", "/tutup-kasir", "/verifikasi-kasir", "/riwayat", "/pelanggan", "/loket", "/pengaturan", "/monitoring", "/notifikasi", "/advice-lunasin",
  ],
  kasir: [
    "/", "/pembayaran", "/advice-lunasin", "/laporan", "/rekonsiliasi", "/tutup-kasir", "/riwayat", "/pelanggan", "/pengaturan", "/notifikasi", "/topup",
  ],
  switcher: [
    "/provider/docs",
  ],
};

// API route permissions: [method] -> roles that can use it
// If not listed, all authenticated users can access
const API_PERMISSIONS: Record<string, Record<string, UserRole[]>> = {
  "/api/dashboard": { GET: ["admin", "supervisor", "kasir"] },
  "/api/loket": {
    GET: ["admin", "supervisor"],
    POST: ["admin"],
    PUT: ["admin"],
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
    GET: ["admin", "supervisor", "kasir"],
  },
  "/api/rekonsiliasi/export": {
    GET: ["admin", "supervisor", "kasir"],
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
  return r === "admin" || r === "kasir";
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
