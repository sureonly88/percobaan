// Menu bawah versi mobile (/m). Hak akses tetap dari lib/rbac.ts lewat prefix "/m".
export type MobileNavItem = { label: string; href: string; icon: string };

export const MOBILE_NAV: MobileNavItem[] = [
  { label: "Beranda", href: "/m", icon: "home" },
  { label: "Bayar", href: "/m/bayar", icon: "point_of_sale" },
  { label: "Riwayat", href: "/m/riwayat", icon: "history" },
  { label: "Laporan", href: "/m/laporan", icon: "analytics" },
  { label: "Akun", href: "/m/akun", icon: "person" },
];

/** Supervisor: inbox persetujuan + Riwayat & Laporan (tanpa Bayar / Pelanggan). */
export const SUPERVISOR_NAV: MobileNavItem[] = [
  { label: "Persetujuan", href: "/m/persetujuan", icon: "inbox" },
  { label: "Riwayat", href: "/m/riwayat", icon: "history" },
  { label: "Laporan", href: "/m/laporan", icon: "analytics" },
  { label: "Akun", href: "/m/akun", icon: "person" },
];

export function navForRole(role: string | undefined): MobileNavItem[] {
  return role === "supervisor" ? SUPERVISOR_NAV : MOBILE_NAV;
}

// Sub-halaman menu Akun yang tidak berada di bawah /m/akun.
const AKUN_SUBPAGES = ["/m/topup", "/m/tutup-kasir", "/m/pengaturan", "/m/panduan"];

export function isNavActive(pathname: string, href: string, navHrefs: string[] = []): boolean {
  if (href === "/m") return pathname === "/m";
  // Laporan masalah: bagian inbox untuk penangan, bagian Akun untuk agen
  if (pathname === "/m/masalah" || pathname.startsWith("/m/masalah/")) {
    return href === (navHrefs.includes("/m/persetujuan") ? "/m/persetujuan" : "/m/akun");
  }
  if (href === "/m/bayar" && (pathname === "/m/pelanggan" || pathname.startsWith("/m/pelanggan/"))) return true;
  if (href === "/m/akun" && AKUN_SUBPAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return pathname === href || pathname.startsWith(href + "/");
}
