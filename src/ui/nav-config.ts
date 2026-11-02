// Susunan menu aplikasi — satu sumber untuk navigasi atas (AppTopNav) dan sidebar
// (AppSidebar) agar keduanya tidak berbeda. Hak akses tetap diatur di lib/rbac.ts;
// grup yang semua menunya tidak bisa diakses role tertentu otomatis disembunyikan.

export type NavItem = { label: string; href: string; icon: string };
export type NavGroup = {
  category: string;
  /** Label ringkas untuk bar navigasi atas yang ruangnya terbatas. */
  shortLabel: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    // Pekerjaan harian kasir di loket
    category: "Operasional",
    shortLabel: "Operasional",
    items: [
      { label: "Dashboard", href: "/", icon: "dashboard" },
      { label: "Multi-Payment", href: "/pembayaran", icon: "receipt_long" },
      { label: "Payment Link", href: "/payment-links", icon: "link" },
      { label: "Cetak Ulang Struk", href: "/cetak-ulang", icon: "print" },
      { label: "Notifikasi", href: "/notifikasi", icon: "notifications" },
      { label: "Panduan Pengguna", href: "/panduan", icon: "help_center" },
    ],
  },
  {
    // Kasir menutup loket → supervisor memverifikasi setoran
    category: "Kasir & Setoran",
    shortLabel: "Kasir",
    items: [
      { label: "Tutup Kasir", href: "/tutup-kasir", icon: "point_of_sale" },
      { label: "Verifikasi Kasir", href: "/verifikasi-kasir", icon: "verified" },
    ],
  },
  {
    // Transaksi bermasalah, urut dari penanganan paling ringan ke paling berat
    category: "Penyelesaian Transaksi",
    shortLabel: "Penyelesaian",
    items: [
      { label: "Advice PDAM", href: "/advice-pdam", icon: "water_drop" },
      { label: "Advice Lunasin", href: "/advice-lunasin", icon: "manage_search" },
      { label: "Transaksi Tergantung", href: "/pending-transaksi", icon: "pending_actions" },
      { label: "Review Transaksi", href: "/review-transaksi", icon: "fact_check" },
      { label: "Pembatalan Transaksi", href: "/pembatalan", icon: "undo" },
    ],
  },
  {
    category: "Laporan",
    shortLabel: "Laporan",
    items: [
      { label: "Laporan Transaksi", href: "/laporan", icon: "analytics" },
      { label: "Riwayat Transaksi", href: "/riwayat", icon: "history" },
      { label: "Rekonsiliasi Data", href: "/rekonsiliasi", icon: "table_view" },
    ],
  },
  {
    category: "Monitoring",
    shortLabel: "Monitoring",
    items: [
      { label: "Monitoring Transaksi", href: "/monitoring", icon: "monitor_heart" },
      { label: "Risiko Transaksi", href: "/monitoring/risiko", icon: "crisis_alert" },
      { label: "Health Provider", href: "/monitoring/provider-health", icon: "health_metrics" },
    ],
  },
  {
    category: "Keuangan & Akuntansi",
    shortLabel: "Keuangan",
    items: [
      { label: "Ringkasan Keuangan", href: "/keuangan", icon: "account_balance" },
      { label: "Margin & Profit", href: "/keuangan/margin", icon: "trending_up" },
      { label: "Pengaturan Komisi", href: "/keuangan/komisi", icon: "redeem" },
      { label: "Laporan Komisi", href: "/keuangan/komisi/laporan", icon: "request_quote" },
      { label: "Settlement Loket", href: "/settlement", icon: "handshake" },
      { label: "Jurnal Umum", href: "/keuangan/jurnal", icon: "menu_book" },
      { label: "Buku Besar", href: "/keuangan/buku-besar", icon: "import_contacts" },
      { label: "Neraca Saldo", href: "/keuangan/neraca-saldo", icon: "balance" },
      { label: "Chart of Accounts", href: "/keuangan/akun", icon: "format_list_numbered" },
    ],
  },
  {
    category: "Loket & Saldo",
    shortLabel: "Loket & Saldo",
    items: [
      { label: "Manajemen Loket", href: "/loket", icon: "store" },
      { label: "Anggota Loket", href: "/loket/members", icon: "manage_accounts" },
      { label: "Update Saldo Loket", href: "/saldo", icon: "account_balance_wallet" },
      { label: "Top-up Saldo", href: "/topup", icon: "add_card" },
    ],
  },
  {
    category: "Administrasi",
    shortLabel: "Admin",
    items: [
      { label: "Manajemen Pelanggan", href: "/pelanggan", icon: "group" },
      { label: "Biaya Admin", href: "/biaya-admin", icon: "payments" },
      { label: "Manajemen User", href: "/users", icon: "admin_panel_settings" },
      { label: "Pendaftaran Agen", href: "/users/registrations", icon: "how_to_reg" },
      { label: "API Provider", href: "/provider", icon: "api" },
      { label: "Dokumentasi API", href: "/provider/docs", icon: "description" },
      { label: "Pengaturan", href: "/pengaturan", icon: "settings" },
      { label: "DB Manager", href: "/db-manage", icon: "database" },
      { label: "Import Transaksi", href: "/import-transaksi", icon: "move_to_inbox" },
    ],
  },
];

/** Saring menu sesuai halaman yang boleh diakses role; grup kosong dibuang. */
export function filterNavGroups(groups: NavGroup[], accessiblePages: string[]): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        accessiblePages.some((p) => item.href === p || (p !== "/" && item.href.startsWith(p + "/")))
      ),
    }))
    .filter((group) => group.items.length > 0);
}
