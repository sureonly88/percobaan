# Dokumentasi Portal Utilitas

> Versi dokumentasi: 26 Mei 2026
> Disusun otomatis dari agentmemory

---

## 1. Gambaran Umum

Portal Utilitas adalah aplikasi web untuk pembayaran tagihan utilitas dan PPOB (Payment Point Online Bank). Mendukung pembayaran untuk:

- PDAM (tagihan air)
- PLN Postpaid & Prepaid (tagihan & token listrik)
- Pulsa
- BPJS
- Telkom
- Produk Lunasin (multi-product PPOB)

Lokasi project: /Users/yakinyakin/Coding/percobaan

---

## 2. Tech Stack

| Komponen       | Teknologi                                      |
|----------------|------------------------------------------------|
| Framework      | Next.js 14 App Router                          |
| Bahasa         | TypeScript 5.4                                 |
| Styling        | Tailwind CSS 3.4                               |
| Database       | MySQL (database: pedami_payment)               |
| ORM/Driver     | mysql2 (connection pool 30 koneksi)            |
| Auth           | NextAuth v4 (CredentialsProvider + JWT)        |
| Password Hash  | bcryptjs                                       |
| Chart/Dashboard| recharts                                       |
| Payment Gateway| Midtrans Snap (top-up saldo)                   |
| Observability  | OpenTelemetry (traces/metrics/logs via OTLP)   |
| Deployment     | Dockerfile + nixpacks.toml (Railway/Nixpacks)  |

Scripts NPM:
- dev = next dev
- build = next build
- start = next start
- migrate = node scripts/migrate.js

---

## 3. Konfigurasi Database

- Host: 127.0.0.1
- Port: 3306
- User: root
- Database: pedami_payment
- Pool: 30 koneksi

Default admin awal:
- Username: admin
- Password: Admin@1234
- Loket: Loket Utama (LKT-001)

Menjalankan migrasi:
  node --env-file=.env scripts/migrate.js (Node 20+ required)

Urutan migrasi: baseline → 20260405_payment_idempotency → ... → 20260414_loket_max_pdam_tagihan → 20260525_general_ledger → 20260525_settlement_batches → 20260525_z_fix_settlement_collation → 20260526_commission_profit_sharing

---

## 4. Autentikasi & RBAC

File: src/lib/auth.ts, src/lib/rbac.ts, middleware.ts, src/lib/api-auth.ts, src/lib/mobile-auth.ts

### 4.1 Role Pengguna

| Role       | Akses                                                           |
|------------|-----------------------------------------------------------------|
| admin      | Full access semua halaman                                       |
| supervisor | Laporan, rekonsiliasi, monitoring — hanya baca (tidak bisa edit)|
| kasir      | Pembayaran, laporan, tutup kasir, top-up                        |
| switcher   | Hanya /provider/docs                                            |

### 4.2 Mekanisme Auth

- Login: CredentialsProvider + bcrypt + rate-limit (in-memory, lockout 15 menit)
- User status pending/ditolak/nonaktif diblokir login
- Session JWT menyimpan: id, name, username, role, loketId, loketCode, loketName, isLoketAdmin
- Middleware: withAuth + canAccessPage()
- Public paths: /topup/finish, /topup/unfinish, /topup/error, /register

### 4.3 API Auth Dual Mode

- Web: NextAuth cookie
- Mobile: Bearer JWT (HS256 HMAC, access 8 jam, refresh 30 hari, secret=MOBILE_JWT_SECRET||NEXTAUTH_SECRET)
- Fungsi: getAuthToken() di src/lib/api-auth.ts

---

## 5. Database Schema

### Tabel Utama

| Tabel                   | Deskripsi                                                     |
|-------------------------|---------------------------------------------------------------|
| users                   | Pengguna (id, name, username, email, password, role, loket_id, api_token, status, catatan_tolak) |
| lokets                  | Loket pembayaran (id, nama, alamat, loket_code, is_blok, blok_message, pulsa, biaya_admin, pln_admin_tier, tipe, status, max_pdam_tagihan) |
| app_settings            | Konfigurasi key-value                                         |
| log_inquery             | Log inquiry tagihan                                           |
| request_saldo           | Request manual penambahan saldo                               |
| pdambjm_trans           | Transaksi PDAM legacy                                         |
| lunasin_trans           | Transaksi Lunasin                                             |
| multi_payment_requests  | Orchestrator multi-payment                                    |
| multi_payment_items     | Item per request multi-payment                                |
| transaction_events      | Audit trail lengkap semua transaksi                           |
| notifications           | Notifikasi broadcast/per-user/per-role                        |
| cashier_closings        | Data tutup kasir per shift                                    |
| topup_requests          | Request top-up via Midtrans                                   |
| api_providers           | CRUD provider eksternal (webhook_url, webhook_secret, api_key)|
| audit_logs              | Audit log immutable hash-chained (aksi sensitif)              |

