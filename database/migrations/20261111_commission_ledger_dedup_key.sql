-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotensi commission_ledger tidak lagi bergantung pada payment_item_id.
--
-- Masalah: UNIQUE (payment_item_id, target) tanpa FK ke multi_payment_items.
-- Setelah item import LEGACY dihapus, id multi_payment_items terpakai ulang,
-- sehingga INSERT komisi item baru bentrok (ER_DUP_ENTRY) dan di-skip diam-diam.
--
-- Solusi: kunci unik pada (transaction_code|item_code, target) untuk baris
-- non-VOID. Baris VOID mendapat dedup_key NULL agar item yang sama boleh
-- dicatat ulang (mis. setelah koreksi/impor ulang).
-- Harus sinkron dengan commissionDedupKey() di src/lib/commission/calculate.ts.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE commission_ledger
  ADD COLUMN dedup_key VARCHAR(310)
    AS (IF(status = 'VOID', NULL, CONCAT(COALESCE(transaction_code, ''), '|', item_code))) STORED
    AFTER status;

ALTER TABLE commission_ledger
  ADD UNIQUE KEY uq_commission_active_item (dedup_key, target),
  ADD KEY idx_commission_payment_item (payment_item_id),
  ADD KEY idx_commission_gl_entry (gl_entry_id),
  DROP INDEX uq_commission_item_target;
