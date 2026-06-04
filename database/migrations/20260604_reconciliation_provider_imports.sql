-- Provider Excel import staging for reconciliation.

CREATE TABLE IF NOT EXISTS reconciliation_provider_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider ENUM('pdam','lunasin') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  loket_code VARCHAR(64) NULL,
  original_filename VARCHAR(255) NULL,
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  total_provider DECIMAL(15,0) NOT NULL DEFAULT 0,
  imported_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recon_provider_imports_provider_date (provider, start_date, end_date),
  KEY idx_recon_provider_imports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS reconciliation_provider_import_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_id BIGINT UNSIGNED NOT NULL,
  excel_row_number INT UNSIGNED NOT NULL,
  transaction_code VARCHAR(150) NULL,
  customer_id VARCHAR(64) NULL,
  customer_name VARCHAR(150) NULL,
  product_code VARCHAR(100) NULL,
  period_label VARCHAR(50) NULL,
  loket_code VARCHAR(64) NULL,
  provider_reference VARCHAR(150) NULL,
  provider_status VARCHAR(80) NULL,
  provider_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  provider_admin DECIMAL(15,0) NOT NULL DEFAULT 0,
  provider_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  raw_json JSON NULL,
  error_message VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recon_provider_rows_import (import_id),
  KEY idx_recon_provider_rows_transaction (transaction_code),
  KEY idx_recon_provider_rows_customer (customer_id, period_label, product_code, loket_code),
  CONSTRAINT fk_recon_provider_rows_import
    FOREIGN KEY (import_id) REFERENCES reconciliation_provider_imports(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE reconciliation_batches
  ADD COLUMN provider_import_id BIGINT UNSIGNED NULL AFTER loket_code,
  ADD KEY idx_recon_batches_provider_import (provider_import_id),
  ADD CONSTRAINT fk_recon_batches_provider_import
    FOREIGN KEY (provider_import_id) REFERENCES reconciliation_provider_imports(id)
    ON DELETE SET NULL;

ALTER TABLE reconciliation_items
  MODIFY multi_payment_item_id BIGINT UNSIGNED NULL,
  MODIFY match_status ENUM('MATCH','SELISIH_NOMINAL','NEED_REVIEW','TIDAK_ADA_DI_PROVIDER','TIDAK_ADA_DI_INTERNAL','RESOLVED','IGNORED') NOT NULL DEFAULT 'NEED_REVIEW',
  ADD COLUMN provider_import_row_id BIGINT UNSIGNED NULL AFTER multi_payment_item_id,
  ADD KEY idx_recon_items_provider_row (provider_import_row_id),
  ADD CONSTRAINT fk_recon_items_provider_row
    FOREIGN KEY (provider_import_row_id) REFERENCES reconciliation_provider_import_rows(id)
    ON DELETE SET NULL;