### Tabel Keuangan & Akuntansi

| Tabel                   | Deskripsi                                                     |
|-------------------------|---------------------------------------------------------------|
| gl_accounts             | Chart of Accounts (COA)                                       |
| gl_journal_entries      | Header jurnal (append-only, tidak bisa di-update/delete)      |
| gl_journal_lines        | Baris debit/kredit per jurnal                                 |
| settlement_batches      | Batch settlement harian per loket                             |
| settlement_batch_items  | Item transaksi dalam batch settlement                         |
| commission_rules        | Aturan komisi per scope/target/type                           |
| commission_ledger       | Pencatatan komisi per transaksi                               |

---

## 6. Modul Pembayaran

### 6.1 PDAM

- API: src/lib/pdam-api.ts
- Retry logic: percobaan 1 = payment. Jika timeout (retryable=true), retry ke endpoint advice. Max 3x.
- Circuit breaker: buka setelah 5 kegagalan berturut-turut, half-open setelah 60 detik.
- Idempotency: idempotency_key disimpan di DB, request duplikat dikembalikan hasil sebelumnya.

### 6.2 Lunasin

- API: src/lib/lunasin-api.ts
- Multi-product: PLN Prepaid, Pulsa, BPJS, Telkom, dll.
- URL: env var LUNASIN_BASE_URL
- Auth: header Authorization Bearer LUNASIN_API_KEY

### 6.3 Multi-Payment (Bayar Semua)

- Frontend: handleBayarSemua di src/app/pembayaran/page.tsx
- Flow: Group unifiedCart by (provider, customerId) → Promise.allSettled paralel per pelanggan
- Setiap group = 1 SSE request ke /api/pembayaran/multipay?stream=1
- Orchestrator (orchestrator.ts): sequential per provider dalam 1 request
- Real-time progress: Server-Sent Events (SSE) — implementasi Opsi B

### 6.4 Cron Jobs

Cron jobs aktif per 25 Mei 2026:
1. POST /api/cron/settlement-daily — generate settlement batch harian
2. POST /api/cron/auto-advice — retry transaksi PENDING stuck → PENDING_ADVICE → auto-FAILED

---

## 7. Fitur Keuangan & Akuntansi

Selesai dibangun: 25 Mei 2026

### 7.1 General Ledger (Buku Besar)

- Double-entry bookkeeping append-only
- Koreksi via REVERSAL entry (bukan UPDATE)
- Trigger MySQL memblokir UPDATE/DELETE pada jurnal (immutable)

Chart of Accounts (COA) — 13 akun seed:

| Kode | Nama                    |
|------|-------------------------|
| 1101 | Kas Loket               |
| 1102 | Saldo Provider          |
| 1201 | Piutang Settlement      |
| 2101 | Hutang Settlement       |
| 2102 | Titipan Pelanggan       |
| 3101 | Modal Disetor           |
| 3201 | Laba Ditahan            |
| 4101 | Pendapatan Admin        |
| 4102 | Pendapatan Margin Provider |
| 4901 | Pendapatan Lain         |
| 5101 | Beban Provider          |
| 5201 | Beban Operasional       |
| 5901 | Beban Penyesuaian       |

Posting Rules:
- Payment sukses: Dr 1101 Kas Loket (total) / Cr 1102 Saldo Provider + Cr 4101 Pendapatan Admin
- Top-up saldo: Dr 1102 / Cr 3101 (positif) atau sebaliknya (negatif)
- Settlement approve: Dr 2101 Hutang Settlement / Cr 1101 Kas Loket

### 7.2 Settlement

- Status flow: DRAFT → APPROVED → PAID
- Idempoten: UNIQUE(batch_date, loket_code)
- net_payable = total_gross - total_admin_fee

### 7.3 Komisi / Profit Sharing

Selesai dibangun: 26 Mei 2026

- Scope aturan: GLOBAL / LOKET / PROVIDER / LOKET_PROVIDER
- Target: KASIR atau LOKET
- Type: PERCENT atau FLAT
- Basis: AMOUNT / ADMIN_FEE / TOTAL
- Specificity: LOKET_PROVIDER > LOKET = PROVIDER > GLOBAL
- Best-effort: kegagalan komisi tidak membatalkan payment
- Akun GL komisi: 5301 Beban Komisi Kasir, 5302 Beban Komisi Loket, 2201 Hutang Komisi Kasir, 2202 Hutang Komisi Loket

