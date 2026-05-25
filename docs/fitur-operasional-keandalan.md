# Fitur Operasional & Keandalan

Implementasi tiga sub-fitur untuk meningkatkan keandalan portal-utilitas:

- **A. Auto-Resolve Pending** — worker otomatis untuk transaksi stuck
- **B. Provider Health Dashboard** — pantau status PDAM & LUNASIN real-time
- **C. Audit Log Immutable** — jejak aksi sensitif yang tidak bisa dimanipulasi

---

## Prasyarat

### 1. Jalankan migrasi database
```bash
npm run migrate
```
Tabel yang dibuat: `audit_logs`, `provider_health`, `provider_health_samples`, `system_jobs`.

### 2. Tambahkan environment variable (opsional)
Di file `.env`:
```
CRON_SECRET=buat-string-random-panjang-minimal-32-karakter
```
Jika tidak diset, endpoint cron hanya bisa dipanggil oleh admin yang login atau dari `localhost`.

---

## A. Auto-Resolve Pending

### Cara kerja
Worker berjalan dalam dua fase setiap kali dipanggil:

| Fase | Kondisi | Hasil |
|------|---------|-------|
| Phase 1 | `PENDING` > 15 menit | Dipromosikan ke `PENDING_ADVICE` (muncul di menu Advice PDAM) |
| Phase 2 | `PENDING_ADVICE` ≥ 6 attempt **atau** > 60 menit | Otomatis di-`FAILED` dengan kode `AUTO_REVERSED` |

### Trigger manual (sekali jalan)
```bash
curl -X POST http://localhost:3000/api/cron/auto-resolve-pending \
  -H "X-Cron-Secret: isi-CRON_SECRET-kamu"
```

Response sukses:
```json
{
  "ok": true,
  "summary": {
    "promoted": 3,
    "autoFailed": 1,
    "scannedStale": 5,
    "scannedExhausted": 2,
    "durationMs": 142
  }
}
```

Response jika job sedang berjalan (lock aktif):
```json
{ "ok": true, "skipped": true, "reason": "Job sedang berjalan atau terkunci" }
```

### Setup crontab (setiap 5 menit)
```bash
# Edit crontab
crontab -e

# Tambahkan baris ini
*/5 * * * * curl -fsS -X POST -H "X-Cron-Secret: GANTI_INI" \
  http://localhost:3000/api/cron/auto-resolve-pending \
  >> /var/log/portal-cron.log 2>&1
```

### Setup dengan systemd timer (production)
File `/etc/systemd/system/portal-auto-resolve.service`:
```ini
[Unit]
Description=Portal Auto Resolve Pending

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "X-Cron-Secret: GANTI_INI" \
  http://localhost:3000/api/cron/auto-resolve-pending
```

File `/etc/systemd/system/portal-auto-resolve.timer`:
```ini
[Unit]
Description=Jalankan auto-resolve setiap 5 menit

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now portal-auto-resolve.timer
```

---

## B. Provider Health Dashboard

### Akses dashboard
Buka di browser (login sebagai **admin** atau **supervisor**):
```
http://localhost:3000/monitoring/provider-health
```

Atau lewat menu sidebar: **Operasional → Health Provider**

### Yang ditampilkan
- **Kartu per provider** — state circuit breaker, success rate 24h, total transaksi, rata-rata latency, p95 latency, jumlah failure
- **Badge status:**
  - `CLOSED` (hijau) — provider normal
  - `OPEN` (merah) — circuit breaker trip, provider bermasalah
  - `HALF_OPEN` (kuning) — dalam proses recovery
- **Tabel status cron jobs** — kapan terakhir jalan, durasi, hasil, jumlah run/fail
- **Auto-refresh** setiap 30 detik

### Update data rollup (setiap 15 menit)
Data diambil dari `transaction_events` yang sudah ada — tidak perlu konfigurasi tambahan.

```bash
# Trigger manual
curl -X POST http://localhost:3000/api/cron/provider-health-rollup \
  -H "X-Cron-Secret: isi-CRON_SECRET-kamu"

# Crontab (setiap 15 menit)
*/15 * * * * curl -fsS -X POST -H "X-Cron-Secret: GANTI_INI" \
  http://localhost:3000/api/cron/provider-health-rollup \
  >> /var/log/portal-cron.log 2>&1
```

Response rollup:
```json
{
  "ok": true,
  "summary": {
    "providers": 2,
    "totalEvents": 847,
    "purged": 0
  }
}
```

