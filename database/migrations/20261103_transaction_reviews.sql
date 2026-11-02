-- Antrean review transaksi yang status di provider tidak pasti.
--
-- Advice habis tanpa konfirmasi → item berstatus PENDING_REVIEW (saldo tetap ditahan),
-- bukan auto-FAILED. Admin memutuskan berdasarkan bukti dari provider:
--   - SUCCESS : langsung berlaku (tidak ada uang keluar dari perusahaan)
--   - FAILED  : saldo dikembalikan → wajib disetujui user LAIN (maker-checker)

ALTER TABLE multi_payment_items
  MODIFY status ENUM('PENDING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE','VOID','PENDING_REVIEW') NOT NULL DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS transaction_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_code VARCHAR(150) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  loket_code VARCHAR(64) NULL,
  customer_id VARCHAR(64) NULL,
  customer_name VARCHAR(255) NULL,
  held_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  decision ENUM('SUCCESS','FAILED') NOT NULL,
  evidence VARCHAR(255) NOT NULL,
  note VARCHAR(500) NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_by VARCHAR(128) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(128) NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_transaction_reviews_code (transaction_code),
  KEY idx_transaction_reviews_status (status, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
