# Fitur Self-Service, Payment Link, dan Struk Digital

Dokumen ini menjelaskan fitur terbaru untuk alur pelanggan mandiri: cek tagihan publik, pembuatan invoice online, pembayaran via Midtrans, pemrosesan ke provider, dan validasi struk digital.

## 1. Ringkasan

Fitur ini membuat aplikasi tidak hanya dipakai kasir internal, tetapi juga bisa dipakai pelanggan secara langsung melalui halaman publik.

Alur besarnya:

```text
Pelanggan buka /cek-tagihan
        ↓
Pelanggan pilih layanan dan input nomor pelanggan
        ↓
Sistem inquiry ke provider
        ↓
Pelanggan membuat invoice online
        ↓
Pelanggan bayar via Midtrans Snap
        ↓
Webhook Midtrans mengubah invoice menjadi PAID_GATEWAY
        ↓
Cron process-paid-invoices memproses pembayaran ke provider
        ↓
Invoice menjadi SUCCESS / PARTIAL_SUCCESS / PENDING_REVIEW / FAILED_PROVIDER
        ↓
Struk digital tersedia di /r/[receiptToken]
```

## 2. Route Utama

| Route | Akses | Fungsi |
|---|---|---|
| `/cek-tagihan` | Publik | Pelanggan cek tagihan dan membuat invoice online. |
| `/i/[token]` | Publik | Halaman invoice online untuk pelanggan. |
| `/r/[receiptToken]` | Publik | Halaman struk digital dan validasi QR. |
| `/payment-links` | Login | Dashboard internal payment link. |
| `/pembayaran` | Login | Kasir cek tagihan dan membuat payment link dari hasil inquiry. |

## 3. API Utama

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/public/self-service/inquiry` | Cek tagihan publik dari halaman `/cek-tagihan`. |
| `POST` | `/api/public/self-service/payment-link` | Membuat invoice online dari hasil self-service. |
| `GET` | `/api/public/invoices/[token]` | Mengambil data invoice publik. |
| `POST` | `/api/public/invoices/[token]/pay` | Membuat/membuka transaksi Midtrans Snap. |
| `POST` | `/api/payment-links/webhook` | Webhook notifikasi Midtrans untuk payment link. |
| `GET` | `/api/public/receipts/[receiptToken]` | Mengambil data struk digital. |
| `POST` | `/api/cron/process-paid-invoices` | Worker proses invoice yang sudah dibayar gateway ke provider. |
| `POST` | `/api/cron/expire-payment-links` | Worker menandai invoice kedaluwarsa. |

## 4. Layanan Self-Service Yang Didukung

Halaman `/cek-tagihan` saat ini mendukung:

| Layanan | Provider | Keterangan |
|---|---|---|
| PDAM | PDAM native | Menggunakan API PDAM lama. |
| PLN Pascabayar | Lunasin | Menggunakan kode produk `pln-postpaid-[tier]`. |
| PLN Prabayar / Token | Lunasin | Menggunakan kode produk `pln-prepaid-[tier]` dan pilihan nominal token. |
| PLN Non-Rekening | Lunasin | Menggunakan kode produk `pln-nonrek-[tier]`. |
| BPJS Kesehatan | Lunasin | Menggunakan kode produk `bpjs-kesehatan`. |
| Telkom | Lunasin | Menggunakan kode produk `telkom-telepon`. |
| PDAM Banjarmasin | Lunasin | Menggunakan kode produk `pdam-kota-banjarmasin`. |
| Pulsa | Lunasin | Pelanggan memilih operator dan nominal. |
| Paket Data | Lunasin | Pelanggan memilih operator dan paket data dari katalog produk. |

## 5. Konfigurasi Environment

Tambahkan atau cek konfigurasi berikut di `.env`:

```env
# Domain publik aplikasi. Wajib benar di production.
APP_PUBLIC_URL=https://domain-kamu.com

# Loket default untuk transaksi self-service publik.
SELF_SERVICE_LOKET_CODE=LKT-001

# Alternatif lama jika SELF_SERVICE_LOKET_CODE tidak diset.
PUBLIC_PAYMENT_LOKET_CODE=LKT-001

# Secret cron/worker.
CRON_SECRET=isi-secret-panjang

