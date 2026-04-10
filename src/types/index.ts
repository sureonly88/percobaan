export interface Pelanggan {
  id: string;
  nama: string;
  idPelanggan: string;
  periode: string;
  pemakaian: number;
  tarif: string;
  daya: string;
  tagihanListrik: number;
  biayaAdmin: number;
  totalTagihan: number;
  status: "lunas" | "belum_bayar" | "terlambat";
  jenis: "pasca_bayar" | "pra_bayar";
  layanan: "PLN" | "PDAM" | "Internet";
}

export interface NavLink {
  label: string;
  href: string;
  icon?: string;
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

export interface TagihanItem {
  id: string;
  layanan: "PDAM" | "PLN";
  idPelanggan: string;
  nama: string;
  periode: string;
  jumlahTagihan: number;
  wilayah: string;
}

// --- Notification types ---
export type NotificationCategory = "transaksi" | "saldo" | "sistem" | "pengumuman";
export type NotificationSeverity = "info" | "warning" | "error" | "success";

export interface AppNotification {
  id: number;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface CustomerFavorite {
  id: number;
  userId: number;
  serviceType: "PDAM" | "PLN";
  customerId: string;
  customerName?: string | null;
  aliasName?: string | null;
  address?: string | null;
  usageCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteGroupItem {
  id: number;
  groupId: number;
  serviceType: string;
  customerId: string;
  customerName?: string | null;
  productCode: string;
  input2: string;
  sortOrder: number;
}

export interface FavoriteGroup {
  id: number;
  userId: number;
  groupName: string;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: FavoriteGroupItem[];
}
