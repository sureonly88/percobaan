// Isi Panduan Pengguna (/panduan). Disusun mengikuti grup menu di ui/nav-config.ts.
// Saat fitur berubah, perbarui bagian yang sesuai di sini.

export type GuideRole = "admin" | "supervisor" | "kasir";

export const ROLE_NAMES: Record<GuideRole, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  kasir: "Kasir",
};

export interface GuideFeature {
  id: string;
  title: string;
  icon?: string;
  /** Halaman aplikasi terkait; tombol "Buka halaman" hanya muncul bila role boleh mengakses. */
  href?: string;
  roles: GuideRole[];
  summary: string;
  steps?: string[];
  notes?: string[];
}

export interface GuideSection {
  id: string;
  title: string;
  icon: string;
  intro?: string;
  features: GuideFeature[];
}

const ALL: GuideRole[] = ["admin", "supervisor", "kasir"];
const ADMIN_SPV: GuideRole[] = ["admin", "supervisor"];

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "memulai",
    title: "Memulai",
    icon: "rocket_launch",
    intro: "Hal dasar yang perlu diketahui semua pengguna sebelum memakai aplikasi.",
    features: [
      {
        id: "login",
        title: "Masuk ke aplikasi",
        icon: "login",
        roles: ALL,
        summary: "Setiap pengguna masuk memakai username dan password yang diberikan admin atau didapat lewat pendaftaran agen.",
        steps: [
          "Buka alamat aplikasi, halaman Login akan tampil.",
          "Isi Username dan Password, lalu tekan Enter atau tombol Masuk.",
          "Setelah berhasil, Anda diarahkan ke Dashboard. Menu yang tampil menyesuaikan peran Anda.",
          "Untuk keluar, tekan ikon keluar (merah) di pojok kanan atas atau tombol Keluar di bagian bawah menu samping.",
        ],
        notes: [
          "Salah password 5 kali berturut-turut akan mengunci percobaan login selama 15 menit.",
          "Sesi login berlaku 8 jam. Setelah itu Anda perlu masuk kembali.",
          "Akun yang masih menunggu persetujuan, ditolak, atau dinonaktifkan tidak bisa masuk.",
        ],
      },
      {
        id: "peran",
        title: "Peran pengguna",
        icon: "badge",
        roles: ALL,
        summary: "Hak akses menu ditentukan oleh peran. Menu yang tidak boleh diakses otomatis disembunyikan.",
        steps: [
          "Kasir — melayani pembayaran di loket, mencetak struk, menutup kasir, dan melihat laporan transaksinya.",
          "Supervisor — memverifikasi setoran kasir, menangani transaksi bermasalah (advice, review, pembatalan), dan memantau laporan.",
          "Admin — seluruh fitur, termasuk pengelolaan loket, saldo, pengguna, keuangan, dan pengaturan sistem.",
        ],
      },
      {
        id: "navigasi",
        title: "Navigasi menu",
        icon: "menu",
        roles: ALL,
        summary: "Menu dikelompokkan menurut fungsi: Operasional, Kasir & Setoran, Penyelesaian Transaksi, Laporan, Monitoring, Keuangan, Loket & Saldo, dan Administrasi.",
        steps: [
          "Di layar lebar, menu tampil di bar atas. Klik nama grup untuk membuka daftar menunya.",
          "Di layar lebih kecil (laptop kecil, tablet, ponsel), tekan ikon ☰ di kiri atas untuk membuka menu samping.",
          "Menu samping bisa ditutup dengan tombol ×, mengetuk area gelap di luar menu, atau menekan tombol Esc.",
        ],
      },
      {
        id: "saldo-header",
        title: "Saldo tersedia dan saldo tertahan",
        icon: "account_balance_wallet",
        roles: ALL,
        summary: "Di bagian atas halaman tampil nama loket, saldo yang bisa dipakai untuk transaksi baru, dan — bila ada — saldo yang sedang tertahan.",
        steps: [
          "Angka hijau adalah saldo tersedia. Angka merah berarti saldo di bawah Rp 100.000; segera lakukan top-up.",
          "Tulisan “Tertahan Rp …” (oranye) adalah saldo yang ditahan untuk transaksi yang belum mendapat kepastian dari provider.",
          "Arahkan kursor ke angka tertahan untuk melihat jumlah transaksinya.",
        ],
        notes: [
          "Saldo tertahan kembali otomatis bila provider memastikan pembayaran gagal, dan menjadi potongan final bila pembayaran sukses.",
        ],
      },
    ],
  },
  {
    id: "konsep",
    title: "Konsep Penting",
    icon: "lightbulb",
    intro: "Istilah status transaksi dan aturan saldo yang dipakai di banyak menu.",
    features: [
      {
        id: "status-transaksi",
        title: "Arti status transaksi",
        icon: "label",
        roles: ALL,
        summary: "Setiap tagihan yang dibayar punya status yang menunjukkan posisinya.",
        steps: [
          "SUCCESS — pembayaran berhasil dan tercatat di provider.",
          "FAILED — pembayaran gagal; saldo loket dikembalikan.",
          "PENDING — sedang diproses. Bila terlalu lama, akan muncul di menu Transaksi Tergantung.",
          "PENDING ADVICE — provider belum memberi jawaban (mis. timeout). Status dicek ulang lewat menu Advice.",
          "PENDING REVIEW — advice berkali-kali tetap tanpa jawaban; menunggu keputusan admin di menu Review Transaksi.",
          "VOID — transaksi sukses yang dibatalkan lewat menu Pembatalan Transaksi.",
        ],
      },
      {
        id: "saldo-ditahan",
        title: "Bagaimana saldo dipotong",
        icon: "lock_clock",
        roles: ALL,
        summary: "Saldo loket dipotong (ditahan) tepat sebelum tagihan dikirim ke provider, sehingga saldo tidak bisa minus walau banyak pembayaran berjalan bersamaan.",
        steps: [
          "Bila saldo tidak cukup, pembayaran ditolak sebelum dikirim ke provider.",
          "Bila provider sukses, potongan menjadi final.",
          "Bila provider menolak dengan jelas, saldo langsung dikembalikan.",
          "Bila provider tidak menjawab (timeout/gangguan), saldo tetap ditahan sampai statusnya pasti.",
        ],
        notes: [
          "Saat transaksi menunggu konfirmasi provider, JANGAN menagih ulang pelanggan sebelum statusnya jelas — pembayaran pertama mungkin sudah masuk.",
        ],
      },
    ],
  },
  {
    id: "operasional",
    title: "Operasional",
    icon: "storefront",
    intro: "Pekerjaan harian di loket: melayani pembayaran, payment link, cetak ulang struk, dan notifikasi.",
    features: [
      {
        id: "dashboard",
        title: "Dashboard",
        icon: "dashboard",
        href: "/",
        roles: ALL,
        summary: "Ringkasan nilai transaksi bulan ini per produk, total setahun, ringkasan hari ini, dan transaksi 7 hari terakhir. Kasir hanya melihat data loketnya sendiri.",
        steps: [
          "Mode Overview menampilkan kartu per produk (PDAM, PLN, BPJS, Telkom, Pulsa, Paket Data, PDAM Lunasin) dengan persentase naik/turun, Distribusi Produk, Ringkasan Hari Ini, dan Ringkasan Transaksi Terakhir.",
          "Tekan Analytics untuk melihat Tren Bulanan Per Produk, Heatmap Transaksi, Ranking Performa Loket, dan Perbandingan Periode.",
        ],
      },
      {
        id: "multi-payment",
        title: "Multi-Payment (pembayaran di loket)",
        icon: "receipt_long",
        href: "/pembayaran",
        roles: ["admin", "kasir"],
        summary: "Cek tagihan berbagai layanan, kumpulkan dalam satu keranjang, lalu bayar sekaligus secara tunai dan cetak struk.",
        steps: [
          "Di “Pilih Jenis Layanan untuk Inquiry”, pilih tab PDAM, PLN, BPJS, Telkom, Pulsa, Paket Data, atau PDAM Lunasin. Untuk PLN pilih Pascabayar atau Prabayar (Token) beserta nominal token; untuk Pulsa/Paket Data pilih Operator dan nominal/paket.",
          "Isi nomor pelanggan atau nomor HP, lalu tekan Cek Tagihan (atau Enter/F2).",
          "Tagihan masuk ke Keranjang Tagihan Aktif dan tetap tersimpan saat pindah tab. Ulangi untuk pelanggan/layanan lain.",
          "Periksa Ringkasan Pembayaran (Tagihan, Admin, Total Bayar). Ikon silang mengeluarkan tagihan dari keranjang.",
          "Isi Nilai Pembayaran (Tunai). Sistem menampilkan Kembalian atau Kurang.",
          "Tekan BAYAR SEKARANG / BAYAR SEMUA SEKARANG (atau F8). Panel Status Pembayaran menunjukkan proses per pelanggan.",
          "Di jendela hasil, tekan Cetak Struk, lalu Transaksi Baru (bila semua berhasil) atau Kembali.",
        ],
        notes: [
          "Tombol bayar baru aktif bila uang tunai minimal sama dengan Total Bayar dan akun sudah terhubung ke loket.",
          "Bila saldo loket tidak cukup, pembayaran ditolak dengan pesan “Saldo loket tidak mencukupi”.",
          "Bila muncul “Menunggu konfirmasi … saldo ditahan, jangan tagih ulang”: provider belum menjawab. Jangan menagih ulang pelanggan; status diselesaikan lewat Advice.",
          "Tagihan yang gagal tetap tinggal di keranjang agar bisa dicoba lagi.",
          "Fitur tambahan: Simpan sbg Grup (simpan daftar pelanggan PDAM untuk inquiry sekaligus), Buat Payment Link dari hasil inquiry, dan kotak Cetak Ulang Struk (F4).",
          "Pintasan: F1 bantuan, F2 cek tagihan, F3 pindah tab, F4 cetak ulang, F8 bayar, Alt+I kolom ID pelanggan, Alt+B kolom nominal bayar, Ctrl+Del kosongkan keranjang, Esc tutup jendela.",
        ],
      },
      {
        id: "versi-mobile",
        title: "Versi mobile (agen keliling)",
        icon: "smartphone",
        href: "/m",
        roles: ["admin", "kasir"],
        summary: "Tampilan khusus HP untuk menerima pembayaran di lapangan. Saat dibuka dari HP, aplikasi otomatis masuk ke versi mobile.",
        steps: [
          "Buka alamat aplikasi dari browser HP lalu login. Untuk memasang ikon di layar utama: menu Akun → Pasang aplikasi (atau menu browser → Tambahkan ke Layar Utama).",
          "Tekan Bayar, pilih produk (PDAM, Token PLN, PLN Pasca, BPJS, Telkom, Pulsa, Paket Data, PDAM daerah lain).",
          "Isi ID pelanggan atau tekan ikon barcode untuk memindai lembar tagihan (Chrome Android), lalu tekan Cek tagihan.",
          "Periksa nama dan rincian, isi uang diterima dan nomor WhatsApp pelanggan bila perlu, lalu tekan Bayar dan konfirmasi.",
          "Setelah lunas, kirim struk lewat WhatsApp, bagikan sebagai gambar, atau unduh. Token PLN tampil besar dan bisa disalin.",
        ],
        notes: [
          "Pembayaran hanya bisa diproses saat online; banner merah muncul bila koneksi terputus.",
          "Bila muncul \"Status belum pasti\", tekan Cek ulang hasil — aman dan tidak membayar dua kali. Jangan mengulang transaksi baru untuk pelanggan yang sama.",
          "Tagihan berstatus Diproses tidak dimasukkan ke struk; saldo ditahan sampai provider memberi kepastian.",
          "Menu Riwayat menampilkan transaksi loket Anda per hari dengan filter periode, status, dan pencarian ID/nama pelanggan. Buka satu transaksi untuk melihat status terbaru, menyalin token PLN, atau mengirim ulang struk ke WhatsApp.",
          "Menu Laporan menampilkan laporan milik Anda sendiri: uang tunai yang harus disetor hari itu (sama dengan layar Tutup Kasir), jumlah transaksi lunas/diproses/gagal, rincian per produk, dan tombol kirim laporan ke WhatsApp. Transaksi yang masih diproses belum dihitung dalam setoran.",
          "Menu Akun berisi versi mobile dari Top-up saldo (pilih nominal lalu bayar lewat Midtrans; status diperbarui otomatis), Tutup kasir (hitung lembar uang per pecahan, cocokkan kas, simpan draft atau ajukan closing, ajukan reopen), Pengaturan akun (ubah nama dan password), dan Panduan ini.",
          "Cetak berita acara tutup kasir, laporan setoran harian, pengaturan printer struk, dan pengaturan fitur sistem hanya tersedia di versi desktop.",
          "Pilih Akun → Buka versi desktop untuk kembali ke tampilan penuh.",
        ],
      },
      {
        id: "payment-link",
        title: "Payment Link",
        icon: "link",
        href: "/payment-links",
        roles: ALL,
        summary: "Memantau invoice online yang dibuat dari hasil cek tagihan, sehingga pelanggan bisa membayar sendiri secara online dan mendapat struk digital.",
        steps: [
          "Untuk membuat link: tekan Cek Tagihan Kasir, lakukan cek tagihan, lalu tekan Buat Payment Link dari Hasil Inquiry. Isi No. WhatsApp dan masa berlaku (bawaan 24 jam), tekan Generate Link, lalu Salin link.",
          "Di Daftar Invoice, cari invoice/pelanggan/HP/loket atau saring status.",
          "Tekan Detail untuk melihat item tagihan, timeline, dan tombol Buka Invoice, Buka Struk, Riwayat, atau Cancel Invoice.",
        ],
        notes: [
          "Cancel Invoice hanya untuk invoice yang belum dibayar (UNPAID / PAYMENT_PENDING).",
          "Tombol Refund & Dispute hanya untuk admin dan supervisor.",
          "Bila fitur dimatikan di Pengaturan, halaman menampilkan “Payment Link Nonaktif”.",
        ],
      },
      {
        id: "cetak-ulang",
        title: "Cetak Ulang Struk",
        icon: "print",
        href: "/cetak-ulang",
        roles: ALL,
        summary: "Mencetak ulang struk transaksi sukses, satu per satu atau banyak sekaligus.",
        steps: [
          "Isi Tanggal Mulai dan Tanggal Akhir, pilih Provider (admin/supervisor juga bisa memilih Loket).",
          "Bila perlu isi ID Pelanggan atau Cari Nama/Kode, lalu tekan Cari.",
          "Tekan Cetak pada baris transaksi, atau centang beberapa baris lalu tekan Cetak Pilihan.",
        ],
        notes: [
          "Struk cetak ulang diberi tanda “COPY — BUKAN STRUK ASLI” dan setiap cetak ulang tercatat.",
          "Kasir hanya melihat transaksi loketnya sendiri.",
        ],
      },
      {
        id: "notifikasi",
        title: "Notifikasi",
        icon: "notifications",
        href: "/notifikasi",
        roles: ALL,
        summary: "Pusat pemberitahuan transaksi, saldo, sistem, dan pengumuman.",
        steps: [
          "Saring dengan Kategori, Severity, dan Status (Semua / Belum Dibaca / Sudah Dibaca), atau cari notifikasi.",
          "Klik notifikasi untuk membacanya; tekan Lihat detail untuk menuju halaman terkait.",
          "Tekan Tandai Semua Dibaca untuk membersihkan tanda belum dibaca.",
          "Admin: tekan Buat Pengumuman, isi Judul, Isi Pesan, Tipe, Kirim Ke, dan Link Terkait (opsional), lalu Kirim Pengumuman.",
        ],
      },
    ],
  },
  {
    id: "kasir-setoran",
    title: "Kasir & Setoran",
    icon: "point_of_sale",
    intro: "Alur akhir hari: kasir menutup loket dan menghitung uang, lalu supervisor/admin memverifikasi setoran.",
    features: [
      {
        id: "tutup-kasir",
        title: "Tutup Kasir Harian",
        icon: "point_of_sale",
        href: "/tutup-kasir",
        roles: ALL,
        summary: "Mencocokkan rekap transaksi sistem dengan uang fisik di laci sebelum disetor.",
        steps: [
          "Pilih Tanggal Closing (admin/supervisor bisa memilih Kasir), lalu Terapkan Filter.",
          "Periksa kartu Permintaan Sukses, Item Transaksi, Total Tagihan, Total Admin, dan Kas Sistem.",
          "Di Form Tutup Kasir isi Modal Awal Kas, Uang Lainnya / Koin, dan jumlah lembar per pecahan di Hitung Pecahan Uang.",
          "Isi Kas Ditahan untuk Besok; Setoran ke Admin dihitung otomatis.",
          "Periksa Ringkasan Pencocokan Kas (Kas Seharusnya, Kas Fisik, Selisih). Bila ada selisih, isi Catatan Selisih dan Alasan Selisih.",
          "Tekan Simpan Draft, lalu Ajukan Closing. Cetak dengan Cetak BA atau Print Setoran Harian.",
        ],
        notes: [
          "Setelah diajukan, data terkunci sampai diverifikasi. Bila ditolak, perbaiki lalu Ajukan Ulang Closing.",
          "Setelah menutup kasir, pembayaran baru untuk hari itu tidak bisa diproses. Closing yang sudah terverifikasi hanya bisa dibuka lewat Ajukan Reopen.",
        ],
      },
      {
        id: "verifikasi-kasir",
        title: "Verifikasi Kasir",
        icon: "verified",
        href: "/verifikasi-kasir",
        roles: ADMIN_SPV,
        summary: "Memeriksa closing yang diajukan kasir: menerima setoran, menolak, atau membuka kembali closing.",
        steps: [
          "Pilih Tanggal dan Status (Menunggu Verifikasi / Terverifikasi / Ditolak / Draft), lalu Terapkan Filter.",
          "Bandingkan Kas Sistem, Kas Fisik, Setoran, dan Selisih di Daftar Closing.",
          "Tekan Terima, isi Nominal Diterima Admin, lalu Konfirmasi Terima — atau tekan Tolak, isi catatan, lalu Konfirmasi Tolak.",
          "Admin: untuk closing terverifikasi atau yang meminta reopen, tekan Buka Kembali / Setujui Reopen.",
        ],
      },
    ],
  },
  {
    id: "penyelesaian",
    title: "Penyelesaian Transaksi",
    icon: "build_circle",
    intro:
      "Menu untuk transaksi bermasalah, diurutkan dari penanganan paling ringan ke paling berat: Advice → Transaksi Tergantung → Review → Pembatalan.",
    features: [
      {
        id: "advice-pdam",
        title: "Advice PDAM",
        icon: "water_drop",
        href: "/advice-pdam",
        roles: ADMIN_SPV,
        summary: "Mengecek ulang ke server PDAM transaksi yang timeout atau belum terkonfirmasi, untuk memastikan tagihan benar-benar lunas.",
        steps: [
          "Ringkasan di atas menampilkan jumlah transaksi pending, pelanggan, dan total nominal.",
          "Saring lewat kolom pencarian nomor/nama pelanggan dan tanggal (Hapus filter untuk mengosongkan).",
          "Tekan Advice pada baris pelanggan, tunggu tulisan Proses... selesai.",
          "Baca hasilnya: “x tagihan selesai”, “Belum ada data di server PDAM”, atau pesan gagal. Tekan Refresh untuk memuat ulang.",
        ],
        notes: [
          "Advice memproses semua transaksi pending pelanggan tersebut sekaligus. Bila data belum ada di PDAM, status tetap pending — coba lagi beberapa saat kemudian.",
          "Setelah 3 kali advice tanpa data dari PDAM, transaksi langsung diteruskan ke menu Review Transaksi.",
          "Tagihan dianggap lunas hanya bila periodenya cocok dengan data PDAM. Saldo loket tidak dipotong dua kali.",
          "Kasir juga bisa menjalankan advice PDAM dari halaman Multi-Payment lewat banner “transaksi PDAM menunggu Advice” → Lihat & Proses.",
        ],
      },
      {
        id: "advice-lunasin",
        title: "Advice Lunasin",
        icon: "manage_search",
        href: "/advice-lunasin",
        roles: ADMIN_SPV,
        summary: "Mengecek ulang status transaksi Lunasin (PLN, BPJS, Telkom, pulsa, dll.) yang masih pending, satu per satu atau sekaligus.",
        steps: [
          "Lihat kartu Total Pending, Total Nominal, Sudah Pernah Advice, dan Perlu Eskalasi.",
          "Cari transaksi, lalu atur Filter Advice, Produk, dan Urutkan bila perlu.",
          "Tekan Jalankan Advice pada satu transaksi, atau Advice Semua lalu Ya, Proses Semua untuk banyak transaksi. Kemajuan tampil di Progress Advice Batch.",
          "Baca Hasil advice terbaru pada kartu, lalu tekan Refresh.",
        ],
        notes: [
          "Hasil sukses atau gagal dari provider langsung mengeluarkan transaksi dari daftar. Bila gagal, saldo yang ditahan dikembalikan.",
          "Batas advice 3 kali per transaksi. Begitu batas tercapai tanpa kepastian, transaksi langsung diteruskan ke menu Review Transaksi — cek ulang selanjutnya dilakukan dari sana.",
          "Advice Semua hanya memproses transaksi yang tampil sesuai filter saat itu (maksimal 50 terbaru).",
        ],
      },
      {
        id: "transaksi-tergantung",
        title: "Transaksi Tergantung",
        icon: "pending_actions",
        href: "/pending-transaksi",
        roles: ADMIN_SPV,
        summary:
          "Daftar transaksi yang macet di status PENDING lebih lama dari batas waktu, biasanya karena proses server terhenti di tengah pembayaran.",
        steps: [
          "Pilih batas waktu di “Terhenti lebih dari”, pilih Provider bila perlu, lalu tekan Muat Ulang.",
          "Perhatikan label tiap transaksi: “Mungkin sudah ke provider” (oranye) atau “Belum ke provider” (hijau), beserta saldo yang ditahan.",
          "Promote ke Advice — pindahkan ke menu Advice untuk dicek ulang ke provider. Saldo tetap ditahan.",
          "Kirim ke Review — untuk transaksi yang mungkin sudah ke provider; keputusan diambil admin di menu Review Transaksi. Saldo tetap ditahan.",
          "Batalkan — hanya tersedia bila transaksi terbukti belum dikirim ke provider. Status menjadi FAILED.",
        ],
        notes: [
          "Transaksi yang mungkin sudah ke provider tidak bisa dibatalkan langsung oleh satu orang. Pengembalian saldonya wajib lewat Review dan disetujui user lain.",
          "Sistem otomatis memindahkan transaksi PENDING yang lebih dari 15 menit ke status PENDING ADVICE bila tugas terjadwal aktif.",
        ],
      },
      {
        id: "review-transaksi",
        title: "Review Transaksi",
        icon: "fact_check",
        href: "/review-transaksi",
        roles: ADMIN_SPV,
        summary:
          "Antrean transaksi yang statusnya di provider tidak pasti setelah batas advice tercapai (bawaan 3 kali) atau 60 menit tanpa kepastian. Saldo loket tetap ditahan sampai diputuskan.",
        steps: [
          "Buka tab Perlu Review. Setiap kartu menampilkan provider, loket, kasir, pelanggan, periode, jumlah percobaan advice, dan saldo yang ditahan.",
          "Tekan Cek Ulang Advice untuk menanyakan status sekali lagi ke provider. Bila provider akhirnya menjawab, transaksi selesai otomatis.",
          "Bila sudah memastikan lewat laporan/portal provider bahwa pembayaran masuk: tekan Konfirmasi Sukses, isi Bukti dari provider, lalu konfirmasi. Langsung berlaku.",
          "Bila provider memastikan pembayaran TIDAK masuk: tekan Nyatakan Gagal, isi bukti, lalu Ajukan Gagal.",
          "Pengajuan gagal muncul di tab Menunggu Persetujuan. User lain menekan Setujui & Kembalikan Saldo, atau Tolak (catatan wajib).",
          "Semua keputusan tercatat di tab Riwayat.",
        ],
        notes: [
          "Pengaju tidak bisa menyetujui pengajuannya sendiri.",
          "Bila advice ternyata sukses saat pengajuan gagal masih menunggu, pengajuan itu tidak bisa disetujui lagi — tolak saja.",
          "Konfirmasi sukses juga membuat jurnal keuangan dan komisi transaksi tersebut.",
        ],
      },
      {
        id: "pembatalan",
        title: "Pembatalan Transaksi",
        icon: "undo",
        href: "/pembatalan",
        roles: ADMIN_SPV,
        summary:
          "Membatalkan transaksi yang sudah SUCCESS, misalnya karena pelanggan membayar ganda dan provider sudah melakukan reversal. Transaksi tidak dihapus, melainkan berstatus VOID.",
        steps: [
          "Pengajuan dibuat dari menu Manajemen Pelanggan: tekan ikon ↶ (Ajukan pembatalan transaksi) pada transaksi.",
          "Isi Alasan pembatalan (minimal 10 karakter) dan No. referensi reversal provider bila ada, lalu tekan Ajukan.",
          "Buka menu Pembatalan Transaksi, tab Menunggu. Periksa nominal “Saldo dikembalikan” dan peringatan yang tampil.",
          "User lain (bukan pengaju) menekan Setujui Pembatalan atau Tolak (catatan wajib).",
        ],
        notes: [
          "Saat disetujui: status menjadi VOID, saldo loket dikembalikan sebesar yang benar-benar terpotong, jurnal keuangan dibalik, dan komisi yang belum dibayar dibatalkan.",
          "Transaksi yang masih PENDING/PENDING ADVICE harus diselesaikan dulu lewat Advice. Transaksi FAILED tidak perlu dibatalkan.",
          "Bila komisi sudah dibayar atau transaksi sudah masuk setoran (settlement), muncul peringatan agar disesuaikan manual.",
        ],
      },
    ],
  },
  {
    id: "laporan",
    title: "Laporan",
    icon: "analytics",
    intro: "Melihat dan mencocokkan data transaksi.",
    features: [
      {
        id: "laporan-transaksi",
        title: "Laporan Transaksi",
        icon: "analytics",
        href: "/laporan",
        roles: ALL,
        summary: "Rekap transaksi sukses PDAM & Lunasin per loket dan per kasir dalam rentang tanggal, dengan rincian, ekspor CSV, dan cetak struk.",
        steps: [
          "Di Filter Laporan isi Tanggal Mulai dan Tanggal Akhir, pilih Loket dan Jenis (Semua, PDAM, PLN, BPJS, dll.), lalu tekan Terapkan.",
          "Di Rekap Per Loket, tekan panah untuk rincian per kasir, atau Detail untuk daftar transaksinya.",
          "Klik transaksi untuk melihat rinciannya, lalu Cetak Struk bila perlu.",
          "Ekspor dengan Export CSV (rekap) atau CSV (detail).",
        ],
        notes: [
          "Kasir otomatis dikunci ke loketnya sendiri (label Terkunci). Hanya transaksi berstatus sukses yang masuk laporan.",
        ],
      },
      {
        id: "riwayat",
        title: "Riwayat Transaksi",
        icon: "history",
        href: "/riwayat",
        roles: ALL,
        summary: "Melihat riwayat pembayaran seorang pelanggan dalam bentuk timeline dan memantau transaksi multi-payment terbaru.",
        steps: [
          "Di Cari Pelanggan isi ID Pelanggan (opsional tanggal dan status), lalu tekan Cari Riwayat.",
          "Tekan Lihat Detail pada item untuk menyalin kode transaksi atau Cetak Ulang Struk.",
          "Di Riwayat Multi-Payment Terbaru, cari kode/loket/kasir dan saring status/tanggal; tekan Lihat Detail atau Halaman Penuh.",
          "Bila item masih pending, jalankan Advice PDAM atau Jalankan Advice Item Lunasin dari jendela detail.",
        ],
      },
      {
        id: "rekonsiliasi",
        title: "Rekonsiliasi Data",
        icon: "table_view",
        href: "/rekonsiliasi",
        roles: ADMIN_SPV,
        summary: "Mencocokkan transaksi sukses di aplikasi dengan file Excel dari provider, lalu menindaklanjuti selisihnya.",
        steps: [
          "Pilih tab PDAM Native atau Lunasin, isi tanggal dan loket, lalu Terapkan Filter. Tekan Excel untuk mengunduh data aplikasi.",
          "Admin: di Import Excel Provider pilih file .xlsx/.xls, lalu Import File Provider.",
          "Pilih hasil impor di Data Provider Terimport, lalu tekan Batch.",
          "Buka batch untuk melihat Exception Queue (selisih). Admin menekan Resolve atau Ignore disertai catatan.",
        ],
        notes: [
          "File impor wajib memiliki kolom TOTAL_PROVIDER dan salah satu dari KODE_TRANSAKSI atau ID_PELANGGAN.",
          "Jenis selisih: SELISIH_NOMINAL, TIDAK_ADA_DI_PROVIDER, TIDAK_ADA_DI_INTERNAL. Supervisor hanya dapat melihat.",
        ],
      },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring",
    icon: "monitor_heart",
    intro: "Memantau kondisi transaksi, risiko operasional, dan koneksi ke provider.",
    features: [
      {
        id: "monitoring-transaksi",
        title: "Monitoring Transaksi",
        icon: "monitor_heart",
        href: "/monitoring",
        roles: ADMIN_SPV,
        summary: "Memantau status semua permintaan pembayaran secara real-time, termasuk transaksi gantung, serta tab Monitoring Inquiry untuk cek tagihan.",
        steps: [
          "Baca indikator Success Rate, Rata-rata Durasi, Top Error Code, Total Retry, serta grafik tren dan kategori error.",
          "Saring dengan tab status (Semua / Pending / Gantung / Sukses / Sebagian / Gagal), kategori error, provider, user/kasir, dan tanggal.",
          "Klik baris untuk melihat Timeline Event dan log respons; tekan Detail untuk halaman lengkap.",
          "Ekspor dengan JSON atau CSV; atur Auto-refresh bila perlu.",
        ],
        notes: [
          "Transaksi disebut Gantung bila pending lebih dari 5 menit.",
          "Untuk transaksi gantung, tekan Buka Transaksi Tergantung. Tombol Resolve sebagai Gagal hanya tampil untuk admin dan hanya bisa dipakai untuk permintaan yang belum pernah dikirim ke provider; selebihnya diselesaikan lewat Advice, Transaksi Tergantung, atau Review Transaksi agar saldo ikut disesuaikan.",
        ],
      },
      {
        id: "risiko",
        title: "Risiko Transaksi",
        icon: "crisis_alert",
        href: "/monitoring/risiko",
        roles: ADMIN_SPV,
        summary: "Satu layar untuk semua risiko operasional: pending lama, payment link bermasalah, provider tidak sehat, loket/saldo berisiko, settlement tertahan, dan job otomatis yang gagal.",
        steps: [
          "Lihat Risk Score (Normal / Waspada / Tinggi / Kritis) dan kartu ringkasan.",
          "Di Prioritas Tindakan, saring tingkat risiko lalu klik item untuk langsung menuju halaman penanganannya.",
          "Gunakan Aksi Cepat: Resolve Pending, Cek Payment Link, Provider Health, Rekonsiliasi, atau Settlement.",
        ],
        notes: ["Halaman diperbarui otomatis tiap 30 detik. Penanganan dilakukan di halaman tujuan masing-masing."],
      },
      {
        id: "health-provider",
        title: "Health Provider",
        icon: "health_metrics",
        href: "/monitoring/provider-health",
        roles: ADMIN_SPV,
        summary: "Kesehatan koneksi ke PDAM dan Lunasin selama 24 jam terakhir serta status proses otomatis di latar belakang.",
        steps: [
          "Di kartu provider baca status, Success rate (24h), Total panggilan, Avg/p95 latency, Gagal beruntun, dan Sukses terakhir.",
          "Di Background Jobs periksa status, waktu terakhir jalan, durasi, dan ringkasan tiap job.",
        ],
        notes: [
          "Status CLOSED = normal, HALF_OPEN = sedang diuji pulih, OPEN = koneksi ke provider diputus sementara. Selama OPEN, pembayaran dan advice ke provider tersebut ditolak sampai masa jeda selesai.",
        ],
      },
    ],
  },
  {
    id: "keuangan",
    title: "Keuangan & Akuntansi",
    icon: "account_balance",
    intro: "Ringkasan keuangan, margin, komisi, setoran loket, dan pembukuan. Jurnal dicatat otomatis dari transaksi.",
    features: [
      {
        id: "ringkasan-keuangan",
        title: "Ringkasan Keuangan",
        icon: "account_balance",
        href: "/keuangan",
        roles: ADMIN_SPV,
        summary: "Dasbor keuangan: Total Transaksi, Omzet Kotor, Pendapatan Admin, Batch Settlement Draft, margin per provider, jurnal terbaru, dan settlement yang menunggu persetujuan.",
        notes: ["Pencatatan jurnal berjalan otomatis untuk transaksi sejak modul keuangan aktif; data lama tidak ikut tercatat."],
      },
      {
        id: "margin",
        title: "Margin & Profit",
        icon: "trending_up",
        href: "/keuangan/margin",
        roles: ADMIN_SPV,
        summary: "Laporan omzet dan pendapatan admin yang bisa dikelompokkan per Provider, Service Type, Produk, atau Loket.",
        steps: ["Isi Dari, Sampai, (opsional) Loket dan Provider, pilih Group By, lalu tekan Tampilkan."],
      },
      {
        id: "komisi",
        title: "Pengaturan Komisi",
        icon: "redeem",
        href: "/keuangan/komisi",
        roles: ADMIN_SPV,
        summary: "Mengatur komisi per transaksi untuk kasir dan loket. Admin dapat mengubah, supervisor hanya melihat.",
        steps: [
          "Tekan Aturan Baru, isi Nama Aturan, Target (Kasir/Loket), Cakupan (Global/Per Loket/Per Provider/Loket + Provider), Tipe (Persentase/Flat), dan Basis Hitung (Biaya Admin/Pokok Tagihan/Total Bayar).",
          "Opsional: Min/Max Komisi, Priority, masa berlaku, dan catatan. Centang Aturan aktif, lalu simpan.",
          "Tekan Edit untuk mengubah atau Nonaktifkan untuk menghentikan aturan.",
        ],
        notes: [
          "Bila beberapa aturan cocok, yang dipakai adalah cakupan paling spesifik; bila sama, Priority terbesar menang.",
          "Menonaktifkan aturan tidak menghapus komisi yang sudah tercatat.",
        ],
      },
      {
        id: "laporan-komisi",
        title: "Laporan Komisi",
        icon: "request_quote",
        href: "/keuangan/komisi/laporan",
        roles: ADMIN_SPV,
        summary: "Rekap komisi kasir dan loket per periode, sebagai dasar insentif kasir dan bagi hasil loket.",
        steps: [
          "Isi tanggal, Loket, Provider, Target, dan Status (Accrued / Paid / Void); centang detail per transaksi bila perlu.",
          "Lihat rekap Per Penerima, Per Loket, Per Provider, lalu Export CSV.",
        ],
        notes: ["Admin dapat menjalankan Backfill Historis (maks. 90 hari per proses); transaksi yang sudah tercatat dilewati sehingga aman diulang."],
      },
      {
        id: "settlement",
        title: "Settlement Loket",
        icon: "handshake",
        href: "/settlement",
        roles: ADMIN_SPV,
        summary: "Batch setoran harian per loket beserta persetujuan dan pembayarannya. Admin memproses, supervisor melihat.",
        steps: [
          "Di Generate Batch Harian isi Tanggal dan (opsional) Loket, lalu tekan Generate.",
          "Saring dengan Status / Loket / tanggal, lalu tekan Detail pada batch.",
          "Batch DRAFT: tekan Approve Batch. Setelah dana ditransfer, isi Referensi pembayaran dan Catatan, lalu Tandai Sudah Dibayar.",
        ],
        notes: [
          "Urutan status: DRAFT → APPROVED → PAID. Net Payable = Total Gross − Total Admin Fee (admin fee menjadi hak loket).",
          "Satu transaksi tidak bisa masuk dua batch; batch juga dibuat otomatis setiap hari.",
        ],
      },
      {
        id: "jurnal",
        title: "Jurnal Umum, Buku Besar, Neraca Saldo",
        icon: "menu_book",
        href: "/keuangan/jurnal",
        roles: ADMIN_SPV,
        summary: "Pembukuan otomatis: Jurnal Umum berisi semua jurnal debit/kredit, Buku Besar menampilkan mutasi satu akun dengan saldo berjalan, Neraca Saldo menampilkan saldo semua akun.",
        steps: [
          "Jurnal Umum: saring Dari, Sampai, Sumber, atau cari nomor/referensi, lalu tekan Detail untuk melihat baris per akun.",
          "Buku Besar: pilih Akun, isi tanggal (dan Loket), lalu Tampilkan.",
          "Neraca Saldo: isi tanggal lalu Tampilkan. Tanda BALANCED ✓ berarti pencatatan seimbang.",
        ],
        notes: [
          "Jurnal tidak bisa diedit atau dihapus. Koreksi (mis. pembatalan transaksi) dicatat sebagai jurnal pembalik bertanda reversal.",
          "Bila Neraca Saldo TIDAK SEIMBANG, periksa jurnal terkait di Jurnal Umum.",
        ],
      },
      {
        id: "akun",
        title: "Chart of Accounts",
        icon: "format_list_numbered",
        href: "/keuangan/akun",
        roles: ["admin"],
        summary: "Daftar akun pembukuan.",
        steps: ["Tekan + Tambah Akun, isi Kode, Nama Akun, Tipe, Parent dan Deskripsi (opsional), lalu simpan. Gunakan Nonaktifkan/Aktifkan untuk mengubah status."],
        notes: ["Akun bawaan sistem (label system) tidak bisa dinonaktifkan dan akun tidak bisa dihapus."],
      },
    ],
  },
  {
    id: "loket-saldo",
    title: "Loket & Saldo",
    icon: "store",
    intro: "Pengelolaan loket, anggota (kasir), dan saldo loket.",
    features: [
      {
        id: "manajemen-loket",
        title: "Manajemen Loket",
        icon: "store",
        href: "/loket",
        roles: ADMIN_SPV,
        summary: "Daftar loket beserta performanya. Admin dapat menambah dan mengubah, supervisor hanya melihat.",
        steps: [
          "Cari loket atau saring status, lalu tekan ikon detail untuk melihat transaksi Bulan Ini, Bulan Lalu, dan Total.",
          "Tekan Tambah Loket, isi Kode Loket, Nama, Alamat, Jenis Loket, Maks Tagihan PDAM, dan Dikelola oleh, lalu Tambah/Simpan.",
        ],
        notes: [
          "Saldo tidak bisa diubah di sini — gunakan Update Saldo Loket. Biaya admin diubah di menu Biaya Admin.",
          "Maks Tagihan PDAM membatasi jumlah bulan tunggakan per transaksi; tekan Hapus batas untuk tanpa batas.",
        ],
      },
      {
        id: "anggota-loket",
        title: "Anggota Loket",
        icon: "manage_accounts",
        href: "/loket/members",
        roles: ALL,
        summary: "Mengelola akun kasir di sebuah loket. Kasir hanya melihat loketnya sendiri dan bisa mengelola bila berstatus Admin Loket.",
        steps: [
          "(Admin/Supervisor) pilih loket di Pilih Loket.",
          "Tekan Tambah User, isi Username, Nama Lengkap, Email (opsional), dan Password, lalu Buat User.",
          "Tekan ikon edit untuk mengubah atau Reset Password; Nonaktifkan/Aktifkan untuk menghentikan atau mengaktifkan akun.",
        ],
        notes: ["User baru otomatis menjadi Kasir di loket tersebut."],
      },
      {
        id: "update-saldo",
        title: "Update Saldo Loket",
        icon: "account_balance_wallet",
        href: "/saldo",
        roles: ADMIN_SPV,
        summary: "Menambah atau mengurangi saldo loket secara manual (mis. setelah transfer bank).",
        steps: [
          "Pilih loket di Daftar Loket.",
          "Pilih Top-up atau Kurangi, isi Nominal dan Keterangan (contoh: Top-up via transfer BCA), lalu konfirmasi.",
        ],
        notes: [
          "Hanya admin yang dapat mengubah saldo; supervisor melihat daftar saldo dan riwayat dalam mode baca-saja. Kasir menambah saldo lewat Top-up Saldo.",
          "Keterangan wajib diisi; pengurangan ditolak bila saldo tidak cukup.",
          "Setiap perubahan tercatat di Riwayat Update Saldo, ledger mutasi saldo, dan jurnal keuangan.",
        ],
      },
      {
        id: "topup",
        title: "Top-up Saldo",
        icon: "add_card",
        href: "/topup",
        roles: ALL,
        summary: "Menambah saldo loket sendiri lewat pembayaran online (VA bank, QRIS, e-wallet). Supervisor hanya melihat riwayat.",
        steps: [
          "Pilih nominal (Rp 50.000 s.d. Rp 5.000.000) dan periksa Total Bayar.",
          "Tekan Bayar Sekarang dan selesaikan pembayaran.",
          "Bila jendela pembayaran tertutup, tekan Lanjutkan Pembayaran di Riwayat Top-up.",
        ],
        notes: ["Tagihan top-up kedaluwarsa dalam 24 jam. Saldo bertambah otomatis saat status menjadi Berhasil."],
      },
    ],
  },
  {
    id: "administrasi",
    title: "Administrasi",
    icon: "admin_panel_settings",
    intro: "Data pelanggan, biaya admin, pengguna, mitra API, pengaturan, dan alat sistem.",
    features: [
      {
        id: "pelanggan",
        title: "Manajemen Pelanggan",
        icon: "group",
        href: "/pelanggan",
        roles: ALL,
        summary: "Data transaksi pelanggan per layanan (PDAM, PLN, BPJS, Telkom, Pulsa, Paket Data, PDAM Lunasin). Kasir hanya melihat data loketnya.",
        steps: [
          "Pilih tab layanan, lalu cari dan saring Golongan, Loket, atau Periode.",
          "Tekan ikon detail untuk Detail Transaksi atau Riwayat pelanggan.",
          "Admin: untuk membatalkan transaksi tekan ikon ↶, isi alasan dan referensi reversal, lalu Ajukan (lihat Pembatalan Transaksi).",
        ],
        notes: ["Transaksi tidak bisa dihapus permanen; pembatalan wajib disetujui user lain."],
      },
      {
        id: "biaya-admin",
        title: "Biaya Admin",
        icon: "payments",
        href: "/biaya-admin",
        roles: ["admin"],
        summary: "Mengatur biaya admin PDAM per loket dan tier admin PLN (Lunasin).",
        steps: [
          "Di Atur Semua Sekaligus pilih nominal lalu Terapkan Semua; atau ubah nilai di kartu satu loket lalu tekan ikon simpan.",
          "Di Admin PLN (Lunasin) pilih tier lalu Terapkan Semua.",
        ],
        notes: ["Biaya dikenakan per tagihan, mis. Rp 2.500 × 3 bulan = Rp 7.500."],
      },
      {
        id: "users",
        title: "Manajemen User",
        icon: "admin_panel_settings",
        href: "/users",
        roles: ["admin"],
        summary: "Mengelola akun pengguna, peran, dan loketnya.",
        steps: [
          "Cari user atau saring per role.",
          "Tekan Tambah User, isi Username, Nama Lengkap, Email, Role, Assign Loket, dan Password, lalu Buat User.",
          "Tekan Edit untuk mengubah (kosongkan password bila tidak diganti) atau Hapus untuk menghapus user.",
        ],
      },
      {
        id: "registrasi-agen",
        title: "Pendaftaran Agen",
        icon: "how_to_reg",
        href: "/users/registrations",
        roles: ["admin"],
        summary: "Menyetujui atau menolak calon agen yang mendaftar lewat halaman publik.",
        steps: [
          "Saring status (Menunggu / Disetujui / Ditolak) atau cari pendaftar, lalu buka Detail Pendaftaran.",
          "Tekan Setujui & Buat Loket, atau isi Catatan Penolakan lalu Tolak.",
        ],
        notes: ["Saat disetujui, sistem membuat loket baru (saldo 0, biaya admin Rp 2.500) dan menjadikan pendaftar Admin Loket."],
      },
      {
        id: "api-provider",
        title: "API Provider & Dokumentasi API",
        icon: "api",
        href: "/provider",
        roles: ["admin"],
        summary: "Mengelola mitra eksternal yang memakai layanan PDAM lewat API, beserta log transaksinya. Dokumentasi teknis untuk mitra ada di menu Dokumentasi API.",
        steps: [
          "Tekan Tambah Provider, isi Nama, Kode (huruf besar), Status, User (Perwakilan), Admin Fee, rate limit, IP Whitelist, dan Webhook, lalu Buat Provider.",
          "Salin API Key dan API Secret, lalu tekan Saya Sudah Menyimpan.",
          "Tab Transaksi menampilkan log inquiry/payment mitra.",
        ],
        notes: [
          "API Secret hanya ditampilkan sekali. Regenerate Key membuat kunci lama tidak berlaku.",
          "Saldo deposit mitra diambil dari saldo loket perwakilannya.",
        ],
      },
      {
        id: "pengaturan",
        title: "Pengaturan",
        icon: "settings",
        href: "/pengaturan",
        roles: ALL,
        summary: "Profil pribadi, tampilan, fitur publik, dan printer struk.",
        steps: [
          "Tab Profil: ubah Nama Lengkap atau Ubah Password, lalu Simpan Profil.",
          "Tab Tampilan: pilih Light Mode, Dark Mode, atau Ikuti Sistem.",
          "Tab Fitur (admin): aktifkan/nonaktifkan Payment Link dan Self-Service Publik, lalu Simpan Fitur.",
          "Tab Printer: isi URL Bridge, pilih printer, atur Mode Cetak, Lebar Kolom, dan Feed Lines, Simpan Konfigurasi, lalu Test Print. Template struk diubah di Template Struk.",
        ],
        notes: ["Pengaturan printer tersimpan per komputer kasir dan memerlukan program Pedami Print Bridge."],
      },
      {
        id: "import-transaksi",
        title: "Import Transaksi",
        icon: "move_to_inbox",
        href: "/import-transaksi",
        roles: ["admin"],
        summary: "Memindahkan data transaksi historis dari aplikasi Pedami Payment lama.",
        steps: [
          "Isi URL Aplikasi Pedami-Payment, Report Token, tanggal, dan Jenis Transaksi (opsional kode loket).",
          "Tekan Cek Koneksi & Hitung, lalu Mulai Import dan konfirmasi. Hasil tercatat di Riwayat Import.",
        ],
        notes: ["Import aman diulang tanpa duplikasi; kode transaksi hasil import berawalan LEGACY-. Data impor tidak memengaruhi saldo loket."],
      },
      {
        id: "db-manager",
        title: "DB Manager",
        icon: "database",
        href: "/db-manage",
        roles: ["admin"],
        summary: "Melihat dan mengubah isi database secara langsung. Khusus teknisi, memerlukan password tambahan.",
        notes: [
          "Sangat berisiko: perubahan dan penghapusan tidak bisa dibatalkan dan dapat membuat saldo, jurnal, dan laporan tidak konsisten. Gunakan menu aplikasi untuk semua kebutuhan operasional.",
          "Semua aktivitas di DB Manager tercatat.",
        ],
      },
    ],
  },
  {
    id: "perangkat-publik",
    title: "Perangkat Kasir & Halaman Pelanggan",
    icon: "devices",
    intro: "Persiapan printer struk di komputer kasir dan halaman yang dipakai pelanggan tanpa login.",
    features: [
      {
        id: "print-bridge",
        title: "Menyiapkan printer struk (Print Bridge)",
        icon: "print_connect",
        href: "/pengaturan",
        roles: ["admin", "kasir"],
        summary: "Program kecil di komputer kasir (Windows) yang meneruskan struk dari aplikasi ke printer dot matrix Epson LX-310/LX-350. Dilakukan sekali per komputer, sebaiknya oleh teknisi.",
        steps: [
          "Pasang Node.js (versi 18 LTS atau lebih baru) dan salin folder print-bridge ke komputer kasir, mis. C:\\pedami\\print-bridge.",
          "Pastikan printer terpasang di Windows dan namanya sama persis dengan pengaturan bridge.",
          "Untuk kertas continuous form 9½\" × 11\"/3 (perforasi tiap 1/3), pastikan pengaturan pageLines = 22 agar setiap rekening tercetak tepat satu potongan.",
          "Jalankan gen-cert.bat sebagai administrator, lalu jalankan bridge dan buka https://localhost:6789 di browser satu kali (Advanced → Proceed).",
          "Di aplikasi buka Pengaturan → tab Printer, isi URL Bridge https://localhost:6789, Simpan, lalu Test Print.",
          "Jalankan setup.bat sebagai administrator agar bridge otomatis aktif saat komputer menyala.",
        ],
        notes: [
          "Sebelum cetak pertama, posisikan perforasi kertas tepat di awal halaman printer (tombol Load/Eject).",
          "Bila bridge mati, aplikasi memakai cetak browser dan menampilkan “Print bridge tidak terhubung — menggunakan cetak browser”.",
        ],
      },
      {
        id: "halaman-publik",
        title: "Halaman untuk pelanggan (tanpa login)",
        icon: "public",
        roles: ALL,
        summary: "Pelanggan dapat mengecek dan membayar tagihan sendiri secara online, lalu mendapat struk digital yang bisa divalidasi.",
        steps: [
          "Cek Tagihan (/cek-tagihan): pelanggan memilih layanan, mengisi nomor, lalu Buat Invoice & Bayar.",
          "Invoice online (/i/...): menampilkan rincian dan tombol Bayar Sekarang; setelah lunas tersedia Lihat Struk Digital.",
          "Struk digital (/r/...): struk dengan QR validasi dan tombol Cetak / Simpan PDF.",
          "Pendaftaran agen (/register): calon mitra mengisi data akun, pribadi, dan usaha; akun aktif setelah disetujui admin.",
        ],
        notes: ["Self-service dan payment link bisa dimatikan admin di Pengaturan → Fitur."],
      },
    ],
  },
];