---

## 8. Integrasi Laporan Pedami Payment

Selesai dibangun: 25 Mei 2026

- Sumber data eksternal: Laravel app di https://ppob-baru.paymentpedami.com
- Auth: header report-token divalidasi via tabel report_api_tokens di DB Laravel
- Endpoint Laravel (semua di bawah /report/): pdam/rekap, pdam/detail, pln/postpaid/rekap, pln/postpaid/detail, pln/prepaid/rekap, pln/prepaid/detail
- Di portal-utilitas: toggle "Sumber Data" (Gabungan / Portal Utilitas / Pedami Payment)
- Baris dari Pedami tampil dengan badge indigo

---

## 9. Print Bridge

- Lokasi: print-bridge/ (Node.js service terpisah)
- Port: 6789
- Protocol: ESC/P untuk printer Epson dot matrix
- Fungsi: menerima job cetak dari portal, forward ke printer lokal

Fitur cetak tambahan (25 Mei 2026):
- Watermark "COPY" pada cetak ulang struk
- Audit siapa yang melakukan cetak ulang
- Cetak ulang bulk + filter tanggal

---

## 10. Monitoring & Notifikasi

- Halaman: /monitoring
- Menampilkan: circuit state provider, success rate, latency 24 jam
- Notifikasi: broadcast/per-user/per-role via tabel notifications
- Observability: OpenTelemetry (traces/metrics/logs) via instrumentation.ts, export via OTLP

---

## 11. Utility Libraries

| Library                     | File                              | Fungsi                                          |
|-----------------------------|-----------------------------------|-------------------------------------------------|
| Cache                       | src/lib/cache.ts                  | In-memory Map dengan TTL                        |
| Circuit Breaker             | src/lib/circuit-breaker.ts        | Auto-open setelah N kegagalan                   |
| Rate Limiter                | src/lib/provider-rate-limit.ts    | Rate limit per provider                         |
| Webhook                     | src/lib/webhook.ts                | Kirim event ke webhook eksternal                |
| Posting Rules GL            | src/lib/gl/posting-rules.ts       | Logika posting jurnal otomatis                  |
| Commission Engine           | src/lib/commission/calculate.ts   | Kalkulasi & pencatatan komisi per transaksi     |

---

## 12. Keamanan

Status pentest OWASP Top 10 (25 Mei 2026):

- A01 Broken Access Control: RBAC + middleware enforced
- A02 Cryptography Failures: bcrypt untuk password, HS256 untuk JWT
- A03 Injection: parameterized queries mysql2
- A04 Insecure Design: rate-limit login, lockout
- A05 Security Misconfiguration: env vars terpisah per environment
- A07 Auth Failures: session JWT, status user divalidasi tiap request
- Belum dikerjakan: enkripsi at-rest kolom sensitif, rotasi API key terjadwal, 2FA

---

## 13. Roadmap Pengembangan (diusulkan 25 Mei 2026)

Status item yang sudah dikerjakan:

1. Operasional & Keandalan — SELESAI (25 Mei 2026)
   - Retry & reversal otomatis transaksi PENDING
   - Health check dashboard provider
   - Audit log immutable hash-chained

2. Keuangan & Akuntansi — SELESAI (25 Mei 2026)
   - General Ledger double-entry
   - Settlement harian
   - Margin & profit per provider/loket

3. Komisi / Profit Sharing — SELESAI (26 Mei 2026)

Yang belum dikerjakan (prioritas berikutnya):
- Test suite (belum ada __tests__ / *.test.ts)
- PWA + mode offline untuk kasir
- PPOB tambahan (TV kabel, e-money, voucher game)
- 2FA wajib untuk admin & supervisor
- Enkripsi at-rest data sensitif
- Secret manager (Vault/Doppler) untuk API key

---

## 14. Catatan Teknis Penting

- Next.js module-level code dieksekusi saat build — jangan throw/validate env var di top-level file. Gunakan process.env.NEXT_PHASE !== 'phase-production-build' guard.
- Next.js dev server tidak auto-reload .env — restart server setelah ubah env var.
- Migration file dengan tanggal sama yang saling bergantung: beri prefix huruf untuk kontrol urutan (contoh: 20260525_z_fix_settlement_collation.sql).
- mysql2 reduce callback butuh type annotation eksplisit di TypeScript.
- Map.entries() iteration butuh Array.from() untuk target ES2015-.
- GL posting: best-effort, kegagalan GL tidak boleh membatalkan payment yang sukses.
- AuditActorType harus lowercase ("user", bukan "USER").
- migrate.js parser tidak support BEGIN..END triggers — gunakan single-statement SIGNAL form.
