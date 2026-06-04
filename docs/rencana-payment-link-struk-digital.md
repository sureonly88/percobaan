# Rencana Teknis — Payment Link & Struk Digital

Dokumen ini merancang fitur **Payment Link / Invoice Online** dan **Struk Digital** untuk aplikasi Portal Utilitas berbasis Next.js. Rencana ini disusun agar selaras dengan arsitektur yang sudah ada: `multi_payment_requests`, `multi_payment_items`, Midtrans Snap, webhook Midtrans, audit log, notifikasi, settlement, dan formatter struk di `src/lib/print-receipt.ts`.

---

## 1. Tujuan

### 1.1 Goal

Menyediakan alur pembayaran online mandiri untuk pelanggan melalui link invoice publik, sekaligus menyediakan struk digital yang bisa divalidasi melalui URL/QR Code.

### 1.2 Deliverables

- Tabel database untuk invoice/payment link, event, dan akses struk digital.
- API untuk membuat invoice, melihat invoice publik, memulai pembayaran online, menerima webhook gateway, dan menampilkan struk digital.
- UI internal untuk admin/kasir membuat dan memonitor payment link.
- UI publik untuk pelanggan membuka invoice, membayar, dan melihat struk digital.
- Integrasi Midtrans Snap untuk channel QRIS/VA/e-wallet dan webhook status pembayaran.
- Integrasi transaksi utama ke `multi_payment_requests` / `multi_payment_items`.
- Integrasi audit log dan notifikasi.

### 1.3 Success Criteria

- Kasir/admin dapat membuat payment link dari tagihan yang sudah di-inquiry.
- Pelanggan dapat membuka link publik tanpa login.
- Pelanggan dapat membayar via Midtrans Snap.
- Webhook Midtrans mengubah status invoice secara idempoten.
- Setelah pembayaran online sukses, sistem menjalankan proses pembayaran tagihan ke provider secara aman.
- Struk digital tersedia hanya setelah transaksi sukses/partial success.
- QR pada struk fisik dapat memvalidasi keaslian struk digital.
- Semua perubahan status penting tercatat di audit log / transaction events.

### 1.4 Constraints

- Jangan mengganti alur pembayaran kasir tunai yang sudah ada.
- Jangan memproses provider payment sebelum dana online benar-benar `SUCCESS`/`settlement` dari gateway.
- Webhook harus idempoten karena Midtrans dapat mengirim notifikasi lebih dari sekali.
- Endpoint publik tidak boleh mengekspos data sensitif tanpa token publik yang kuat.
- Posting GL/payment settlement harus tetap konsisten dengan pola yang sudah ada.

---

## 2. Kondisi Sistem Saat Ini

### 2.1 Komponen yang Sudah Ada

| Area | File / Tabel | Catatan |
|---|---|---|
| Multi-payment core | `multi_payment_requests`, `multi_payment_items` | Menyimpan transaksi induk dan item pembayaran per provider. |
| API multipay | `src/app/api/pembayaran/multipay/route.ts` | Memproses pembayaran multi item secara sinkron/SSE. |
| Detail multipay | `src/app/api/pembayaran/multipay/[code]/route.ts` | Mengambil detail transaksi multipay dan menjalankan advice item. |
| Midtrans helper | `src/lib/midtrans.ts` | Sudah ada `createSnapTransaction`, `verifySignature`, `mapMidtransStatus`. |
| Webhook Midtrans | `src/app/api/topup/webhook/route.ts` | Pola webhook idempoten untuk top-up saldo. |
| Top-up online | `topup_requests` | Contoh tabel gateway order, snap token, snap URL, status, expiry. |
| Struk | `src/lib/print-receipt.ts` | Formatter plain text dan print bridge untuk banyak produk. |
| Cetak ulang | `src/app/api/pembayaran/reprint/route.ts` | Mengambil data struk dari `multi_payment_items`, mencatat audit `REPRINT_RECEIPT`. |
| Keuangan | `src/lib/gl/posting-rules.ts` | Posting `postPaymentSuccess` dan `postSaldoMutation`. |
| Audit | `src/lib/audit-log.ts` | Audit immutable untuk aksi sensitif. |
| Notifikasi | `src/lib/notifications.ts` | Notifikasi internal user/role. |

