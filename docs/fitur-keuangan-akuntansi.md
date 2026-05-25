# Fitur Keuangan & Akuntansi

Modul ini mengaktifkan pencatatan otomatis double-entry bookkeeping, settlement harian per loket, dan laporan margin/profit real-time.

## 1. Arsitektur

### General Ledger (GL) — Append-only

Tiga tabel inti:

- `gl_accounts` — Chart of Accounts. 13 akun di-seed otomatis (lihat tabel di bawah). Akun bertanda `is_system=1` tidak boleh dinonaktifkan.
- `gl_journal_entries` — header jurnal (`entry_no`, `entry_date`, `source_type`, `source_id`, `total_debit`, `total_credit`, `reverses_entry_id`).
- `gl_journal_lines` — detail debit/kredit per akun, plus dimensi (`dim_loket`, `dim_provider`, `dim_service`, `dim_product`).

Trigger BEFORE UPDATE/DELETE memblokir mutasi pada `gl_journal_entries` dan `gl_journal_lines`. Untuk koreksi gunakan jurnal REVERSAL (entri baru yang membalik via `reverses_entry_id`).

### Settlement

- `settlement_batches` — satu batch per (`batch_date`, `loket_code`). Status: `DRAFT → APPROVED → PAID` (atau `VOID`).
- `settlement_batch_items` — daftar transaksi yang masuk batch. UNIQUE pada `idempotency_key` mencegah satu transaksi masuk dua batch.

## 2. Chart of Accounts Default

| Kode | Nama | Tipe | Normal |
|------|------|------|--------|
| 1101 | Kas Loket | ASSET | DEBIT |
| 1102 | Saldo Deposit Provider | ASSET | DEBIT |
| 1201 | Piutang Settlement | ASSET | DEBIT |
| 2101 | Hutang Settlement ke Loket | LIABILITY | CREDIT |
| 2102 | Titipan Pelanggan | LIABILITY | CREDIT |
| 3101 | Modal Disetor | EQUITY | CREDIT |
| 3201 | Laba Ditahan | EQUITY | CREDIT |
| 4101 | Pendapatan Biaya Admin | INCOME | CREDIT |
| 4102 | Pendapatan Margin Provider | INCOME | CREDIT |
| 4901 | Pendapatan Lain-lain | INCOME | CREDIT |
| 5101 | Beban Provider/Aggregator | EXPENSE | DEBIT |
| 5201 | Beban Operasional | EXPENSE | DEBIT |
| 5901 | Beban Penyesuaian/Selisih | EXPENSE | DEBIT |

Akun custom dapat ditambah lewat halaman **Chart of Accounts** (admin only).

## 3. Posting Otomatis (Posting Rules)

### Pembayaran sukses (PDAM, Lunasin)

```
Dr 1101 Kas Loket              total_bayar
   Cr 1102 Saldo Provider          amount (nominal tagihan)
   Cr 4101 Pendapatan Admin        admin_fee
```

Idempoten via `idempotency_key` → `gl_journal_entries.source_id`. Posting dilakukan best-effort: kegagalan GL **tidak** membatalkan transaksi pembayaran yang sudah sukses.

### Top-up saldo provider (manual lewat /saldo)

Top-up positif:
```
Dr 1102 Saldo Provider         nominal
   Cr 3101 Modal Disetor           nominal
```

Pengurangan saldo (nominal negatif): kebalikan.

### Approval settlement batch

Saat batch `APPROVED`:
```
Dr 2101 Hutang Settlement      net_payable
   Cr 1101 Kas Loket               net_payable
```

`net_payable = total_gross - total_admin_fee` (admin fee jadi hak loket).

## 4. Workflow Settlement Harian

1. **Generate** — manual dari `/settlement` (button "Generate") atau otomatis via cron `/api/cron/settlement-daily` (harian). Status awal: `DRAFT`.
2. **Approve** — admin/supervisor membuka detail batch dan klik "Approve Batch". Sistem mem-posting jurnal HUTANG vs KAS dan mengisi `gl_entry_id`.
3. **Mark Paid** — setelah transfer ke loket, admin mengisi referensi pembayaran dan klik "Tandai Sudah Dibayar".

