# Konfigurasi Fitur Payment Link & Struk Digital

Dokumen ini berisi langkah konfigurasi operasional untuk fitur **Payment Link / Invoice Online** dan **Struk Digital** yang sudah diimplementasikan pada aplikasi.

---

## 1. Ringkasan Fitur

Fitur ini menyediakan alur:

```text
Kasir/Admin membuat payment link
        ↓
Pelanggan membuka invoice publik /i/[token]
        ↓
Pelanggan membayar via Midtrans Snap
        ↓
Midtrans mengirim webhook ke aplikasi
        ↓
Invoice berubah menjadi PAID_GATEWAY
        ↓
Cron worker memproses pembayaran ke provider via multipay
        ↓
Struk digital tersedia di /r/[receiptToken]
```

---

## 2. File dan Route Penting

### 2.1 Halaman UI

| Halaman | Fungsi |
|---|---|
| `/payment-links` | Halaman internal untuk membuat dan memonitor payment link. |
| `/i/[token]` | Halaman invoice publik untuk pelanggan. |
| `/r/[receiptToken]` | Halaman struk digital publik. |
| `/invoice/[token]/finish` | Halaman redirect sukses dari Midtrans. |
| `/invoice/[token]/unfinish` | Halaman redirect pembayaran belum selesai. |
| `/invoice/[token]/error` | Halaman redirect pembayaran gagal/error. |

### 2.2 API

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/payment-links` | List invoice payment link internal. |
| `POST` | `/api/payment-links` | Membuat payment link baru. |
| `GET` | `/api/payment-links/[invoiceCode]` | Detail invoice internal. |
| `PATCH` | `/api/payment-links/[invoiceCode]` | Cancel invoice internal. |
| `GET` | `/api/public/invoices/[token]` | Ambil detail invoice publik. |
| `POST` | `/api/public/invoices/[token]/pay` | Membuat/membuka transaksi Snap Midtrans. |
| `POST` | `/api/payment-links/webhook` | Webhook Midtrans untuk payment link. |
| `GET` | `/api/public/receipts/[receiptToken]` | Ambil data struk digital publik. |
| `POST` | `/api/cron/process-paid-invoices` | Worker proses invoice yang sudah dibayar gateway ke provider. |
| `POST` | `/api/cron/expire-payment-links` | Worker menandai invoice expired. |

---

## 3. Migrasi Database

Migration yang ditambahkan:

```text
database/migrations/20260603_payment_links_and_digital_receipts.sql
```

Tabel yang dibuat:

- `payment_invoices`
- `payment_invoice_items`
- `payment_invoice_events`

Jalankan migrasi:

```bash
npm run migrate
```

Pastikan koneksi database di `.env` sudah benar sebelum menjalankan migrasi.

---

## 4. Environment Variable

Tambahkan/cek konfigurasi berikut di `.env`:

```env
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=pedami_payment

# URL publik aplikasi.
# Wajib di production agar callback Midtrans dan link invoice/struk memakai domain yang benar.
APP_PUBLIC_URL=https://domain-kamu.com

# Jika APP_PUBLIC_URL tidak diset, aplikasi fallback ke NEXTAUTH_URL.
NEXTAUTH_URL=https://domain-kamu.com

# Midtrans
MIDTRANS_SERVER_KEY=isi-server-key-midtrans
MIDTRANS_CLIENT_KEY=isi-client-key-midtrans
MIDTRANS_IS_PRODUCTION=false

# Secret untuk cron/worker.
# Gunakan string acak panjang, minimal 32 karakter.
CRON_SECRET=isi-random-secret-panjang
```

### Catatan `APP_PUBLIC_URL`

`APP_PUBLIC_URL` sangat penting karena dipakai untuk:

- URL callback Midtrans:
  - `/invoice/[token]/finish`
  - `/invoice/[token]/unfinish`
  - `/invoice/[token]/error`
- URL invoice publik.
- URL struk digital.

Contoh lokal menggunakan ngrok:

```env
APP_PUBLIC_URL=https://abc123.ngrok-free.app
NEXTAUTH_URL=http://localhost:3000
```

Gunakan `APP_PUBLIC_URL` untuk domain publik, dan jangan mengubah `NEXTAUTH_URL` sembarangan jika bisa memengaruhi cookie auth.

---

## 5. Konfigurasi Midtrans

### 5.1 Ambil Key Midtrans

Di dashboard Midtrans:

1. Buka **Settings → Access Keys**.
2. Salin:
   - `Server Key` → `MIDTRANS_SERVER_KEY`
   - `Client Key` → `MIDTRANS_CLIENT_KEY`

Untuk sandbox:

```env
MIDTRANS_IS_PRODUCTION=false
```

Untuk production:

```env
MIDTRANS_IS_PRODUCTION=true
```

### 5.2 Set Payment Notification URL

Di dashboard Midtrans, set URL webhook/payment notification ke:

```text
https://domain-kamu.com/api/payment-links/webhook
```

Untuk lokal dengan ngrok:

```text
https://abc123.ngrok-free.app/api/payment-links/webhook
```

### 5.3 Callback Redirect URL

Callback Snap dikirim otomatis oleh aplikasi saat membuat transaksi:

```text
finish   → https://domain-kamu.com/invoice/[token]/finish
unfinish → https://domain-kamu.com/invoice/[token]/unfinish
error    → https://domain-kamu.com/invoice/[token]/error
```

Tidak perlu hardcode di dashboard untuk callback ini selama request Snap berhasil.

---

## 6. Konfigurasi Cron / Worker

Webhook Midtrans hanya menandai invoice sebagai `PAID_GATEWAY`. Pembayaran ke provider dilakukan oleh worker agar webhook tidak timeout.

### 6.1 Process Paid Invoices

Endpoint:

```text
POST /api/cron/process-paid-invoices
```

Contoh manual:

```bash
curl -X POST "https://domain-kamu.com/api/cron/process-paid-invoices" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Dengan limit:

