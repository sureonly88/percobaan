import { Pelanggan, TagihanItem } from "@/types";

export const pelangganList: Pelanggan[] = [
  {
    id: "1",
    nama: "Budi Setiawan",
    idPelanggan: "532100988712",
    periode: "Oktober 2023",
    pemakaian: 342.5,
    tarif: "R1",
    daya: "900VA",
    tagihanListrik: 485200,
    biayaAdmin: 3000,
    totalTagihan: 488200,
    status: "belum_bayar",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "2",
    nama: "Siti Rahayu",
    idPelanggan: "532100112233",
    periode: "Oktober 2023",
    pemakaian: 210.0,
    tarif: "R1",
    daya: "1300VA",
    tagihanListrik: 315000,
    biayaAdmin: 3000,
    totalTagihan: 318000,
    status: "lunas",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "3",
    nama: "Ahmad Fauzi",
    idPelanggan: "532100445566",
    periode: "Oktober 2023",
    pemakaian: 580.3,
    tarif: "R2",
    daya: "2200VA",
    tagihanListrik: 870000,
    biayaAdmin: 3000,
    totalTagihan: 873000,
    status: "terlambat",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "4",
    nama: "Dewi Lestari",
    idPelanggan: "532100778899",
    periode: "Oktober 2023",
    pemakaian: 155.8,
    tarif: "R1",
    daya: "900VA",
    tagihanListrik: 220500,
    biayaAdmin: 3000,
    totalTagihan: 223500,
    status: "belum_bayar",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "5",
    nama: "Rudi Hartono",
    idPelanggan: "532100334455",
    periode: "Oktober 2023",
    pemakaian: 425.0,
    tarif: "R1",
    daya: "1300VA",
    tagihanListrik: 612000,
    biayaAdmin: 3000,
    totalTagihan: 615000,
    status: "belum_bayar",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "6",
    nama: "Rina Wati",
    idPelanggan: "532100667788",
    periode: "Oktober 2023",
    pemakaian: 98.2,
    tarif: "R1",
    daya: "450VA",
    tagihanListrik: 125000,
    biayaAdmin: 3000,
    totalTagihan: 128000,
    status: "lunas",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "7",
    nama: "Joko Susilo",
    idPelanggan: "532100990011",
    periode: "Oktober 2023",
    pemakaian: 710.5,
    tarif: "R3",
    daya: "3500VA",
    tagihanListrik: 1150000,
    biayaAdmin: 3000,
    totalTagihan: 1153000,
    status: "terlambat",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
  {
    id: "8",
    nama: "Maya Sari",
    idPelanggan: "532100223344",
    periode: "Oktober 2023",
    pemakaian: 280.0,
    tarif: "R1",
    daya: "1300VA",
    tagihanListrik: 398000,
    biayaAdmin: 3000,
    totalTagihan: 401000,
    status: "belum_bayar",
    jenis: "pasca_bayar",
    layanan: "PLN",
  },
];

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function getStatusLabel(status: Pelanggan["status"]): string {
  switch (status) {
    case "lunas":
      return "Lunas";
    case "belum_bayar":
      return "Belum Bayar";
    case "terlambat":
      return "Terlambat";
  }
}

export function getStatusColor(status: Pelanggan["status"]): string {
  switch (status) {
    case "lunas":
      return "bg-emerald-100 text-emerald-700";
    case "belum_bayar":
      return "bg-amber-100 text-amber-700";
    case "terlambat":
      return "bg-red-100 text-red-700";
  }
}

/** Lookup database untuk multi-tagihan — simulasi pencarian pelanggan */
export const tagihanDatabase: TagihanItem[] = [
  {
    id: "t1",
    layanan: "PDAM",
    idPelanggan: "00129384812",
    nama: "Budi Santoso",
    periode: "Okt 2023",
    jumlahTagihan: 145000,
    wilayah: "Jakarta Selatan",
  },
  {
    id: "t2",
    layanan: "PLN",
    idPelanggan: "53441200921",
    nama: "Siti Aminah",
    periode: "Nov 2023",
    jumlahTagihan: 352400,
    wilayah: "Jakarta Timur",
  },
  {
    id: "t3",
    layanan: "PDAM",
    idPelanggan: "00129384845",
    nama: "Andi Wijaya",
    periode: "Nov 2023",
    jumlahTagihan: 89200,
    wilayah: "Kota Bekasi",
  },
  {
    id: "t4",
    layanan: "PLN",
    idPelanggan: "53441200555",
    nama: "Dewi Lestari",
    periode: "Nov 2023",
    jumlahTagihan: 275000,
    wilayah: "Jakarta Selatan",
  },
  {
    id: "t5",
    layanan: "PDAM",
    idPelanggan: "00129384900",
    nama: "Rudi Hartono",
    periode: "Okt 2023",
    jumlahTagihan: 112500,
    wilayah: "Jakarta Timur",
  },
  {
    id: "t6",
    layanan: "PLN",
    idPelanggan: "53441200777",
    nama: "Maya Sari",
    periode: "Nov 2023",
    jumlahTagihan: 198000,
    wilayah: "Kota Bekasi",
  },
];

export const WILAYAH_OPTIONS = [
  "Jakarta Selatan",
  "Jakarta Timur",
  "Kota Bekasi",
];

export const BIAYA_ADMIN_PER_TAGIHAN = 2500;
