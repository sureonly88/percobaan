# Pedami Payment — catatan untuk Claude

Aplikasi loket pembayaran multi-produk (PDAM, PLN pra/pascabayar, BPJS, Telkom, pulsa) untuk kasir, supervisor, dan admin.
Komunikasi dengan pemilik proyek memakai Bahasa Indonesia.

## Stack & perintah
- Next.js 14 App Router, React 18, next-auth 4 (JWT), MySQL/MariaDB via `mysql2` (`src/lib/db.ts`), Tailwind, ikon Material Symbols.
- Node minimum **22.23.4** (patch Node2Shell / CVE-2026-111497). Dockerfile memakai `node:22.23.4-alpine`; `nixpacks.toml` tidak mengunci versi patch.
- `npm run dev` (port 3000), `npm run migrate` (menjalankan `database/migrations/*.sql`, dicatat di `schema_migrations`), `npm run check:rbac`.
- Typecheck: `./node_modules/.bin/tsc --noEmit -p .`
- **Jangan menjalankan `next dev` kedua** di folder yang sama saat server pengguna aktif di :3000 — `.next` rusak dan sesi login error. Uji lewat :3000.
- Rahasia (password admin, kunci API provider) hanya di `.env`; jangan ditulis ke file lain atau commit. Variabel baru didokumentasikan di `.env.example`.

## Provider & mock
- `PDAM_MOCK=true` / `LUNASIN_MOCK=true` memakai `src/lib/pdam-mock.ts` / `lunasin-mock.ts`. Skenario dipilih dari awalan ID pelanggan:
  - PDAM: `1111` sukses, `2222`/`3333` multi-bulan, `4444` timeout→advice sukses, `5555` timeout→advice kosong, `7777` error 406, `9999` HTTP 500→advice sukses, `9898` HTTP 500→advice kosong, `9797` timeout + konfirmasi terlambat.
  - Lunasin: `7777` error, `8888` pending, `9191` timeout→advice sukses, `9292` timeout→advice gagal. Nominal token PLN dikirim lewat `input2`.

## Aturan uang (jangan dilanggar)
- **Validasi nominal di server**: total tagihan diambil dari snapshot inquiry (`src/lib/inquiry-snapshots.ts`, tabel `inquiry_snapshots`, TTL `INQUIRY_SNAPSHOT_TTL_MINUTES`), bukan dari angka kiriman browser. Snapshot dikonsumsi saat sukses.
- **Model hold saldo** (`src/lib/transaction-balance.ts`): saldo loket didebit *sebelum* memanggil provider dan tetap ditahan selama status PENDING / PENDING_ADVICE / PENDING_REVIEW. FAILED → dilepas, SUCCESS → disesuaikan ke nominal final. Gunakan `reconcileTransactionHold` / `settleTransactionBalance`, jangan mengubah `lokets.saldo` langsung.
- Setiap mutasi saldo lewat `src/lib/saldo-mutations.ts` dan tercatat di `loket_balance_ledger` (`reference_type='TRANSACTION'`, `reference_id=transaction_code`).
- Hasil provider yang tidak pasti (timeout, jaringan, 5xx, respons rusak — `isPdamOutcomeUnknown` / `isLunasinOutcomeUnknown`) **tidak boleh dianggap gagal**: jadikan PENDING_ADVICE dengan hold tetap.
- Advice dibatasi `ADVICE_MAX_ATTEMPTS` (default 3, `src/lib/advice-policy.ts`); setelah habis → PENDING_REVIEW.
- **Maker-checker**:
  - Review transaksi (`src/lib/transaction-review.ts`, `/review-transaksi`): keputusan SUCCESS langsung berlaku; keputusan FAILED (refund) harus disetujui user lain.
  - Pembatalan transaksi sukses (`src/lib/transaction-void.ts`, `/pembatalan`): pengaju ≠ penyetuju; menghasilkan refund ledger, jurnal REVERSAL, dan komisi VOID.
  - Transaksi tergantung (`/pending-transaksi`, API `stale-pending`): "Batalkan" hanya boleh bila provider terbukti belum dihubungi (`assessProviderContact`); selain itu kirim ke review.
- Data transaksi tidak dihapus: DELETE di `/api/pelanggan` mengembalikan 410 — pakai alur pembatalan.
- `gl_journal_entries` append-only (trigger DB); koreksi dengan entri REVERSAL (`reverses_entry_id`). Audit log berantai hash (`src/lib/audit-log.ts`) — catat aksi sensitif dengan `auditLog`.
- Update saldo manual (`POST /api/saldo`) khusus admin, relatif (credit/debit), ledger tipe `MANUAL_ADJUST`.

## Hak akses & navigasi
- RBAC terpusat di `src/lib/rbac.ts` (`ROLE_PAGES`, `API_PERMISSIONS`, `canAccessPage`, `canAccessApi`, `denyIfUnauthorized`); `middleware.ts` memakai `canAccessPage`.
- Menambah halaman/API baru → daftarkan di `rbac.ts`, lalu jalankan `npm run check:rbac`. Fetch yang di UI hanya dipanggil role tertentu ditandai komentar `// rbac-check: admin, supervisor`.
- Susunan menu satu sumber: `src/ui/nav-config.ts` (dipakai `AppTopNav` dan `AppSidebar`). Di layar < xl menu tampil sebagai drawer kiri, bukan fullscreen.
- Panduan pengguna in-app: `/panduan`, kontennya di `src/app/panduan/content.ts` — perbarui saat fitur berubah.

## Cetak struk
- Dua formatter harus selalu diubah bersamaan: `print-bridge/formatter.js` (ESC/P via print-bridge di PC kasir) dan `src/lib/print-receipt.ts` (cetak dari browser).
- Kertas continuous form 9½" × 11"/3: **1 tagihan = 1 lembar = 22 baris** (`pageLines` di `print-bridge/config.json`). Baris berlebih dipangkas menurut prioritas `drop`.
- PLN Prabayar: Pesan Biller tidak dicetak; token satu baris `TOKEN PLN : xxxx-xxxx-…`.
- Cetak otomatis setelah lunas dipicu `useEffect` di `pembayaran/page.tsx`. Bila bridge gagal, cadangannya iframe tersembunyi (bukan `window.open`, yang diblokir browser tanpa klik).
- Perubahan print-bridge harus disalin manual ke setiap PC kasir lalu service-nya di-restart.

## Celah yang diketahui (belum dikerjakan)
- Halaman Pelanggan masih membolehkan admin menambah transaksi manual berstatus SUCCESS dan mengedit nominal transaksi sukses (usulan: batasi / jadikan maker-checker).
- Route advice yang sukses belum memposting jurnal GL dan komisi.
- Belum ada pengaman versi Node minimum saat start aplikasi maupun di print-bridge (`engines` print-bridge masih `>=18`).