```bash
curl -X POST "https://domain-kamu.com/api/cron/process-paid-invoices?limit=20" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Rekomendasi jadwal:

```cron
*/1 * * * * curl -fsS -X POST -H "X-Cron-Secret: GANTI_SECRET" \
  https://domain-kamu.com/api/cron/process-paid-invoices \
  >> /var/log/payment-link-worker.log 2>&1
```

### 6.2 Expire Payment Links

Endpoint:

```text
POST /api/cron/expire-payment-links
```

Contoh manual:

```bash
curl -X POST "https://domain-kamu.com/api/cron/expire-payment-links" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Rekomendasi jadwal:

```cron
*/5 * * * * curl -fsS -X POST -H "X-Cron-Secret: GANTI_SECRET" \
  https://domain-kamu.com/api/cron/expire-payment-links \
  >> /var/log/payment-link-expire.log 2>&1
```

---

## 7. Cara Membuat Payment Link

### 7.1 Dari UI

1. Login sebagai `admin`, `supervisor`, atau `kasir`.
2. Buka menu **Operasional → Payment Link** atau route:

   ```text
   /payment-links
   ```

3. Isi data pelanggan:
   - Nama pelanggan.
   - Nomor WhatsApp.
   - Masa berlaku invoice.

4. Isi **Item Tagihan JSON**.

Saat ini UI MVP menerima item dalam bentuk JSON agar fleksibel untuk semua produk. Contoh:

```json
[
  {
    "provider": "LUNASIN",
    "serviceType": "PLN_POSTPAID",
    "customerId": "12345678901",
    "customerName": "Nama Pelanggan",
    "productCode": "pln-postpaid",
    "providerRef": "ID_TRX_HASIL_INQUIRY",
    "periodLabel": "202606",
    "amount": 150000,
    "adminFee": 3000,
    "total": 153000,
    "metadata": {
      "idTrx": "ID_TRX_HASIL_INQUIRY",
      "jumBill": "1"
    },
    "inquirySnapshot": {}
  }
]
```

5. Klik **Generate Payment Link**.
6. Salin link yang muncul, lalu kirim ke pelanggan.

### 7.2 Dari API

Endpoint:

```text
POST /api/payment-links
```

Contoh payload:

```json
{
  "idempotencyKey": "uuid-atau-key-unik",
  "customerName": "Budi",
  "customerPhone": "62812xxxx",
  "expiresInMinutes": 1440,
  "items": [
    {
      "provider": "LUNASIN",
      "serviceType": "PLN_POSTPAID",
      "customerId": "12345678901",
      "customerName": "Budi",
      "productCode": "pln-postpaid",
      "providerRef": "ID_TRX_HASIL_INQUIRY",
      "periodLabel": "202606",
      "amount": 150000,
      "adminFee": 3000,
      "total": 153000,
      "metadata": {
        "idTrx": "ID_TRX_HASIL_INQUIRY",
        "jumBill": "1"
      },
      "inquirySnapshot": {}
    }
  ]
}
```

Response sukses:

```json
{
  "success": true,
  "invoiceId": 1,
  "invoiceCode": "INV-20260603-ABC123",
  "publicToken": "...",
  "receiptToken": "...",
  "expiresAt": "2026-06-04T01:00:00.000Z",
  "publicUrl": "https://domain-kamu.com/i/..."
}
```

---

## 8. Cara Pelanggan Membayar

1. Pelanggan membuka link:

   ```text
   https://domain-kamu.com/i/[publicToken]
   ```

2. Pelanggan klik **Bayar Sekarang**.
3. Sistem membuat transaksi Midtrans Snap.
4. Pelanggan diarahkan ke halaman pembayaran Midtrans.
5. Setelah pembayaran, Midtrans akan:
   - Redirect pelanggan ke halaman finish/unfinish/error.
   - Mengirim webhook ke `/api/payment-links/webhook`.

Status final tetap mengikuti webhook/cek server, bukan redirect browser.

---

## 9. Lifecycle Status Invoice