Idempotensi: batch (date, loket) yang sudah ada akan di-skip. Item yang sudah masuk batch tidak akan muncul lagi.

## 5. Laporan

| Halaman | Path | Sumber |
|---------|------|--------|
| Jurnal Umum | `/keuangan/jurnal` | `gl_journal_entries` + lines |
| Buku Besar | `/keuangan/buku-besar` | filter per akun + running balance |
| Neraca Saldo | `/keuangan/neraca-saldo` | agregat debit/kredit per akun, balanced check |
| Margin & Profit | `/keuangan/margin` | `multi_payment_items` (groupBy provider/service/product/loket) |
| Chart of Accounts | `/keuangan/akun` | `gl_accounts` (admin write) |

## 6. API Endpoint

| Method | Path | Role |
|--------|------|------|
| GET | `/api/keuangan/jurnal` | admin, supervisor |
| GET | `/api/keuangan/buku-besar?accountCode=...` | admin, supervisor |
| GET | `/api/keuangan/neraca-saldo` | admin, supervisor |
| GET | `/api/keuangan/margin` | admin, supervisor |
| GET / POST / PATCH | `/api/keuangan/akun` | GET: supervisor+admin / POST,PATCH: admin |
| GET / POST | `/api/settlement/batches` | GET: supervisor+admin / POST: admin |
| GET / PATCH | `/api/settlement/batches/[id]` | GET: supervisor+admin / PATCH: admin |
| POST | `/api/cron/settlement-daily` | cron token (lihat `CRON_SECRET`) |

## 7. Cron Setup

Tambahkan job cron harian (mis. 23:55):

```bash
curl -X POST "https://<host>/api/cron/settlement-daily" \
     -H "Authorization: Bearer $CRON_SECRET"
```

Optional query `?date=YYYY-MM-DD&loketCode=LKT-001` untuk re-run manual.

Lock job pakai `system_jobs` (TTL 10 menit) — instance lain akan di-skip dengan `skipped: true`.

## 8. Catatan Operasional

- **Tidak ada backfill**: hanya transaksi baru (setelah migrasi `20260525_general_ledger.sql` dijalankan) yang ter-posting otomatis.
- Posting GL bersifat **best-effort** — bila gagal, payment tetap sukses. Cek log `console.error` untuk anomali, lalu post jurnal manual via DB.
- Reversal: bila ada salah posting, buat entry baru dengan `reverses_entry_id` mengarah ke entry yang dibalik (lewat SQL langsung; UI belum tersedia).
- Halaman Neraca Saldo selalu menampilkan badge `BALANCED ✓` selama posting otomatis berjalan benar. Bila `TIDAK SEIMBANG`, ada entri ganjil → audit di Jurnal Umum.

## 9. File yang Ditambahkan

**Migration:**
- `database/migrations/20260525_general_ledger.sql`
- `database/migrations/20260525_settlement_batches.sql`

**Lib:**
- `src/lib/gl/accounts.ts` — konstanta COA & helpers
- `src/lib/gl/journal.ts` — `postJournal`, `postJournalSafe`, `hasJournalForSource`
- `src/lib/gl/posting-rules.ts` — `postPaymentSuccess`, `postSaldoMutation`, `postSettlementApproval`
- `src/lib/gl/reports.ts` — `listAccounts`, `listJournalEntries`, `getJournalEntryDetail`, `getTrialBalance`, `getAccountLedger`, `getMarginReport`
- `src/lib/settlement/batch.ts` — `generateDailyBatches`, `listBatches`, `getBatch`, `approveBatch`, `markBatchPaid`

**Endpoint wiring:**
- `src/app/api/pembayaran/pay/route.ts` (PDAM)
- `src/app/api/pembayaran/lunasin/pay/route.ts` (Lunasin)
- `src/app/api/saldo/route.ts` (mutasi saldo loket)

**RBAC:** ditambah di `src/lib/rbac.ts` (pages & API_PERMISSIONS).

**Sidebar:** group baru "Keuangan & Akuntansi" di `src/ui/AppSidebar.tsx` dan `src/ui/AppTopNav.tsx`.
