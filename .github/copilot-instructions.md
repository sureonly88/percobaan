# Portal Utilitas — Copilot Instructions

## ⚡ MANDATORY: Baca Memory di Awal SETIAP Sesi

**WAJIB DILAKUKAN PERTAMA KALI** sebelum menjawab pertanyaan apapun di sesi baru:

1. Panggil `mcp_agentmemory_memory_smart_search` dengan query `"portal-utilitas percobaan"` untuk memuat konteks project
2. Panggil `mcp_agentmemory_memory_recall` dengan query `"portal-utilitas perubahan-terakhir"` untuk mengetahui apa yang terakhir dikerjakan

Ini BUKAN opsional. Lakukan bahkan sebelum menjawab "halo" sekalipun. Tujuannya agar kamu selalu tahu:
- Fitur apa yang sudah dibangun
- File mana yang sudah diubah
- Bug apa yang pernah ditemukan
- Keputusan arsitektur apa yang sudah dibuat

> Jika agentmemory server belum jalan: `nohup agentmemory > /tmp/agentmemory.log 2>&1 &`  
> Server berjalan di `http://localhost:3111`

## Agent Memory (MCP — agentmemory v0.9+)

### Nama tool yang benar (gunakan persis seperti ini)
- `mcp_agentmemory_memory_smart_search` — untuk mencari konteks (hybrid semantic+keyword)
- `mcp_agentmemory_memory_recall` — untuk recall sesi sebelumnya
- `mcp_agentmemory_memory_save` — untuk menyimpan fakta/konteks baru
- `mcp_agentmemory_memory_lesson_save` — untuk menyimpan lesson learned

### Di akhir setiap sesi (atau setelah perubahan signifikan)
Simpan ke memory hal-hal berikut jika terjadi selama sesi:

1. **Perubahan kode** — file yang diubah, fungsi yang dimodifikasi, dan alasan perubahannya
2. **Keputusan arsitektur** — pilihan desain, trade-off, alasan teknis
3. **Bug atau temuan penting** — root cause, solusi yang diambil
4. **Konvensi atau pola baru** — naming, struktur, cara pakai library tertentu
5. **Informasi konfigurasi** — env vars baru, cara menjalankan perintah, kredensial lokal (non-sensitif)
6. **Konteks bisnis penting** — aturan bisnis, batasan dari pihak ketiga (PDAM, PLN, dll)

### Yang TIDAK perlu disimpan
- Pertanyaan penjelasan atau diskusi tanpa perubahan
- Perubahan kecil seperti typo, styling minor
- Informasi yang sudah ada di memory dan tidak berubah

### Cara update memory yang benar
- Gunakan `mcp_agentmemory_memory_smart_search` sebelum menyimpan untuk menghindari duplikasi
- **WAJIB**: field `concepts` harus selalu dimulai dengan `portal-utilitas,percobaan` diikuti konsep spesifik
  - Contoh benar: `concepts: "portal-utilitas,percobaan,auth,RBAC,roles"`
  - Contoh SALAH: `concepts: "auth,RBAC,roles"` ← tidak ada tag project!
- Menyimpan tanpa tag `portal-utilitas` dan `percobaan` adalah kesalahan dan akan menyebabkan konteks project tercampur dengan project lain di database yang sama

## Project Context

Project ini adalah **portal-utilitas** — portal pembayaran utilitas (PLN, PDAM, Lunasin, Pulsa, BPJS, Telkom).
- Framework: Next.js 14 App Router + TypeScript + Tailwind CSS
- Database: MySQL (`pedami_payment`)
- Auth: NextAuth v4 + RBAC (role: admin, supervisor, kasir, switcher)
- Path: `/Users/yakinyakin/Coding/percobaan`
