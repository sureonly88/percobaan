-- Migration: cashier daily closing / tutup kasir MVP
-- Purpose:
--   1. store daily cashier closing snapshot per date/loket/kasir
--   2. store counted cash by denomination for audit trail

CREATE TABLE IF NOT EXISTS cashier_closings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_date DATE NOT NULL,
  loket_code VARCHAR(64) NOT NULL,
  loket_name VARCHAR(150) NULL,
  username VARCHAR(128) NOT NULL,
  opening_cash DECIMAL(15,0) NOT NULL DEFAULT 0,
  system_request_count INT UNSIGNED NOT NULL DEFAULT 0,
  system_transaction_count INT UNSIGNED NOT NULL DEFAULT 0,
  system_amount_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  system_admin_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  system_cash_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  counted_cash_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  other_cash_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  retained_cash DECIMAL(15,0) NOT NULL DEFAULT 0,
  deposit_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  discrepancy_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  cashier_note TEXT NULL,
  discrepancy_note TEXT NULL,
  status ENUM('DRAFT','SUBMITTED','VERIFIED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  submitted_at DATETIME NULL,
  verified_at DATETIME NULL,
  verified_by VARCHAR(128) NULL,
  verifier_note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cashier_closing_daily (business_date, loket_code, username),
  KEY idx_cashier_closings_status_date (status, business_date),
  KEY idx_cashier_closings_loket_date (loket_code, business_date),
  KEY idx_cashier_closings_username_date (username, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cashier_closing_denominations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  closing_id BIGINT UNSIGNED NOT NULL,
  denomination INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  subtotal DECIMAL(15,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cashier_closing_denomination (closing_id, denomination),
  KEY idx_cashier_closing_denominations_closing (closing_id),
  CONSTRAINT fk_cashier_closing_denominations_closing
    FOREIGN KEY (closing_id) REFERENCES cashier_closings(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;