### 2.2 Implikasi Desain

Fitur payment link sebaiknya **tidak membuat tabel transaksi pembayaran baru yang terpisah total**, melainkan membuat lapisan invoice publik yang setelah dibayar akan membuat/memproses transaksi melalui mekanisme multipay yang sudah ada.

Dengan begitu:

- Laporan transaksi tetap memakai `multi_payment_requests/items`.
- Cetak ulang/struk dapat memakai pola data existing.
- Settlement dan margin tetap bisa mengacu pada transaksi multipay.
- Risiko duplikasi logic provider payment lebih kecil.

---

## 3. Konsep Domain

### 3.1 Entitas Utama

1. **Payment Invoice**
   - Representasi tagihan online yang dibagikan ke pelanggan.
   - Punya public token/link.
   - Punya status invoice.

2. **Invoice Item**
   - Detail tagihan per produk/provider.
   - Berisi snapshot hasil inquiry agar nominal tidak berubah diam-diam.

3. **Gateway Payment**
   - Order Midtrans Snap untuk invoice.
   - Menyimpan `gateway_order_id`, `snap_token`, `snap_url`, `payment_type`, dan payload webhook.

4. **Provider Payment Execution**
   - Proses pembayaran tagihan ke PDAM/Lunasin setelah dana gateway sukses.
   - Output-nya adalah `multi_payment_requests/items`.

5. **Digital Receipt**
   - Tampilan publik dari transaksi sukses.
   - Memakai token/receipt code agar bisa divalidasi via QR.

---

## 4. Status Lifecycle

### 4.1 Status Invoice

```text
DRAFT
  ↓ publish
UNPAID
  ↓ customer opens payment / Snap created
PAYMENT_PENDING
  ↓ gateway settlement/capture accepted
PAID_GATEWAY
  ↓ provider payment running
PROCESSING_PROVIDER
  ↓ provider result
SUCCESS / PARTIAL_SUCCESS / PENDING_REVIEW / FAILED_PROVIDER

UNPAID / PAYMENT_PENDING
  ↓ expired
EXPIRED

UNPAID / PAYMENT_PENDING
  ↓ cancelled by admin
CANCELLED
```

### 4.2 Prinsip Penting

- `PAID_GATEWAY` berarti dana pelanggan sudah diterima gateway, tetapi tagihan provider belum tentu berhasil.
- `SUCCESS` berarti semua item provider sukses.
- `PARTIAL_SUCCESS` berarti sebagian item sukses.
- `PENDING_REVIEW` berarti ada item pending/advice.
- `FAILED_PROVIDER` berarti dana gateway masuk tetapi pembayaran provider gagal. Ini harus masuk antrean refund/dispute/manual handling.

---

## 5. Rancangan Database

### 5.1 Migration Baru

File yang disarankan:

```text
database/migrations/20260603_payment_links_and_digital_receipts.sql
```

### 5.2 Tabel `payment_invoices`

