# Analisa Mendalam Aplikasi Pembayaran

Tanggal analisa: 2026-06-04

## Ringkasan

Aplikasi sudah memiliki cakupan fitur yang luas: kasir, multipayment, payment link, self-service publik, struk digital, refund/dispute, rekonsiliasi, settlement, GL/keuangan, monitoring, mobile auth, provider API, dan print bridge.

Untuk kesiapan production, prioritas utama bukan menambah fitur baru terlebih dahulu, melainkan memperkuat keamanan, reliabilitas transaksi uang, integritas data, dan operasional recovery.

## Prioritas Kritis

### 1. Rahasia dan Credential Jangan Ada di Repo

Risiko:

- Credential DB, Midtrans, provider, JWT secret, dan token internal bisa bocor.
- Jika repo pernah dibagikan atau di-push, secret harus dianggap compromised.

Area terkait:

- `.env`
- `print-bridge/key.pem`
- `print-bridge/cert.pem`

Rekomendasi:

- Hapus secret dari repo dan history.
- Rotate semua credential yang pernah tersimpan.
- Gunakan `.env.example` tanpa nilai rahasia.
- Simpan secret di environment deployment atau secret manager.

### 2. Harden atau Matikan DB Manage di Production

Risiko:

- Endpoint SQL bebas setara remote database admin.
- Token statis/deterministik dapat menjadi titik serangan besar.

Area terkait:

- `src/app/api/db-manage/query/route.ts`
- `src/app/api/db-manage/tables/[table]/route.ts`
- `src/lib/db-manage-auth.ts`

Rekomendasi:

- Disable `db-manage` di production.
- Jika tetap dibutuhkan, wajib admin session, MFA, IP allowlist, dan audit log.
- Query endpoint sebaiknya read-only atau dihapus.

### 3. API Auth/RBAC Perlu Default Deny

Risiko:

- Middleware melewati semua `/api/*`.
- Jika endpoint baru lupa proteksi, bisa terbuka.
- Model permission saat ini cenderung fail-open untuk API yang tidak terdaftar.

Area terkait:

- `middleware.ts`
- `src/lib/rbac.ts`

Rekomendasi:

- Ubah default API permission menjadi deny.
- Buat wrapper standar: public, authenticated, admin, cron.
- Audit semua endpoint publik dan endpoint internal.

### 4. Payment Link Bisa Stuck Setelah Gateway Sukses

Risiko:

- Uang pelanggan sudah masuk gateway, tetapi invoice bisa berhenti di `PROCESSING_PROVIDER` jika provider orchestration gagal.
- Cron hanya mengambil invoice `PAID_GATEWAY`, sehingga invoice yang sudah berubah ke `PROCESSING_PROVIDER` bisa tidak retry.

Area terkait:

- `src/lib/payment-links/service.ts`
- `src/app/api/cron/process-paid-invoices/route.ts`

Rekomendasi:

- Tambah field retry: `processing_started_at`, `attempt_count`, `last_error`.
- Cron harus retry invoice `PROCESSING_PROVIDER` yang stale.
- Tambah tombol admin `Retry Provider`.
- Gunakan status recoverable, bukan status buntu.

### 5. Cron Payment Link Perlu Job Lock

Risiko:

- Dua cron bisa memproses invoice yang sama bersamaan.
- Provider bisa menerima request duplikat.

Area terkait:

- `src/app/api/cron/process-paid-invoices/route.ts`
- `src/lib/jobs/system-job-lock.ts`

Rekomendasi:

- Gunakan `system_jobs` lock untuk semua cron payment link.
- Claim invoice secara atomik dengan conditional update.
- Simpan hasil job: jumlah diproses, sukses, gagal, durasi, error terakhir.

### 6. Mutasi Saldo Harus Transactional dan Atomic

Risiko:

- Provider berhasil tetapi saldo lokal gagal update.
- Race condition bisa membuat saldo tidak akurat atau negatif.

Area terkait:

- `src/app/api/pembayaran/pay/route.ts`
- `src/app/api/saldo/route.ts`
- `src/app/api/pembayaran/lunasin/pay/route.ts`

Rekomendasi:

- Gabungkan transaksi pembayaran, audit, dan mutasi saldo dalam DB transaction.
- Gunakan atomic update seperti `UPDATE lokets SET pulsa = pulsa - ? WHERE id = ? AND pulsa >= ?`.
- Buat ledger immutable untuk semua perubahan saldo.

### 7. Idempotency Perlu Validasi Payload Hash

Risiko:

- Idempotency key yang sama bisa dipakai untuk payload berbeda.
- Public self-service yang retry bisa membuat invoice ganda karena idempotency key selalu baru.

Area terkait:

- `src/lib/multipay/repository.ts`
- `src/lib/payment-links/repository.ts`
- `src/app/api/public/self-service/payment-link/route.ts`