# Midtrans.
MIDTRANS_SERVER_KEY=isi-server-key
MIDTRANS_CLIENT_KEY=isi-client-key
MIDTRANS_IS_PRODUCTION=false
```

### 5.1 `SELF_SERVICE_LOKET_CODE`

`SELF_SERVICE_LOKET_CODE` berisi `loket_code` dari tabel `lokets`.

Contoh:

```env
SELF_SERVICE_LOKET_CODE=LKT-001
```

Kode ini dipakai untuk:

- nama loket di invoice online
- biaya admin PDAM
- tier admin PLN
- batas maksimal tagihan PDAM jika ada
- pencatatan transaksi online self-service

Jika tidak diisi, sistem memakai loket aktif pertama di database. Untuk production, lebih aman membuat loket khusus seperti `ONLINE` dan mengisi:

```env
SELF_SERVICE_LOKET_CODE=ONLINE
```

Pastikan loket tersebut ada di tabel `lokets`.

## 6. Alur Self-Service Publik

1. Pelanggan membuka `/cek-tagihan`.
2. Pelanggan memilih layanan, misalnya PDAM, PLN Pascabayar, PLN Token, Pulsa, atau Paket Data.
3. Pelanggan memasukkan nomor pelanggan.
4. Jika layanan membutuhkan pilihan produk, pelanggan memilih nominal token, operator pulsa, nominal pulsa, atau paket data.
5. Frontend memanggil `POST /api/public/self-service/inquiry`.
6. API melakukan rate limit berbasis IP.
7. API membaca konfigurasi loket dari `SELF_SERVICE_LOKET_CODE`.
8. API inquiry ke provider sesuai layanan.
9. API mengembalikan ringkasan tagihan ke frontend.
10. Pelanggan mengisi nama/WhatsApp/email opsional.
11. Pelanggan klik `Buat Invoice & Bayar`.
12. Frontend memanggil `POST /api/public/self-service/payment-link`.
13. Sistem membuat record `payment_invoices` dan `payment_invoice_items`.
14. Pelanggan diarahkan ke invoice publik `/i/[token]`.

## 7. Alur Payment Link Dari Kasir

1. Kasir membuka `/pembayaran`.
2. Kasir melakukan inquiry tagihan seperti biasa.
3. Sistem membentuk cart tagihan aktif.
4. Kasir klik `Buat Payment Link dari Hasil Inquiry`.
5. Sistem membuat invoice online dari cart tersebut.
6. Link invoice bisa disalin dan dikirim ke pelanggan.
7. Pelanggan membuka `/i/[token]` dan membayar.

## 8. Alur Pembayaran Invoice

1. Pelanggan membuka `/i/[token]`.
2. Pelanggan klik `Bayar Sekarang`.
3. Frontend memanggil `POST /api/public/invoices/[token]/pay`.
4. Sistem membuat transaksi Midtrans Snap.
5. Pelanggan diarahkan ke halaman pembayaran Midtrans.
6. Setelah pembayaran, Midtrans mengirim webhook ke `/api/payment-links/webhook`.
7. Webhook diverifikasi dengan signature Midtrans.
8. Jika nominal sesuai dan status sukses, invoice berubah menjadi `PAID_GATEWAY`.

Penting: `PAID_GATEWAY` berarti dana gateway sudah diterima, tetapi tagihan provider belum tentu terbayar. Pembayaran ke provider dilakukan oleh worker berikutnya.

## 9. Worker Provider

Worker `process-paid-invoices` memproses invoice yang sudah dibayar gateway.

Endpoint:

```text
POST /api/cron/process-paid-invoices
```

Contoh pemanggilan:

```bash
curl -X POST https://domain-kamu.com/api/cron/process-paid-invoices \
  -H "X-Cron-Secret: isi-secret"
```

Disarankan dijalankan tiap 1 sampai 5 menit.

Contoh crontab:

```bash
*/2 * * * * curl -fsS -X POST -H "X-Cron-Secret: isi-secret" \
  https://domain-kamu.com/api/cron/process-paid-invoices \
  >> /var/log/portal-process-paid-invoices.log 2>&1
```

Status hasil proses:

| Status | Arti |
|---|---|
| `SUCCESS` | Semua item berhasil dibayar ke provider. |
| `PARTIAL_SUCCESS` | Sebagian item berhasil, sebagian gagal. |
| `PENDING_REVIEW` | Ada item pending/advice dan perlu ditinjau. |
| `FAILED_PROVIDER` | Dana gateway masuk, tetapi provider gagal. |

## 10. Worker Expire Payment Link

Endpoint:

```text
POST /api/cron/expire-payment-links
```

Fungsi: mengubah invoice `UNPAID` atau `PAYMENT_PENDING` yang melewati `expires_at` menjadi `EXPIRED`.

Contoh crontab:

```bash
*/10 * * * * curl -fsS -X POST -H "X-Cron-Secret: isi-secret" \
  https://domain-kamu.com/api/cron/expire-payment-links \
  >> /var/log/portal-expire-payment-links.log 2>&1
