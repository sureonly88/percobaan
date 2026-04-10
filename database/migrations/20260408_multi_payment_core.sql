-- Migration: core tables for unified multi-payment orchestration
-- Purpose:
--   1. store one parent transaction for a single cashier payment action
--   2. store child items per provider/service inside that payment action
--   3. prepare observability linkage with transaction_events

CREATE TABLE IF NOT EXISTS multi_payment_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  multi_payment_code VARCHAR(150) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status ENUM('PENDING','SUCCESS','PARTIAL_SUCCESS','FAILED','PENDING_REVIEW') NOT NULL DEFAULT 'PENDING',
  loket_code VARCHAR(64) NULL,
  loket_name VARCHAR(150) NULL,
  username VARCHAR(128) NULL,
  total_items INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  total_admin DECIMAL(15,0) NOT NULL DEFAULT 0,
  grand_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  change_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  request_payload JSON NULL,
  response_payload JSON NULL,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_multi_payment_code (multi_payment_code),
  UNIQUE KEY uq_multi_payment_idempotency_key (idempotency_key),
  KEY idx_multi_payment_status_created_at (status, created_at),
  KEY idx_multi_payment_loket_created_at (loket_code, created_at),
  KEY idx_multi_payment_username_created_at (username, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS multi_payment_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  multi_payment_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(150) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  service_type VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) NULL,
  product_code VARCHAR(100) NULL,
  provider_ref VARCHAR(100) NULL,
  period_label VARCHAR(50) NULL,
  amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  admin_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
  total DECIMAL(15,0) NOT NULL DEFAULT 0,
  status ENUM('PENDING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE') NOT NULL DEFAULT 'PENDING',
  transaction_code VARCHAR(150) NULL,
  provider_error_code VARCHAR(64) NULL,
  provider_error_message TEXT NULL,
  provider_response JSON NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  advice_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  paid_at DATETIME NULL,
  failed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_multi_payment_item_code (item_code),
  KEY idx_multi_payment_items_parent (multi_payment_id),
  KEY idx_multi_payment_items_provider_status (provider, status),
  KEY idx_multi_payment_items_customer_id (customer_id),
  KEY idx_multi_payment_items_transaction_code (transaction_code),
  CONSTRAINT fk_multi_payment_items_parent
    FOREIGN KEY (multi_payment_id) REFERENCES multi_payment_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE transaction_events
  ADD COLUMN IF NOT EXISTS multi_payment_code VARCHAR(150) NULL AFTER idempotency_key,
  ADD KEY IF NOT EXISTS idx_transaction_events_multi_payment_code (multi_payment_code);