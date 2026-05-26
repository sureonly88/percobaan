# Cron Rekonsiliasi PDAM — Kirim Email Otomatis

Sistem ini men-generate file Excel rekonsiliasi PDAM Native setiap hari dan mengirimkannya ke email yang dituju secara otomatis.

---

## 1. Konfigurasi `.env`

Tambahkan / isi variabel berikut di file `.env`:

```env
# === Email / SMTP untuk Rekonsiliasi Otomatis ===
SMTP_HOST=smtp.gmail.com        # host SMTP provider Anda
SMTP_PORT=587                   # 587 untuk TLS, 465 untuk SSL
SMTP_SECURE=false               # true jika pakai port 465
SMTP_USER=your@gmail.com        # akun email pengirim
SMTP_PASS=your-app-password     # password / app password
REKON_EMAIL_FROM=Portal Utilitas <your@gmail.com>  # nama & alamat pengirim
REKON_EMAIL_TO=tujuan@email.com # penerima (pisah koma untuk beberapa alamat)
```

### Catatan Gmail (paling umum dipakai)

Gmail memblokir login langsung — gunakan **App Password**:

1. Buka [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Aktifkan **2-Step Verification** (wajib)
3. Buka [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Pilih **Mail** → **Other (Custom name)** → ketik `Portal Utilitas`
5. Salin password 16 karakter yang dihasilkan → isi ke `SMTP_PASS`

### Contoh konfigurasi provider lain

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE |
|---|---|---|---|
| Gmail | smtp.gmail.com | 587 | false |
| Outlook / Hotmail | smtp-mail.outlook.com | 587 | false |
| Yahoo Mail | smtp.mail.yahoo.com | 465 | true |
| Mailtrap (testing) | sandbox.smtp.mailtrap.io | 2525 | false |
| SendGrid | smtp.sendgrid.net | 587 | false |

Untuk **beberapa penerima**, pisahkan dengan koma:
```env
REKON_EMAIL_TO=finance@perusahaan.com,manager@perusahaan.com
```

---

## 2. Setup Crontab (Linux / macOS)

Jalankan rekonsiliasi otomatis setiap hari pada jam 01:00 dini hari:

```bash
crontab -e
```

Tambahkan baris berikut (ganti `<CRON_SECRET>` dengan nilai `CRON_SECRET` di `.env`):

```bash
# Rekonsiliasi PDAM — setiap hari jam 01:00
0 1 * * * curl -fsS -X POST \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  http://localhost:3000/api/cron/rekon-pdam-email \
  >> /var/log/portal-cron.log 2>&1
```

Cek jadwal yang aktif:
```bash
crontab -l
```

---

## 3. Setup systemd Timer (Production / Server)

Buat dua file berikut di server:

**`/etc/systemd/system/portal-rekon-pdam.service`**
```ini
[Unit]
Description=Portal Rekonsiliasi PDAM — Generate & Kirim Email

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "X-Cron-Secret: GANTI_INI" \
  http://localhost:3000/api/cron/rekon-pdam-email
```

**`/etc/systemd/system/portal-rekon-pdam.timer`**
```ini
[Unit]
Description=Jalankan rekonsiliasi PDAM setiap hari jam 01:00

[Timer]
OnCalendar=*-*-* 01:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Aktifkan:
```bash
systemctl daemon-reload
systemctl enable --now portal-rekon-pdam.timer

# Cek status
systemctl list-timers portal-rekon-pdam.timer
```

---

## 4. Trigger Manual / Test

```bash
# Kirim data kemarin (default)
curl -X POST http://localhost:3000/api/cron/rekon-pdam-email \
     -H "X-Cron-Secret: <CRON_SECRET>"

# Override tanggal tertentu
curl -X POST "http://localhost:3000/api/cron/rekon-pdam-email?date=2026-05-25" \
     -H "X-Cron-Secret: <CRON_SECRET>"

# Filter loket tertentu
curl -X POST "http://localhost:3000/api/cron/rekon-pdam-email?date=2026-05-25&loketCode=LKT-001" \
     -H "X-Cron-Secret: <CRON_SECRET>"
```

Response sukses:
```json
{
  "ok": true,
  "summary": {
    "date": "2026-05-25",
    "filename": "rekonsiliasi_pdam_native_2026-05-25.xls",
    "emailTo": "tujuan@email.com",
    "sentAt": "2026-05-26T01:00:05.123Z"
  }
}
```

---

## 5. File yang Terlibat

| File | Keterangan |
|---|---|
| `src/lib/mailer.ts` | Nodemailer transporter & fungsi `sendMail` |
| `src/lib/jobs/rekon-pdam-email.ts` | Logic job: generate Excel + kirim email |
| `src/app/api/cron/rekon-pdam-email/route.ts` | Endpoint HTTP cron dengan job lock |
| `.env` | Konfigurasi SMTP dan alamat email |

---

## 6. Keamanan

- Endpoint dilindungi header `X-Cron-Secret` — tanpa secret yang benar akan ditolak (401)
- Job lock (`system_jobs`) mencegah double-run bila cron terpicu dua kali bersamaan
- Nilai `SMTP_PASS` tidak boleh di-commit ke Git — pastikan `.env` ada di `.gitignore`