```

## 11. Struk Digital

Struk digital tersedia di:

```text
/r/[receiptToken]
```

Struk hanya tersedia jika:

- invoice berstatus `SUCCESS`, `PARTIAL_SUCCESS`, atau `PENDING_REVIEW`
- invoice sudah memiliki `multi_payment_code`

Halaman struk menampilkan:

- status validasi
- nomor invoice
- kode multipayment
- data pelanggan
- loket
- metode pembayaran
- item transaksi
- QR validasi struk
- tombol cetak/simpan PDF

## 12. QR dan Cetak Struk

Formatter struk sekarang mendukung field:

```ts
digitalReceiptUrl?: string
```

Jika payload cetak membawa `digitalReceiptUrl`, formatter akan menambahkan bagian validasi struk digital.

Untuk print bridge ESC/P, yang dicetak adalah URL validasi karena printer dot matrix/ESC-P tidak otomatis menghasilkan QR bitmap.

Untuk fallback browser print, sistem menampilkan QR image menggunakan URL validasi tersebut.

## 13. Dashboard Payment Link

Halaman internal:

```text
/payment-links
```

Fitur yang tersedia:

- daftar invoice
- filter status
- pencarian invoice/pelanggan/loket
- detail invoice
- detail item tagihan
- timeline event invoice
- buka invoice publik
- buka struk digital
- cancel invoice untuk status `UNPAID` dan `PAYMENT_PENDING`
- link ke halaman self-service publik

## 14. Status Invoice

Status utama invoice:

```text
UNPAID
PAYMENT_PENDING
PAID_GATEWAY
PROCESSING_PROVIDER
SUCCESS
PARTIAL_SUCCESS
PENDING_REVIEW
FAILED_PROVIDER
EXPIRED
CANCELLED
```

Penjelasan penting:

| Status | Arti |
|---|---|
| `UNPAID` | Invoice dibuat, belum ada pembayaran gateway. |
| `PAYMENT_PENDING` | Snap Midtrans sudah dibuat atau pembayaran sedang berjalan. |
| `PAID_GATEWAY` | Dana sudah diterima gateway, provider belum diproses. |
| `PROCESSING_PROVIDER` | Worker sedang memproses pembayaran ke provider. |
| `SUCCESS` | Semua pembayaran provider sukses. |
| `PARTIAL_SUCCESS` | Sebagian item sukses. |
| `PENDING_REVIEW` | Ada item pending/advice. |
| `FAILED_PROVIDER` | Gateway sukses, provider gagal. Perlu dispute/refund di fase berikutnya. |
| `EXPIRED` | Invoice kedaluwarsa. |
| `CANCELLED` | Invoice dibatalkan admin/kasir. |

## 15. Keamanan

Fitur publik memiliki beberapa pengaman:

- `/cek-tagihan`, `/i/[token]`, dan `/r/[receiptToken]` bisa dibuka tanpa login.
- Token invoice dan struk memakai token acak panjang.
- API self-service memakai rate limit in-memory berbasis IP.
- Webhook Midtrans memverifikasi signature.
- Nominal webhook harus sama dengan `grand_total` invoice.
- Data publik invoice disanitasi, misalnya nomor HP dimasking.

Catatan: rate limit in-memory hanya berlaku per instance aplikasi. Jika deployment multi-instance, sebaiknya ganti ke Redis agar rate limit global.

## 16. Catatan Operasional

Checklist production:

1. Pastikan migration payment link sudah dijalankan.
2. Pastikan `APP_PUBLIC_URL` mengarah ke domain publik yang benar.
3. Pastikan `SELF_SERVICE_LOKET_CODE` terisi dan loketnya ada.
4. Pastikan Payment Notification URL Midtrans mengarah ke `/api/payment-links/webhook`.
5. Pastikan cron `process-paid-invoices` aktif.
6. Pastikan cron `expire-payment-links` aktif.
7. Uji alur sandbox Midtrans dari `/cek-tagihan` sampai `/r/[receiptToken]`.

## 17. Batasan Saat Ini

- Pengiriman link invoice/struk via WhatsApp/SMS/email belum otomatis.
- Refund/dispute untuk `FAILED_PROVIDER` sudah tersedia sebagai workflow operasional manual di `/payment-links/disputes`; refund otomatis ke gateway belum diterapkan.
- QR pada printer ESC/P belum berupa bitmap native, tetapi URL validasi sudah dicetak.
- Pemrosesan provider setelah gateway sukses bergantung pada cron `process-paid-invoices`.

## 18. File Implementasi Penting

| File | Fungsi |
|---|---|
| `src/app/cek-tagihan/page.tsx` | UI self-service publik. |
| `src/app/api/public/self-service/inquiry/route.ts` | API cek tagihan publik. |
| `src/app/api/public/self-service/payment-link/route.ts` | API buat invoice dari self-service. |
| `src/lib/payment-links/self-service.ts` | Helper inquiry dan mapping item self-service. |
| `src/app/payment-links/page.tsx` | Dashboard internal payment link. |
| `src/app/payment-links/disputes/page.tsx` | Dashboard refund/dispute invoice gagal provider. |
| `src/app/api/payment-links/disputes/route.ts` | API daftar dan update kasus refund/dispute. |
| `src/lib/payment-links/disputes.ts` | Repository/helper workflow refund/dispute. |
| `src/lib/payment-links/service.ts` | Logic create invoice, Snap, webhook, proses provider. |
| `src/lib/payment-links/repository.ts` | Query database invoice, item, event. |
| `src/lib/receipt-data.ts` | Builder data struk digital. |
| `src/app/r/[receiptToken]/page.tsx` | UI struk digital publik. |
| `src/lib/print-receipt.ts` | Formatter struk aplikasi. |
| `print-bridge/formatter.js` | Formatter struk print bridge. |
| `middleware.ts` | Public route server-side. |
| `src/ui/AppShell.tsx` | Public route client-side. |