### API endpoint (untuk integrasi eksternal)
```
GET /api/monitoring/provider-health
Authorization: Bearer <token admin/supervisor>
```

Response:
```json
{
  "providers": [
    {
      "providerName": "PDAM",
      "state": "CLOSED",
      "failureCount": 0,
      "successRate24h": 98.5,
      "total24h": 412,
      "avgLatencyMs24h": 1240,
      "p95LatencyMs24h": 3800,
      "rollupUpdatedAt": "2026-05-25T10:15:00.000Z"
    }
  ],
  "trends": [...],
  "jobs": [...]
}
```

---

## C. Audit Log Immutable

### Aksi yang tercatat otomatis

| Aksi | Siapa | Cara trigger |
|------|-------|-------------|
| `PAYMENT_FORCE_RESOLVE` | Admin/Supervisor | Halaman Monitoring → tombol "Resolve" pada transaksi stuck |
| `STALE_PENDING_PROMOTE` | Admin/Supervisor | Menu Stale Pending → tombol Promote ke Advice |
| `STALE_PENDING_CANCEL` | Admin/Supervisor | Menu Stale Pending → tombol Batalkan |
| `PAYMENT_AUTO_PROMOTED` | Sistem (cron) | Auto-resolve worker phase 1 |
| `PAYMENT_AUTO_FAILED` | Sistem (cron) | Auto-resolve worker phase 2 |

### Lihat isi audit log
Via MySQL/MariaDB:
```sql
-- 50 log terbaru
SELECT
  id,
  created_at,
  actor_username,
  actor_role,
  actor_type,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json
FROM audit_logs
ORDER BY id DESC
LIMIT 50;

-- Filter aksi tertentu
SELECT * FROM audit_logs
WHERE action = 'PAYMENT_FORCE_RESOLVE'
ORDER BY id DESC;

-- Filter per user
SELECT * FROM audit_logs
WHERE actor_username = 'admin'
  AND created_at >= NOW() - INTERVAL 7 DAY
ORDER BY id DESC;
```

### Verifikasi integritas chain
Di aplikasi (misalnya script CLI atau endpoint admin):
```typescript
import { verifyAuditChain } from "@/lib/audit-log";

const result = await verifyAuditChain();
console.log(result);
// { valid: true, checked: 1234, firstBrokenId: null }

// Jika ada yang rusak:
// { valid: false, checked: 876, firstBrokenId: 543 }
```

### Menambahkan audit log ke kode baru
```typescript
import { auditLog } from "@/lib/audit-log";

// Di dalam route handler / server action
await auditLog({
  actorType: "user",           // "user" | "system" | "cron"
  actorUsername: username,
  actorRole: role,
  actorIp: req.headers.get("x-forwarded-for"),
  action: "NAMA_AKSI_HURUF_BESAR",
  entityType: "nama_tabel",
  entityId: String(id),
  before: { status: "LAMA" },
  after: { status: "BARU" },
  context: { info: "tambahan" },  // opsional
});
// auditLog() tidak pernah throw — best-effort
```

---

## Troubleshooting

### Cron tidak berjalan
1. Cek `CRON_SECRET` di `.env` sudah sesuai dengan header `X-Cron-Secret`
2. Cek status lock di DB — jika job crash saat running, lock bisa tertinggal:
```sql
-- Lihat status semua job
SELECT job_name, is_locked, locked_at, last_status, last_summary
FROM system_jobs;

-- Reset lock yang stuck (jika perlu)
UPDATE system_jobs
SET is_locked = 0, locked_at = NULL, locked_by = NULL
WHERE job_name = 'auto_resolve_pending';
```

### Dashboard provider health kosong
Rollup belum pernah dijalankan. Trigger sekali:
```bash
curl -X POST http://localhost:3000/api/cron/provider-health-rollup \
  -H "X-Cron-Secret: isi-CRON_SECRET-kamu"
```

### Tidak ada data trends di dashboard
Tabel `transaction_events` perlu ada event `PAYMENT_PROVIDER_SUCCESS` atau `PAYMENT_PROVIDER_FAILED`. Lakukan beberapa transaksi normal lalu trigger rollup lagi.

### Audit log tidak muncul
Pastikan endpoint PATCH di monitoring/stale-pending berhasil dieksekusi (cek response sukses terlebih dahulu). Log ditulis secara best-effort setelah aksi utama berhasil.
