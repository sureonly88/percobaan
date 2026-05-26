# Setup Print Bridge

Print bridge adalah server Node.js kecil yang berjalan di **komputer kasir** secara lokal. Tugasnya menerima data struk dari browser dan mengirimkannya ke printer dot matrix (Epson LX-310 / LX-350) via ESC/P.

---

## Kenapa perlu HTTPS?

Jika aplikasi dihosting di server eksternal (URL `https://...`), browser secara ketat melarang halaman HTTPS melakukan request ke endpoint HTTP — termasuk IP lokal seperti `http://192.168.x.x:6789`. Satu-satunya solusi andal adalah menjalankan print bridge dengan HTTPS menggunakan self-signed certificate.

| Kondisi | `http://localhost:6789` | `http://192.168.x.x:6789` | `https://localhost:6789` |
|---|---|---|---|
| App HTTP (dev lokal) | ✓ | ✓ | ✓ |
| App HTTPS, Chrome | ⚠️ kadang jalan | ✗ blokir | ✓ |
| App HTTPS, Firefox | ✗ blokir | ✗ blokir | ✓ |
| App HTTPS, Safari | ✗ blokir | ✗ blokir | ✓ |

---

## Langkah Setup (Windows — komputer kasir)

### 1. Install Node.js
Download Node.js ≥ 18 LTS dari https://nodejs.org dan install.

### 2. Salin folder `print-bridge`
Salin seluruh folder `print-bridge` dari project ke komputer kasir, misalnya ke `C:\pedami\print-bridge`.

### 3. Konfigurasi printer
Edit `config.json`, sesuaikan nama printer:
```json
{
  "printerName": "EPSON LX-310",
  "printMode": "ps",
  "port": 6789
}
```
Nama printer harus **persis** sama seperti yang muncul di Windows Settings → Printers & scanners.

### 4. Generate sertifikat TLS (wajib untuk app HTTPS)
Klik kanan `gen-cert.bat` → **Run as administrator**.

Script ini membutuhkan `openssl`. Jika belum ada, install **Git for Windows** (https://git-scm.com) — sudah menyertakan openssl.

Setelah berhasil, file `cert.pem` dan `key.pem` akan terbuat di folder `print-bridge`.

### 5. Jalankan server
```cmd
cd C:\pedami\print-bridge
node server.js
```

Output yang menandakan HTTPS aktif:
```
============================================================
  Pedami Print Bridge
============================================================
  URL     : https://127.0.0.1:6789
  Mode TLS: HTTPS ✔ (aman dari app HTTPS)
  Printer : EPSON LX-310
  Mode    : ps
============================================================
```

### 6. Trust certificate di browser (sekali saja)
Buka browser di komputer kasir, akses:
```
https://localhost:6789
```
Klik **Advanced** → **Proceed to localhost (unsafe)** → halaman status print bridge akan muncul.

> Langkah ini hanya perlu dilakukan **sekali** per browser per komputer.

### 7. Set URL Bridge di Pengaturan Aplikasi
Buka aplikasi → **Pengaturan** → tab **Printer** → kolom **URL Bridge**:
```
https://localhost:6789
```
Klik **Simpan** → klik **Refresh** → status harus menjadi **Aktif**.

### 8. Auto-start saat Windows menyala
Klik kanan `setup.bat` → **Run as administrator**. Script akan membuat shortcut di folder Startup Windows sehingga print bridge otomatis berjalan setiap login.

---

## Langkah Setup (Mac/Linux — development)

```bash
cd print-bridge

# Generate sertifikat
./gen-cert.sh

# Jalankan server
node server.js

# Atau di background
nohup node server.js > /tmp/print-bridge.log 2>&1 &
```

Lalu buka `https://localhost:6789` di browser dan klik **Proceed** untuk trust cert.

---

## Troubleshooting

### "Print-bridge tidak terdeteksi" di Pengaturan
1. Pastikan `node server.js` sedang berjalan di komputer kasir
2. Pastikan URL Bridge di Pengaturan sudah `https://localhost:6789`
3. Pastikan sudah membuka `https://localhost:6789` di browser dan meng-klik **Proceed** (trust cert)
4. Cek firewall Windows — izinkan Node.js atau port 6789

### Cert belum di-trust: ERR_CERT_AUTHORITY_INVALID
Buka `https://localhost:6789` di browser yang sama → klik **Advanced** → **Proceed to localhost**.

### openssl tidak ditemukan saat gen-cert.bat
Install Git for Windows dari https://git-scm.com/download/win lalu jalankan ulang `gen-cert.bat`.

### Port 6789 sudah dipakai
```cmd
netstat -ano | findstr :6789
taskkill /PID <pid> /F
```

### Cetak tidak keluar meski bridge terdeteksi
- Cek nama printer di `config.json` harus sama persis dengan nama di Windows
- Coba ganti `printMode` dari `ps` ke `copy` (untuk printer parallel port)
- Cek antrian printer di Windows — mungkin ada job yang stuck

---

## Ringkasan File

| File | Fungsi |
|------|--------|
| `server.js` | Server utama, jalankan ini |
| `formatter.js` | Format data struk → ESC/P bytes |
| `config.json` | Konfigurasi printer & port |
| `template.json` | Header/footer struk (dibuat otomatis) |
| `gen-cert.bat` | Generate TLS cert (Windows) |
| `gen-cert.sh` | Generate TLS cert (Mac/Linux) |
| `setup.bat` | Daftarkan ke Windows Startup |
| `cert.pem` + `key.pem` | Sertifikat TLS (dibuat oleh gen-cert) |