Rekomendasi:

- Tambah `request_hash` ke multipayment dan payment invoice.
- Jika key sama tapi hash beda, return `409 Conflict`.
- Public self-service perlu client idempotency key atau key deterministik per inquiry.

## Prioritas Tinggi

### 1. Manual Sync Status Gateway

Masalah:

- Jika webhook Midtrans hilang atau terlambat, invoice bisa tetap `PAYMENT_PENDING`.

Rekomendasi:

- Tambah cron polling status Midtrans untuk invoice stale.
- Tambah tombol admin `Sync Gateway Status`.
- Validasi nominal saat sync.

### 2. Webhook Retry dan Dead Letter Queue

Masalah:

- Webhook yang gagal diproses belum punya retry queue yang jelas.

Rekomendasi:

- Simpan semua raw webhook payload.
- Tambahkan retry otomatis.
- Jika tetap gagal, masukkan ke dead letter queue.
- Admin bisa reprocess webhook dari UI.

### 3. Provider Retry dan Advice Lebih Aman

Masalah:

- Pending bisa auto-failed terlalu agresif tanpa final check provider.

Rekomendasi:

- Sebelum `AUTO_REVERSED`, panggil advice/status provider.
- Status ambigu masuk manual review.
- Simpan timeline attempt provider.

### 4. Finalisasi Multipayment Harus Lebih Transactional

Masalah:

- Item, parent request, dan invoice finalization dilakukan dalam operasi terpisah.
- DB error di tengah proses bisa meninggalkan state tidak konsisten.

Area terkait:

- `src/lib/multipay/orchestrator.ts`
- `src/lib/multipay/repository.ts`

Rekomendasi:

- Update item, parent, dan invoice dalam satu transaction jika memungkinkan.
- Tambah repair cron untuk menghitung ulang parent/invoice status dari item.

### 5. Settlement Harus Berdasarkan Item Sukses

Masalah:

- Settlement yang hanya mengambil parent `SUCCESS` bisa melewatkan item sukses dalam parent `PARTIAL_SUCCESS`.

Area terkait:

- `src/lib/settlement/batch.ts`

Rekomendasi:

- Generate settlement dari `multi_payment_items` status `SUCCESS`.
- Support parent `PARTIAL_SUCCESS`.
- Lock/claim item settlement saat generate batch.

### 6. Rekonsiliasi Jangan Auto Match Berdasarkan Customer Saja

Masalah:

- Fallback matching hanya berdasarkan `ID_PELANGGAN` bisa salah untuk beda periode atau produk.

Area terkait:

- `src/lib/reconciliation.ts`

Rekomendasi:

- Customer-only fallback jangan dianggap match otomatis.
- Jika hanya customer yang cocok, statuskan `NEED_REVIEW`.
- Prioritaskan `KODE_TRANSAKSI`, `REF_PROVIDER`, `PERIODE`, `PRODUK`, dan `KODE_LOKET`.

## Keamanan

### 1. Mobile Auth Harus Cek Status User

Area terkait:

- `src/app/api/auth/mobile/login/route.ts`
- `src/app/api/auth/mobile/refresh/route.ts`

Rekomendasi:

- Tolak user nonaktif, pending, atau rejected.
- Refresh token harus cek status user terbaru.

### 2. Refresh Token Mobile Harus Bisa Dicabut

Area terkait:

- `src/lib/mobile-auth.ts`

Rekomendasi:

- Simpan hashed refresh token atau JTI di DB.
- Rotate refresh token setiap refresh.
- Revoke saat logout, ganti password, atau user dinonaktifkan.

### 3. Rate Limit Perlu Shared Store

Area terkait:

- `src/lib/rate-limit.ts`
- endpoint public self-service

Rekomendasi:

- Gunakan Redis atau shared store.
- Jangan percaya `x-forwarded-for` kecuali dari trusted proxy.
- Tambahkan rate limit ke public invoice, pay, dan receipt endpoint.

### 4. Provider API IP Allowlist Harus Trusted Proxy Aware

Area terkait:

- `src/lib/provider-auth.ts`

Rekomendasi:

- Hanya percaya forwarded header dari reverse proxy terpercaya.
- Jika app expose langsung, gunakan remote address asli dari platform/proxy.

### 5. Setup Endpoint Perlu Dihapus atau Dikunci Ketat

Area terkait:

- `src/app/api/auth/setup/route.ts`

Rekomendasi:

- Hapus dari production.
- Jangan pakai credential default seperti `admin/admin123`.
- Jika butuh bootstrap, gunakan one-time setup token yang kuat.

## Database dan Integritas Keuangan

### 1. Tambahkan Constraint Nominal

Rekomendasi:

