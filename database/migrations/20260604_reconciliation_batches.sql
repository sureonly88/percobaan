-- Reconciliation batch + exception queue.

CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider ENUM('pdam','lunasin') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  loket_code VARCHAR(64) NULL,
  status ENUM('COMPLETED','REVIEWED') NOT NULL DEFAULT 'COMPLETED',
  total_items INT UNSIGNED NOT NULL DEFAULT 0,
  match_count INT UNSIGNED NOT NULL DEFAULT 0,
  exception_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_internal DECIMAL(15,0) NOT NULL DEFAULT 0,
  total_provider DECIMAL(15,0) NOT NULL DEFAULT 0,
  created_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recon_batches_provider_date (provider, start_date, end_date),
  KEY idx_recon_batches_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  multi_payment_item_id BIGINT UNSIGNED NOT NULL,
  transaction_code VARCHAR(150) NULL,
  customer_id VARCHAR(64) NULL,
  customer_name VARCHAR(150) NULL,
  product_code VARCHAR(100) NULL,
  period_label VARCHAR(50) NULL,
  loket_code VARCHAR(64) NULL,
  loket_name VARCHAR(150) NULL,
  internal_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  internal_admin DECIMAL(15,0) NOT NULL DEFAULT 0,
  internal_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  provider_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  difference_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  match_status ENUM('MATCH','SELISIH_NOMINAL','NEED_REVIEW','RESOLVED','IGNORED') NOT NULL DEFAULT 'NEED_REVIEW',
  note TEXT NULL,
  resolved_by VARCHAR(128) NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recon_item_batch_source (batch_id, multi_payment_item_id),
  KEY idx_recon_items_batch_status (batch_id, match_status),
  KEY idx_recon_items_transaction (transaction_code),
  CONSTRAINT fk_recon_items_batch
    FOREIGN KEY (batch_id) REFERENCES reconciliation_batches(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