```sql
CREATE TABLE IF NOT EXISTS payment_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_code VARCHAR(80) NOT NULL,
  public_token CHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,

  status ENUM(
    'DRAFT',
    'UNPAID',
    'PAYMENT_PENDING',
    'PAID_GATEWAY',
    'PROCESSING_PROVIDER',
    'SUCCESS',
    'PARTIAL_SUCCESS',
    'PENDING_REVIEW',
    'FAILED_PROVIDER',
    'EXPIRED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'DRAFT',

  loket_code VARCHAR(64) NULL,
  loket_name VARCHAR(150) NULL,
  created_by VARCHAR(128) NULL,

  customer_name VARCHAR(150) NULL,
  customer_phone VARCHAR(32) NULL,
  customer_email VARCHAR(150) NULL,

  total_items INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  total_admin DECIMAL(15,0) NOT NULL DEFAULT 0,
  gateway_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
  grand_total DECIMAL(15,0) NOT NULL DEFAULT 0,

  gateway VARCHAR(32) NOT NULL DEFAULT 'midtrans',
  gateway_order_id VARCHAR(128) NULL,
  gateway_tx_id VARCHAR(128) NULL,
  payment_method VARCHAR(64) NULL,
  snap_token VARCHAR(255) NULL,
  snap_url TEXT NULL,
  gateway_status VARCHAR(64) NULL,
  gateway_payload JSON NULL,

  multi_payment_code VARCHAR(150) NULL,
  receipt_token CHAR(64) NULL,

  notes TEXT NULL,
  expires_at DATETIME NULL,
  paid_gateway_at DATETIME NULL,
  provider_processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_invoice_code (invoice_code),
  UNIQUE KEY uq_payment_invoice_public_token (public_token),
  UNIQUE KEY uq_payment_invoice_idempotency_key (idempotency_key),
  UNIQUE KEY uq_payment_invoice_gateway_order (gateway_order_id),
  UNIQUE KEY uq_payment_invoice_receipt_token (receipt_token),
  KEY idx_payment_invoice_status_created (status, created_at),
  KEY idx_payment_invoice_loket_created (loket_code, created_at),
  KEY idx_payment_invoice_multi_payment_code (multi_payment_code),
  KEY idx_payment_invoice_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### 5.3 Tabel `payment_invoice_items`

```sql
CREATE TABLE IF NOT EXISTS payment_invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(150) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  service_type VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) NULL,
  product_code VARCHAR(100) NULL,
  provider_ref VARCHAR(100) NULL,
  period_label VARCHAR(50) NULL,
  amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  admin_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
  total DECIMAL(15,0) NOT NULL DEFAULT 0,
  inquiry_snapshot JSON NULL,
  metadata_json JSON NULL,
  multi_payment_item_code VARCHAR(150) NULL,
  status ENUM('UNPAID','PROCESSING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE') NOT NULL DEFAULT 'UNPAID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_invoice_item_code (item_code),
  KEY idx_payment_invoice_items_invoice (invoice_id),
  KEY idx_payment_invoice_items_customer (customer_id),
  KEY idx_payment_invoice_items_multi_item (multi_payment_item_code),
  CONSTRAINT fk_payment_invoice_items_invoice
    FOREIGN KEY (invoice_id) REFERENCES payment_invoices(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### 5.4 Tabel `payment_invoice_events`

```sql
CREATE TABLE IF NOT EXISTS payment_invoice_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  actor_type ENUM('user','system','gateway','public') NOT NULL DEFAULT 'system',
  actor_username VARCHAR(128) NULL,
  before_status VARCHAR(64) NULL,
  after_status VARCHAR(64) NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_invoice_events_invoice (invoice_id, created_at),
  KEY idx_invoice_events_type_created (event_type, created_at),
  CONSTRAINT fk_payment_invoice_events_invoice
    FOREIGN KEY (invoice_id) REFERENCES payment_invoices(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

---

## 6. API Endpoint

### 6.1 Internal — Create Invoice

```text
POST /api/payment-links
Auth: kasir/admin/supervisor
```

Payload:

```json
{
  "idempotencyKey": "uuid-or-client-key",
  "loketCode": "LKT-001",
  "loketName": "Loket Utama",
  "customerName": "Budi",
  "customerPhone": "62812xxxx",
  "customerEmail": "budi@example.com",
  "expiresInMinutes": 1440,
  "items": [
    {
      "provider": "LUNASIN",
      "serviceType": "PLN_POSTPAID",
      "customerId": "12345678901",
      "customerName": "Budi",
      "productCode": "pln-postpaid",
      "providerRef": "id_trx_from_inquiry",
      "periodLabel": "202605",
      "amount": 150000,
      "adminFee": 3000,
      "total": 153000,
      "metadata": {},
      "inquirySnapshot": {}
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "invoiceCode": "INV-20260603-AB12CD",
  "publicUrl": "https://domain.com/i/<publicToken>",
  "expiresAt": "2026-06-04T01:00:00.000Z"
}
```

Tanggung jawab endpoint:

- Validasi role dengan `canProcessPayment`/RBAC existing.
- Validasi nominal: `sum(items.total) = grand_total`.
- Generate `invoice_code`, `public_token`, `receipt_token`.
- Simpan snapshot inquiry agar invoice immutable.
- Tulis audit/event `PAYMENT_LINK_CREATED`.

---

### 6.2 Internal — List Invoice

```text
GET /api/payment-links?status=UNPAID&page=1&pageSize=20&search=...
Auth: kasir/admin/supervisor
```

Untuk halaman monitoring payment link.

---

### 6.3 Internal — Detail Invoice

```text
GET /api/payment-links/[invoiceCode]
Auth: kasir/admin/supervisor
```

Mengembalikan invoice, items, event timeline, gateway data, dan link struk jika sudah tersedia.

---

### 6.4 Internal — Cancel Invoice

```text
PATCH /api/payment-links/[invoiceCode]
Auth: kasir/admin/supervisor
Body: { "action": "cancel", "reason": "..." }
```

Hanya boleh jika status belum final dan belum `PAID_GATEWAY`.

---

### 6.5 Public — View Invoice

```text
GET /api/public/invoices/[token]
No auth
```

Response hanya data aman:

- Nama pelanggan sebagian jika perlu masking.
- Produk/tagihan.
- Total bayar.
- Status.
- Expiry.
- `snapUrl` jika sudah dibuat dan belum expired.

Tidak mengembalikan payload provider mentah yang berisi data sensitif.

---

### 6.6 Public — Start Online Payment

```text
POST /api/public/invoices/[token]/pay
No auth
```

Tanggung jawab:

- Validasi invoice masih `UNPAID` atau `PAYMENT_PENDING`.
- Jika `snap_token` sudah ada dan belum expired, kembalikan token lama.
- Jika belum ada, panggil `createSnapTransaction`.
- Update status ke `PAYMENT_PENDING`.
- Return `snapToken` dan `snapUrl`.

Catatan perubahan `src/lib/midtrans.ts`:

Saat ini `createSnapTransaction` callback diarahkan ke `/topup/finish`. Perlu dibuat lebih fleksibel:

```ts
export interface SnapRequest {
  orderId: string;
  grossAmount: number;
  customerName: string;
  customerEmail?: string;
  itemName: string;
  callbacks?: {
    finish?: string;
    unfinish?: string;
    error?: string;
  };
}
```

Lalu callback invoice diarahkan ke:

```text
/invoice/[token]/finish
/invoice/[token]/unfinish
/invoice/[token]/error
```

---

### 6.7 Public Gateway Webhook

```text
POST /api/payment-links/webhook
No auth, verify Midtrans signature
```

Alur webhook:

1. Parse body Midtrans.
2. Verifikasi signature memakai `verifySignature`.
3. Cari invoice dari `gateway_order_id`.
4. Cek idempotensi:
   - Jika invoice sudah final `SUCCESS/PARTIAL_SUCCESS/PENDING_REVIEW/FAILED_PROVIDER`, balas OK.
   - Jika invoice sudah `PAID_GATEWAY` tapi provider belum selesai, jangan double-execute provider.
5. Map status gateway memakai `mapMidtransStatus`.
6. Jika gateway `PENDING`, update invoice ke `PAYMENT_PENDING`.
7. Jika gateway `FAILED/EXPIRED`, update ke `EXPIRED` atau tetap `UNPAID` sesuai status.
8. Jika gateway `SUCCESS`:
   - Update invoice ke `PAID_GATEWAY`.
   - Jalankan provider payment execution secara idempoten.

---

## 7. Eksekusi Provider Setelah Gateway Sukses

### 7.1 Opsi Implementasi

Ada dua opsi:

#### Opsi A — Webhook langsung memanggil orchestrator

Webhook memanggil `orchestrateMultiPayment()` secara langsung setelah dana masuk.

Kelebihan:
- Lebih cepat.
- Tidak perlu worker tambahan.

Kekurangan:
- Webhook bisa timeout jika provider lambat.
- Kurang ideal untuk transaksi banyak item.

#### Opsi B — Webhook enqueue, worker memproses

Webhook hanya mengubah invoice ke `PAID_GATEWAY`, lalu worker/cron memproses invoice yang belum dieksekusi provider.

Kelebihan:
- Lebih aman terhadap timeout.
- Retry dan observability lebih baik.
- Cocok dengan pola `system_jobs` existing.

Kekurangan:
- Butuh endpoint cron/worker tambahan.

### 7.2 Rekomendasi

Gunakan **Opsi B** untuk production.

Endpoint worker:

```text
POST /api/cron/process-paid-invoices
Auth: X-Cron-Secret / admin localhost
```

Worker mencari:

```sql
SELECT * FROM payment_invoices
WHERE status = 'PAID_GATEWAY'
  AND multi_payment_code IS NULL
ORDER BY paid_gateway_at ASC
LIMIT 20;
```

Lalu menjalankan `orchestrateMultiPayment()` dengan input dari `payment_invoice_items`.

### 7.3 Mapping ke Multipay

Input ke orchestrator:

```ts
{
  idempotencyKey: invoice.idempotency_key,
  loketCode: invoice.loket_code,
  loketName: invoice.loket_name,
  username: invoice.created_by ?? "ONLINE",
  paidAmount: invoice.grand_total,
  items: invoiceItems.map(...)
}
```

Setelah orchestrator selesai:

- Simpan `multi_payment_code` ke `payment_invoices`.
- Simpan mapping `multi_payment_item_code` ke `payment_invoice_items` jika itemCode dipertahankan sama.
- Update status invoice sesuai final status multipay.
- Buat event `INVOICE_PROVIDER_PROCESSED`.

---

## 8. Struk Digital

### 8.1 Public Receipt Page

Route UI:

```text
/r/[receiptToken]
```

API:

```text
GET /api/public/receipts/[receiptToken]
No auth
```

Endpoint mengambil data dari:

- `payment_invoices.receipt_token`
- `payment_invoices.multi_payment_code`
- `multi_payment_requests`
- `multi_payment_items`

Jika invoice belum sukses/partial/pending-review, response:

```json
{
  "available": false,
  "status": "PAYMENT_PENDING",
  "message": "Struk belum tersedia karena pembayaran belum selesai."
}
```

### 8.2 Receipt Validation

Halaman struk digital harus menampilkan:

- Badge `VALID` jika token ditemukan dan transaksi sukses.
- Nomor invoice.
- Nomor transaksi multipay.
- Tanggal bayar gateway.
- Tanggal proses provider.
- Loket.
- Item pembayaran.
- Total bayar.
- Ref provider / token PLN / ref Lunasin bila ada.
- QR yang mengarah ke URL struk yang sama.

### 8.3 Reuse Formatter Existing

Untuk output printable, endpoint public receipt dapat menggunakan pola dari `src/app/api/pembayaran/reprint/route.ts` dan `src/lib/print-receipt.ts`.

Disarankan refactor ringan:

```text
src/lib/receipt-data.ts
```

Isi helper:

- `buildReceiptDataFromMultiPaymentCode(code)`
- `buildReceiptDataFromTransactionCode(transactionCode)`
- `sanitizePublicReceiptData(data)`

Dengan helper ini:

- Reprint internal tetap jalan.
- Struk digital publik tidak menyalin logic parsing metadata berulang.

### 8.4 QR Code

Pilihan implementasi:

1. Pakai library npm lokal `qrcode` untuk generate QR di client/server.
2. Pakai QR via SVG client-side dengan dependency kecil.

Rekomendasi:

```bash
npm install qrcode
npm install -D @types/qrcode
```

QR URL:

```text
https://domain.com/r/<receiptToken>
```

---

## 9. UI / Halaman

### 9.1 Internal Payment Link Management

Route:

```text
/payment-links
```

Fitur:

- Tabel invoice.
- Filter status.
- Search invoice/customer/nomor pelanggan.
- Tombol salin link.
- Tombol kirim WhatsApp.
- Tombol batalkan invoice.
- Link ke detail.

### 9.2 Create Payment Link

Route:

```text
/payment-links/new
```

Alur UI:

1. Kasir pilih produk atau gunakan cart multipay yang sudah ada.
2. Inquiry tagihan.
3. Pilih item yang akan dibuat invoice.
4. Isi nama/no HP/email pelanggan.
5. Set expiry.
6. Generate link.
7. Tampilkan modal share:
   - Copy URL.
   - QR invoice.
   - WhatsApp deep link.

### 9.3 Public Invoice Page

Route:

```text
/i/[token]
```

Tampilan:

- Logo/nama aplikasi.
- Status invoice.
- Ringkasan tagihan.
- Timer expiry.
- Tombol `Bayar Sekarang`.
- Jika sudah sukses, tombol `Lihat Struk`.

### 9.4 Payment Finish Pages

Route:

```text
/invoice/[token]/finish
/invoice/[token]/unfinish
/invoice/[token]/error
```

Halaman ini hanya memberi UX setelah redirect dari Midtrans. Status final tetap harus berdasarkan webhook/server status check, bukan query redirect.

### 9.5 Public Receipt Page

Route:

```text
/r/[receiptToken]
```

Tampilan:

- Badge validasi.
- Detail transaksi.
- Tombol print/download.
- QR struk.
- Catatan legal: “Struk ini valid jika URL berasal dari domain resmi.”

---

## 10. Keamanan

### 10.1 Public Token

- `public_token` dan `receipt_token` harus minimal 32 byte random hex (`randomBytes(32).toString('hex')`).
- Jangan gunakan incremental ID di URL publik.

### 10.2 Data Masking

Untuk endpoint publik:

- Masking nomor HP.
- Batasi alamat pelanggan bila tidak perlu.
- Jangan tampilkan raw `provider_response` penuh.

### 10.3 Webhook Security

- Wajib `verifySignature` Midtrans.
- Validasi nominal webhook sama dengan `grand_total`.
- Simpan payload webhook untuk audit.
- Jangan percaya status dari halaman redirect.

### 10.4 Idempotency

Gunakan beberapa lapisan:

- `payment_invoices.idempotency_key` unique.
- `payment_invoices.gateway_order_id` unique.
- `multi_payment_requests.idempotency_key` unique.
- Event processing guard: hanya proses provider jika status `PAID_GATEWAY` dan `multi_payment_code IS NULL`.

### 10.5 Rate Limit

Endpoint publik perlu rate limit:

- `GET /api/public/invoices/[token]`
- `POST /api/public/invoices/[token]/pay`
- `GET /api/public/receipts/[receiptToken]`

Bisa memakai helper existing `src/lib/rate-limit.ts`.

---

## 11. Akuntansi dan Settlement

### 11.1 Perbedaan Tunai vs Online

Posting existing `postPaymentSuccess` mengasumsikan:

```text
Dr Kas Loket
   Cr Saldo Deposit Provider
   Cr Pendapatan Admin
```

Untuk payment link online, uang masuk ke gateway/settlement receivable, bukan kas fisik loket.

Ada dua pendekatan:

#### Pendekatan Minimal

Tetap gunakan posting payment existing agar laporan transaksi tetap jalan. Tambahkan rekonsiliasi gateway terpisah nanti.

#### Pendekatan Akuntansi Lebih Tepat

Tambahkan akun:

```text
1202 Piutang Payment Gateway
5102 Beban MDR Payment Gateway
```

Posting saat gateway sukses:

```text
Dr Piutang Payment Gateway       grand_total
   Cr Titipan Pelanggan / Pendapatan Belum Diproses   grand_total
```

Saat provider payment sukses:

```text
Dr Titipan Pelanggan             total
   Cr Saldo Deposit Provider     amount
   Cr Pendapatan Admin           admin_fee
```

Saat settlement gateway masuk rekening:

```text
Dr Kas/Bank                      net_settlement
Dr Beban MDR Gateway             gateway_fee
   Cr Piutang Payment Gateway    grand_total
```

### 11.2 Rekomendasi Tahap Awal

Untuk implementasi awal, gunakan pendekatan minimal tetapi desain tabel sudah menyimpan `gateway_fee`, `payment_method`, dan `gateway_payload` agar siap dikembangkan ke rekonsiliasi gateway otomatis.

---

## 12. Notifikasi dan WhatsApp

### 12.1 Internal Notification

Gunakan `createNotificationSafe` untuk:

- Invoice dibuat.
- Invoice dibayar gateway.
- Provider payment sukses/gagal.
- Invoice masuk `PENDING_REVIEW`.

### 12.2 WhatsApp Deep Link Tahap Awal

Tanpa integrasi API WhatsApp pun bisa dimulai dengan URL:

```text
https://wa.me/<phone>?text=<encoded message>
```

Template:

```text
Halo {customerName}, berikut link pembayaran tagihan Anda:
{publicUrl}

Total: Rp {grandTotal}
Berlaku sampai: {expiresAt}
```

### 12.3 Integrasi WhatsApp API Tahap Lanjut

Tambahkan provider WhatsApp resmi/third-party untuk otomatis mengirim:

- Invoice link.
- Reminder sebelum expired.
- Status pembayaran.
- Link struk digital.

---

## 13. Cron / Worker

### 13.1 Expire Invoice

```text
POST /api/cron/expire-payment-links
```

Menandai invoice yang sudah melewati `expires_at`:

```sql
UPDATE payment_invoices
SET status = 'EXPIRED'
WHERE status IN ('UNPAID','PAYMENT_PENDING')
  AND expires_at < NOW();
```

### 13.2 Process Paid Invoice

```text
POST /api/cron/process-paid-invoices
```

Memproses invoice yang gateway-nya sudah sukses tetapi provider belum diproses.

### 13.3 Gateway Status Recheck

```text
POST /api/cron/recheck-payment-links
```

Untuk invoice `PAYMENT_PENDING` yang webhook-nya terlambat, gunakan `getTransactionStatus(orderId)` dari `src/lib/midtrans.ts`.

---

## 14. Observability

Gunakan `logTransactionEventSafe` dengan event type:

- `PAYMENT_LINK_CREATED`
- `PAYMENT_LINK_SHARED`
- `PAYMENT_LINK_OPENED`
- `PAYMENT_LINK_SNAP_CREATED`
- `PAYMENT_LINK_GATEWAY_PENDING`
- `PAYMENT_LINK_GATEWAY_SUCCESS`
- `PAYMENT_LINK_GATEWAY_FAILED`
- `PAYMENT_LINK_PROVIDER_PROCESSING`
- `PAYMENT_LINK_PROVIDER_SUCCESS`
- `PAYMENT_LINK_PROVIDER_PARTIAL`
- `PAYMENT_LINK_PROVIDER_FAILED`
- `DIGITAL_RECEIPT_VIEWED`

Untuk audit log immutable, gunakan action:

- `PAYMENT_LINK_CANCELLED`
- `PAYMENT_LINK_FORCE_EXPIRED`
- `PAYMENT_LINK_MANUAL_REPROCESS`
- `DIGITAL_RECEIPT_REGENERATED`

---

## 15. File yang Disarankan Dibuat/Diubah

### 15.1 Database

```text
database/migrations/20260603_payment_links_and_digital_receipts.sql
```

### 15.2 Library

```text
src/lib/payment-links/code.ts
src/lib/payment-links/repository.ts
src/lib/payment-links/service.ts
src/lib/payment-links/provider-executor.ts
src/lib/payment-links/public-sanitizer.ts
src/lib/receipt-data.ts
```

### 15.3 API

```text
src/app/api/payment-links/route.ts
src/app/api/payment-links/[invoiceCode]/route.ts
src/app/api/payment-links/webhook/route.ts
src/app/api/public/invoices/[token]/route.ts
src/app/api/public/invoices/[token]/pay/route.ts
src/app/api/public/receipts/[receiptToken]/route.ts
src/app/api/cron/process-paid-invoices/route.ts
src/app/api/cron/expire-payment-links/route.ts
src/app/api/cron/recheck-payment-links/route.ts
```

### 15.4 UI

```text
src/app/payment-links/page.tsx
src/app/payment-links/new/page.tsx
src/app/payment-links/[invoiceCode]/page.tsx
src/app/i/[token]/page.tsx
src/app/invoice/[token]/finish/page.tsx
src/app/invoice/[token]/unfinish/page.tsx
src/app/invoice/[token]/error/page.tsx
src/app/r/[receiptToken]/page.tsx
```

### 15.5 Existing Files yang Perlu Diubah

```text
src/lib/midtrans.ts
src/ui/AppSidebar.tsx
src/ui/AppTopNav.tsx
src/lib/rbac.ts
src/app/api/pembayaran/reprint/route.ts
```

---

## 16. Tahapan Implementasi

### Phase 1 — Fondasi Payment Link

1. Buat migration `payment_invoices`, `payment_invoice_items`, `payment_invoice_events`.
2. Buat repository/service payment link.
3. Buat API internal create/list/detail/cancel invoice.
4. Buat halaman `/payment-links` dan `/payment-links/new`.

Output: kasir/admin bisa membuat payment link dan menyalin URL.

### Phase 2 — Public Invoice + Midtrans

1. Refactor `createSnapTransaction` agar callback fleksibel.
2. Buat public invoice page `/i/[token]`.
3. Buat endpoint `/api/public/invoices/[token]/pay`.
4. Buat webhook `/api/payment-links/webhook`.
5. Buat status finish/unfinish/error pages.

Output: pelanggan bisa membuka link dan membayar via Midtrans.

### Phase 3 — Provider Execution Worker

1. Buat worker `/api/cron/process-paid-invoices`.
2. Mapping invoice items ke `orchestrateMultiPayment`.
3. Update invoice status dari hasil multipay.
4. Tambahkan event dan notifikasi.

Output: pembayaran online yang sudah settlement otomatis diproses ke provider.

### Phase 4 — Struk Digital

1. Buat helper `src/lib/receipt-data.ts`.
2. Refactor reprint agar memakai helper yang sama.
3. Buat endpoint public receipt.
4. Buat halaman `/r/[receiptToken]`.
5. Tambahkan QR di struk dan invoice success page.

Output: pelanggan bisa memvalidasi struk digital via URL/QR.

### Phase 5 — Reliability & Ops

1. Buat cron expire invoice.
2. Buat cron recheck status gateway.
3. Tambahkan dashboard status invoice.
4. Tambahkan audit untuk cancel/reprocess.
5. Tambahkan rate limit endpoint publik.

Output: fitur siap operasional dengan monitoring dan fallback.

---

## 17. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Webhook dikirim berkali-kali | Unique key + status guard + idempotency key. |
| Gateway sukses tapi provider gagal | Status `FAILED_PROVIDER`, notifikasi admin, siapkan refund/dispute. |
| Webhook timeout saat provider lambat | Gunakan worker `process-paid-invoices`, bukan eksekusi langsung di webhook. |
| Link publik ditebak | Token random 64 hex, bukan ID incremental. |
| Nominal berubah setelah inquiry | Simpan snapshot invoice immutable. |
| Struk palsu | Receipt token + halaman validasi resmi + QR. |
| Data pelanggan bocor | Sanitizer dan masking endpoint publik. |
| Settlement gateway selisih | Simpan gateway payload, payment method, fee untuk rekonsiliasi tahap lanjut. |

---

## 18. Minimum Viable Product (MVP)

Jika ingin implementasi tercepat, MVP yang disarankan:

1. Tabel `payment_invoices` dan `payment_invoice_items`.
2. API create invoice internal.
3. Halaman public invoice `/i/[token]`.
4. Midtrans Snap payment.
5. Webhook update status gateway.
6. Worker proses provider.
7. Public receipt `/r/[receiptToken]`.

Fitur yang bisa ditunda:

- WhatsApp API otomatis.
- Rekonsiliasi gateway otomatis.
- Refund/dispute UI.
- QR library jika awalnya cukup tampilkan link struk.
- Dashboard analytics khusus payment link.

---

## 19. Rekomendasi Urutan Coding

Urutan teknis paling aman:

1. Migration database.
2. `src/lib/payment-links/*` repository/service.
3. API internal payment links.
4. UI internal sederhana.
5. Public invoice read-only.
6. Refactor `src/lib/midtrans.ts` callback fleksibel.
7. Public pay endpoint dan webhook.
8. Worker provider execution.
9. Receipt data helper.
10. Public receipt page.
11. Audit, notification, rate limit, cron expiry.

---

## 20. Kesimpulan

Fitur **Payment Link + Struk Digital** sangat cocok untuk dikembangkan pada aplikasi ini karena sebagian besar fondasinya sudah tersedia:

- Midtrans Snap dan webhook sudah ada untuk top-up.
- Multi-payment core sudah menyimpan transaksi utama.
- Formatter struk sudah mendukung banyak produk.
- Audit log, notifikasi, monitoring, dan GL sudah tersedia.

Pendekatan terbaik adalah menambahkan layer `payment_invoices` sebagai invoice publik, lalu setelah gateway sukses, sistem memproses provider payment melalui orchestrator multipay existing. Struk digital kemudian dibuat dari hasil `multi_payment_requests/items` dengan token validasi publik.
