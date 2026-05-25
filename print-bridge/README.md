# Pedami Print Bridge

Local HTTP bridge yang menerima request cetak dari aplikasi Portal Utilitas (Next.js) dan mengirimkannya ke printer dot-matrix Epson LX-310 / LX-350 (atau printer ESC/P lain) di komputer kasir.

- **Port default:** `6789` (`http://localhost:6789`)
- **Runtime:** Node.js ≥ 18
- **OS target produksi:** Windows 10/11 (mesin kasir). Mac/Linux didukung untuk pengembangan.

---

## 1. Prasyarat

| Kebutuhan | Keterangan |
|-----------|------------|
| Node.js ≥ 18 LTS | Download dari <https://nodejs.org> |
| Printer terinstall di OS | Windows: pastikan muncul di **Settings → Printers & scanners**. Mac/Linux: pastikan terdaftar di `lpstat -p` |
| Tidak butuh `npm install` | Aplikasi hanya pakai modul bawaan Node (`http`, `child_process`, `fs`). Tidak ada dependency eksternal |

---

## 2. Menjalankan (Development / Manual)

Dari root project:

```bash
cd print-bridge
node server.js
```

Atau lewat npm script:

```bash
cd print-bridge
npm start
```

Output yang menandakan sukses:

```
Pedami Print Bridge listening on http://localhost:6789
```

Hentikan dengan `Ctrl + C`.

### Menjalankan di background (Mac/Linux)

```bash
cd print-bridge
nohup node server.js > /tmp/print-bridge.log 2>&1 &
```

Cek log: `tail -f /tmp/print-bridge.log`. Hentikan: `pkill -f "node server.js"`.

---

## 3. Auto-start di Windows (Mesin Kasir)

1. Buka folder `print-bridge` di File Explorer.
2. Klik kanan `setup.bat` → **Run as administrator** (cukup sekali).
3. Script akan:
   - Verifikasi Node.js terinstall.
   - Membuat shortcut `PedamiPrintBridge.bat` di folder **Startup** Windows sehingga bridge otomatis jalan setiap login.
4. Restart komputer atau jalankan `node server.js` manual untuk sesi pertama.

Untuk menonaktifkan auto-start, hapus file:

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PedamiPrintBridge.bat
```

---

## 4. Verifikasi Bridge Berjalan

Buka browser ke <http://localhost:6789/> — tampil halaman status HTML.

Atau dari terminal:

```bash
curl http://localhost:6789/ping
# → {"ok":true,"service":"pedami-print-bridge","version":"1.0.0"}

curl http://localhost:6789/printers
# → {"ok":true,"platform":"darwin","printers":[...]}
```

Di aplikasi web, buka **Pengaturan → Printer** untuk lihat status, pilih printer, ubah template, dan tes cetak via UI.

---

## 5. Konfigurasi

Dua file konfigurasi runtime (auto-generated, jangan diedit manual selagi bridge jalan — pakai UI **Pengaturan → Printer**):

| File | Isi |
|------|-----|
| `config.json` | `printerName`, `printMode` (`ps` \| `copy`), `portMapping`, `columns`, `feedLines` |
| `template.json` | Header/footer struk: `headerLine1`, `headerLine2`, `lunasText`, `footerLine1`, `footerLine2` |

**Mode cetak (Windows):**
- `ps` — PowerShell + WinSpooler API (rekomendasi untuk printer USB modern).
- `copy` — `copy /b file LPT3:` (untuk printer yang sudah di-share ke virtual LPT port via `net use LPT3 \\PC\Printer /persistent:yes`).

---

## 6. Endpoint HTTP

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/ping` | Health check |
| GET | `/printers` | Daftar printer terdeteksi di OS |
| GET / POST | `/config` | Baca / simpan konfigurasi printer |
| GET / POST | `/template` | Baca / simpan template struk |
| POST | `/preview` | Render plain-text preview struk |
| POST | `/test-print` | Cetak struk contoh |
| POST | `/print` | Cetak struk pembayaran (dipanggil aplikasi Next.js) |

---

## 7. Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `Pengaturan → Printer` menampilkan "Bridge offline" | Bridge belum jalan. Buka terminal di folder `print-bridge` dan `node server.js`. Cek port 6789 tidak dipakai aplikasi lain (`netstat -ano | findstr :6789` di Windows). |
| Printer tidak muncul di daftar | Pastikan terinstall di OS, lalu klik tombol **Refresh** di tab Printer. Di Windows pastikan PowerShell `Get-Printer` bisa jalan. |
| Cetak tidak keluar di mode `ps` | Coba ganti ke mode `copy` + map printer ke LPT3 (`net use LPT3: \\\\localhost\\NamaPrinter /persistent:yes`). |
| Karakter aneh / tidak rapi | Sesuaikan `columns` (default 40 untuk LX-310 kertas 9.5"). |
| CORS error di browser | Bridge sudah whitelist `localhost` & `127.0.0.1`. Pastikan aplikasi Next.js diakses lewat `http://localhost:3000`, bukan IP LAN. |

---

## 8. Update Bridge

1. Hentikan bridge (`Ctrl + C` di terminal atau tutup window).
2. `git pull` di root project.
3. Jalankan ulang: `cd print-bridge && node server.js`.

Konfigurasi (`config.json`, `template.json`) tetap dipertahankan antar update.