| Status | Arti |
|---|---|
| `UNPAID` | Invoice dibuat, belum ada pembayaran gateway. |
| `PAYMENT_PENDING` | Snap Midtrans sudah dibuat / pelanggan sedang proses bayar. |
| `PAID_GATEWAY` | Gateway sukses, dana diterima, provider belum diproses. |
| `PROCESSING_PROVIDER` | Worker sedang memproses pembayaran ke provider. |
| `SUCCESS` | Semua item sukses dibayar ke provider. |
| `PARTIAL_SUCCESS` | Sebagian item sukses. |
| `PENDING_REVIEW` | Ada item pending/advice/perlu pengecekan. |
| `FAILED_PROVIDER` | Gateway sukses, tetapi provider gagal. Perlu penanganan manual/refund. |
| `EXPIRED` | Invoice kedaluwarsa. |
| `CANCELLED` | Invoice dibatalkan internal. |

---

## 10. Struk Digital

Jika provider payment sudah selesai dengan status:

- `SUCCESS`
- `PARTIAL_SUCCESS`
- `PENDING_REVIEW`

maka struk digital tersedia di:

```text
https://domain-kamu.com/r/[receiptToken]
```

Struk digital menampilkan:

- Badge valid.
- Nomor invoice.
- Nomor multipay.
- Data pelanggan.
- Loket.
- Metode pembayaran.
- Item pembayaran.
- Ref provider / token PLN jika tersedia.
- Total tagihan dan admin.

---

## 11. Cara Uji End-to-End

### 11.1 Persiapan

1. Jalankan migration:

   ```bash
   npm run migrate
   ```

2. Pastikan `.env` sudah berisi Midtrans sandbox dan `APP_PUBLIC_URL`.
3. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

4. Jika lokal, expose ke internet dengan ngrok/cloudflared agar Midtrans bisa mengirim webhook.

### 11.2 Uji Create Invoice

1. Login.
2. Buka:

   ```text
   http://localhost:3000/payment-links
   ```

3. Buat payment link.
4. Buka link publik yang dihasilkan.

### 11.3 Uji Pembayaran

1. Klik **Bayar Sekarang**.
2. Selesaikan pembayaran di Midtrans sandbox.
3. Pastikan webhook masuk.
4. Cek status invoice di `/payment-links`.

Jika sudah `PAID_GATEWAY`, jalankan worker:

```bash
curl -X POST "http://localhost:3000/api/cron/process-paid-invoices" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Untuk development tanpa `CRON_SECRET`, endpoint cron lokal boleh dipanggil dari localhost.

### 11.4 Uji Struk

Setelah status menjadi `SUCCESS`, buka:

```text
/r/[receiptToken]
```

Atau klik link **Struk** di halaman `/payment-links`.

---

## 12. Troubleshooting

### 12.1 Invoice tidak bisa bayar / Snap error

Cek:

- `MIDTRANS_SERVER_KEY` benar.
- `MIDTRANS_IS_PRODUCTION` sesuai environment.
- `APP_PUBLIC_URL` valid dan bisa diakses publik.
- Nominal `grand_total` lebih dari 0.

### 12.2 Webhook tidak masuk

Cek:

- URL webhook di dashboard Midtrans:

  ```text
  https://domain-kamu.com/api/payment-links/webhook
  ```

- Domain bisa diakses dari internet.
- Log aplikasi untuk error `Invalid signature`.
- Pastikan `MIDTRANS_SERVER_KEY` sama dengan environment yang dipakai transaksi.

### 12.3 Status berhenti di `PAID_GATEWAY`

Artinya webhook gateway sukses, tetapi worker belum memproses provider.

Jalankan:

```bash
curl -X POST "https://domain-kamu.com/api/cron/process-paid-invoices" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Jika masih gagal, cek response worker dan log aplikasi.

### 12.4 Status `FAILED_PROVIDER`

Artinya pembayaran online berhasil, tetapi pembayaran ke provider gagal.

Langkah operasional:

1. Cek detail invoice di `/payment-links`.
2. Cek event/provider log di monitoring.
3. Tentukan apakah perlu retry manual, advice, atau refund.

### 12.5 Struk belum tersedia

Struk hanya tersedia setelah invoice memiliki hasil multipay.

Jika masih `UNPAID`, `PAYMENT_PENDING`, `PAID_GATEWAY`, atau `PROCESSING_PROVIDER`, halaman struk akan menampilkan pesan bahwa struk belum tersedia.

---

## 13. Catatan Keamanan

- Jangan membagikan `CRON_SECRET`.
- Gunakan token random public URL, bukan ID invoice biasa.
- Jangan menerima status sukses dari redirect browser; status final harus dari webhook atau status check gateway.
- Pastikan webhook signature Midtrans aktif dan server key benar.
- Endpoint public hanya menampilkan data yang sudah disanitasi.

---

## 14. Catatan Pengembangan Lanjutan

Fitur MVP saat ini sudah berjalan, tetapi beberapa pengembangan lanjutan yang disarankan:

1. Integrasi langsung dari cart multipay ke payment link, agar kasir tidak perlu mengisi JSON manual.
2. QR Code pada halaman invoice dan struk.
3. WhatsApp API otomatis untuk kirim invoice dan struk.
4. Modul refund/dispute jika `FAILED_PROVIDER`.
5. Rekonsiliasi settlement Midtrans otomatis.
6. Dashboard khusus payment link: conversion rate, paid rate, expired rate, dan gagal provider.
