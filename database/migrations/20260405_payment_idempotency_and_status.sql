-- Migration: payment idempotency + transaction processing status
-- Apply manually to MySQL before deploying updated payment API.

CREATE TABLE IF NOT EXISTS payment_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status ENUM('PENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(32) NOT NULL DEFAULT 'PDAM',
  loket_code VARCHAR(64) NULL,
  username VARCHAR(128) NULL,
  request_payload JSON NOT NULL,
  response_payload JSON NULL,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_requests_idempotency_key (idempotency_key),
  KEY idx_payment_requests_status_created_at (status, created_at)
);

-- Ensure enum includes PARTIAL_SUCCESS for existing tables
ALTER TABLE payment_requests
  MODIFY COLUMN status ENUM('PENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING';

ALTER TABLE pdambjm_trans
  ADD COLUMN IF NOT EXISTS processing_status ENUM('PENDING', 'SUCCESS', 'FAILED') NULL AFTER flag_transaksi,
  ADD COLUMN IF NOT EXISTS provider_error_code VARCHAR(64) NULL AFTER processing_status,
  ADD COLUMN IF NOT EXISTS provider_error_message TEXT NULL AFTER provider_error_code,
  ADD COLUMN IF NOT EXISTS paid_at DATETIME NULL AFTER provider_error_message,
  ADD COLUMN IF NOT EXISTS failed_at DATETIME NULL AFTER paid_at;

CREATE INDEX idx_pdambjm_processing_status ON pdambjm_trans(processing_status);
