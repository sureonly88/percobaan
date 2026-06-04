-- Payment Link / Invoice Online + Struk Digital

CREATE TABLE IF NOT EXISTS payment_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_code VARCHAR(80) NOT NULL,
  public_token CHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status ENUM(
    'DRAFT','UNPAID','PAYMENT_PENDING','PAID_GATEWAY','PROCESSING_PROVIDER',
    'SUCCESS','PARTIAL_SUCCESS','PENDING_REVIEW','FAILED_PROVIDER','EXPIRED','CANCELLED'
  ) NOT NULL DEFAULT 'UNPAID',
  loket_code VARCHAR(64) NULL,
  loket_name VARCHAR(150) NULL,
  created_by VARCHAR(128) NULL,
  customer_name VARCHAR(150) NULL,
  customer_phone VARCHAR(32) NULL,
  customer_email VARCHAR(150) NULL,
  total_items INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  total_admin DECIMAL(15,0) NOT NULL DEFAULT 0,
  gateway_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
  grand_total DECIMAL(15,0) NOT NULL DEFAULT 0,
  gateway VARCHAR(32) NOT NULL DEFAULT 'midtrans',
  gateway_order_id VARCHAR(128) NULL,
  gateway_tx_id VARCHAR(128) NULL,
  payment_method VARCHAR(64) NULL,
  snap_token VARCHAR(255) NULL,
  snap_url TEXT NULL,
  gateway_status VARCHAR(64) NULL,
  gateway_payload JSON NULL,
  multi_payment_code VARCHAR(150) NULL,
  receipt_token CHAR(64) NULL,
  notes TEXT NULL,
  expires_at DATETIME NULL,
  paid_gateway_at DATETIME NULL,
  provider_processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_invoice_code (invoice_code),
  UNIQUE KEY uq_payment_invoice_public_token (public_token),
  UNIQUE KEY uq_payment_invoice_idempotency_key (idempotency_key),
  UNIQUE KEY uq_payment_invoice_gateway_order (gateway_order_id),
  UNIQUE KEY uq_payment_invoice_receipt_token (receipt_token),
  KEY idx_payment_invoice_status_created (status, created_at),
  KEY idx_payment_invoice_loket_created (loket_code, created_at),
  KEY idx_payment_invoice_multi_payment_code (multi_payment_code),
  KEY idx_payment_invoice_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS payment_invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
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
  inquiry_snapshot JSON NULL,
  metadata_json JSON NULL,
  multi_payment_item_code VARCHAR(150) NULL,
  status ENUM('UNPAID','PROCESSING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE') NOT NULL DEFAULT 'UNPAID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_invoice_item_code (item_code),
  KEY idx_payment_invoice_items_invoice (invoice_id),
  KEY idx_payment_invoice_items_customer (customer_id),
  KEY idx_payment_invoice_items_multi_item (multi_payment_item_code),
  CONSTRAINT fk_payment_invoice_items_invoice
    FOREIGN KEY (invoice_id) REFERENCES payment_invoices(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS payment_invoice_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  actor_type ENUM('user','system','gateway','public') NOT NULL DEFAULT 'system',
  actor_username VARCHAR(128) NULL,
  before_status VARCHAR(64) NULL,
  after_status VARCHAR(64) NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoice_events_invoice (invoice_id, created_at),
  KEY idx_invoice_events_type_created (event_type, created_at),
  CONSTRAINT fk_payment_invoice_events_invoice
    FOREIGN KEY (invoice_id) REFERENCES payment_invoices(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
