-- Pembatalan (void) transaksi + ledger mutasi saldo loket.
--
-- 1. loket_balance_ledger : jejak setiap perubahan lokets.pulsa (siapa, kenapa, saldo akhir).
-- 2. transaction_voids    : pengajuan & persetujuan pembatalan transaksi (maker-checker).
-- 3. Status 'VOID' untuk multi_payment_items / multi_payment_requests — transaksi
--    yang dibatalkan TIDAK dihapus fisik agar laporan & audit tetap utuh.

CREATE TABLE IF NOT EXISTS loket_balance_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loket_code VARCHAR(64) NULL,
  loket_id INT NULL,
  mutation_type VARCHAR(40) NOT NULL,
  amount DECIMAL(15,0) NOT NULL,
  balance_after DECIMAL(18,0) NULL,
  reference_type VARCHAR(40) NULL,
  reference_id VARCHAR(150) NULL,
  note VARCHAR(255) NULL,
  actor VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_balance_ledger_loket_created (loket_code, created_at),
  KEY idx_balance_ledger_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS transaction_voids (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_code VARCHAR(150) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  loket_code VARCHAR(64) NULL,
  customer_id VARCHAR(64) NULL,
  customer_name VARCHAR(255) NULL,
  item_ids JSON NULL,
  total_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  refund_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  refund_basis VARCHAR(20) NOT NULL DEFAULT 'NONE',
  reason VARCHAR(500) NOT NULL,
  provider_reference VARCHAR(150) NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  warnings JSON NULL,
  requested_by VARCHAR(128) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(128) NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(500) NULL,
  gl_reversal_entry_ids JSON NULL,
  PRIMARY KEY (id),
  KEY idx_transaction_voids_code (transaction_code),
  KEY idx_transaction_voids_status (status, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE multi_payment_items
  MODIFY status ENUM('PENDING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE','VOID') NOT NULL DEFAULT 'PENDING';

ALTER TABLE multi_payment_requests
  MODIFY status ENUM('PENDING','SUCCESS','PARTIAL_SUCCESS','FAILED','PENDING_REVIEW','VOID') NOT NULL DEFAULT 'PENDING';
