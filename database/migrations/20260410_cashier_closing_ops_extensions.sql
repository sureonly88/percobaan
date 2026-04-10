-- Migration: cashier closing advanced operations
-- Purpose:
--   1. add shift + opening session support
--   2. add structured discrepancy + proof metadata
--   3. add reopen / revision workflow support

CREATE TABLE IF NOT EXISTS cashier_openings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_date DATE NOT NULL,
  shift_code ENUM('REGULER','PAGI','SIANG','MALAM') NOT NULL DEFAULT 'REGULER',
  loket_code VARCHAR(64) NOT NULL,
  loket_name VARCHAR(150) NULL,
  username VARCHAR(128) NOT NULL,
  opening_cash DECIMAL(15,0) NOT NULL DEFAULT 0,
  carried_cash DECIMAL(15,0) NOT NULL DEFAULT 0,
  source_closing_id BIGINT UNSIGNED NULL,
  opening_note TEXT NULL,
  status ENUM('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  closed_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cashier_opening_shift (business_date, loket_code, username, shift_code),
  KEY idx_cashier_openings_status_date (status, business_date),
  KEY idx_cashier_openings_loket_date (loket_code, business_date),
  KEY idx_cashier_openings_username_date (username, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE cashier_closings
  DROP INDEX uq_cashier_closing_daily,
  ADD COLUMN shift_code ENUM('REGULER','PAGI','SIANG','MALAM') NOT NULL DEFAULT 'REGULER' AFTER business_date,
  ADD COLUMN opening_id BIGINT UNSIGNED NULL AFTER username,
  ADD COLUMN discrepancy_reason_code VARCHAR(50) NULL AFTER discrepancy_note,
  ADD COLUMN proof_reference VARCHAR(255) NULL AFTER discrepancy_reason_code,
  ADD COLUMN proof_note TEXT NULL AFTER proof_reference,
  ADD COLUMN reopen_requested_at DATETIME NULL AFTER verifier_note,
  ADD COLUMN reopen_requested_by VARCHAR(128) NULL AFTER reopen_requested_at,
  ADD COLUMN reopen_request_note TEXT NULL AFTER reopen_requested_by,
  ADD COLUMN reopened_at DATETIME NULL AFTER reopen_request_note,
  ADD COLUMN reopened_by VARCHAR(128) NULL AFTER reopened_at,
  ADD COLUMN reopen_note TEXT NULL AFTER reopened_by,
  ADD COLUMN revision_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER reopen_note,
  ADD CONSTRAINT fk_cashier_closings_opening
    FOREIGN KEY (opening_id) REFERENCES cashier_openings(id)
    ON DELETE SET NULL,
  ADD UNIQUE KEY uq_cashier_closing_shift (business_date, loket_code, username, shift_code),
  ADD KEY idx_cashier_closings_shift_date (shift_code, business_date);