- `CHECK amount >= 0`
- `CHECK admin_fee >= 0`
- `CHECK total = amount + admin_fee`
- Parent total harus bisa direkonsiliasi dari child rows.

### 2. Tambah Unique Constraint untuk GL Posting

Area terkait:

- `src/lib/gl/journal.ts`

Rekomendasi:

- Unique key pada `(source_type, source_id, reverses_entry_id)` atau equivalent active source key.
- Insert jurnal harus dilakukan dalam transaction.

### 3. Standardisasi Perhitungan Uang

Masalah:

- Banyak arithmetic menggunakan JavaScript `number`.

Rekomendasi:

- Untuk Rupiah, gunakan integer minor unit.
- Atau gunakan decimal library.
- Centralize fungsi hitung uang dan rounding policy.

### 4. Migration Safety Perlu Diperkuat

Masalah:

- Migration runner menjalankan banyak statement non-transactional.
- Schema drift bisa terjadi jika migration gagal di tengah.

Rekomendasi:

- Split migration berisiko.
- Cek `information_schema` sebelum menambah constraint/index.
- Hindari skip error yang menyembunyikan schema drift.

## Operasional dan Monitoring

### 1. Alert Eksternal Belum Ada

Masalah:

- Dashboard ada, tetapi alert belum dikirim ke channel eksternal.

Rekomendasi:

- Alert dispatcher dengan dedupe dan cooldown.
- Channel: email, WhatsApp, Slack, atau Telegram.
- Alert untuk provider down, webhook fail, stuck invoice, cron fail, audit chain broken.

### 2. Audit Log Bagus tapi Belum Dioperasionalkan

Area terkait:

- `src/lib/audit-log.ts`

Rekomendasi:

- Buat audit viewer untuk admin.
- Jadwalkan audit chain verification.
- High-risk action pakai strict audit.
- Alert jika audit write/chain verification gagal.

### 3. Health Endpoint Perlu Dipisah

Area terkait:

- `src/app/api/health/route.ts`

Rekomendasi:

- Pisah liveness dan readiness.
- Public health minimal.
- Detail DB latency dan error hanya untuk admin/internal.

### 4. Print Bridge Perlu Pairing Token

Area terkait:

- `print-bridge/server.js`

Rekomendasi:

- Tambah local pairing token.
- Restrict origin.
- Tambah body size limit.
- Audit perubahan config printer.

## Pengembangan UX/Admin yang Direkomendasikan

### 1. Transaction Recovery Center

Satu halaman untuk menangani:

- Invoice gateway sukses tetapi provider belum diproses.
- Pending advice.
- Provider failed.
- Webhook dead letter.
- Settlement mismatch.
- Reconciliation exception.

### 2. Tombol Manual Repair yang Aman

Contoh aksi:

- `Sync Gateway`
- `Retry Provider`
- `Mark Manual Review`
- `Open Refund`
- `Recompute Parent Status`

Semua aksi harus masuk audit log.

### 3. Timeline Transaksi

Untuk setiap transaksi/invoice, tampilkan timeline:

- inquiry
- payment created
- gateway callback
- provider request
- provider response
- advice/retry
- settlement
- reconciliation

### 4. Template Notifikasi

Admin dapat mengatur template:

- invoice
- reminder expired
- payment success
- refund/dispute
- maintenance publik

### 5. Mode Maintenance Lanjutan

Melengkapi toggle fitur yang sudah dibuat:

- pesan maintenance custom
- jadwal mulai/selesai
- whitelist admin/testing
- status banner dashboard

## Roadmap Eksekusi

### Minggu 1: Security Hardening

- Rotate secret dan hapus dari repo.
- Disable/harden `db-manage`.
- API RBAC default deny.
- Mobile auth cek status user.
- Refresh token revocation.

### Minggu 2: Payment Reliability

- Retry `PROCESSING_PROVIDER`.
- Cron lock payment link.
- Manual sync Midtrans.
- Webhook dead letter queue.

### Minggu 3: Financial Integrity

- Mutasi saldo transactional dan atomic.
- Request hash untuk idempotency.
- Constraint nominal di DB.
- Unique GL posting.

### Minggu 4: Operations and Recovery

- Transaction Recovery Center.
- Alert dispatcher.
- Audit viewer.
- Cron dashboard.

### Minggu 5: UX Growth

- Payment reminder.
- Template notifikasi.
- Customer history.
- Advanced settlement dan rekonsiliasi.

## Top 5 Pekerjaan Paling Penting

1. Amankan secret dan disable/harden `db-manage`.
2. Perbaiki retry `PROCESSING_PROVIDER` supaya uang masuk tidak stuck.
3. Tambahkan lock untuk cron payment link.
4. Buat mutasi saldo transactional dan atomic.
5. Tambah `request_hash` untuk idempotency payment, multipay, dan public invoice.
