-- Migration: transaction event store for observability / tracing

CREATE TABLE IF NOT EXISTS transaction_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NULL,
  transaction_code VARCHAR(150) NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'PDAM',
  event_type VARCHAR(64) NOT NULL,
  severity ENUM('INFO', 'WARN', 'ERROR') NOT NULL DEFAULT 'INFO',
  http_status INT NULL,
  provider_error_code VARCHAR(64) NULL,
  message TEXT NULL,
  payload_json JSON NULL,
  username VARCHAR(128) NULL,
  loket_code VARCHAR(64) NULL,
  cust_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transaction_events_idempotency_key (idempotency_key),
  KEY idx_transaction_events_transaction_code (transaction_code),
  KEY idx_transaction_events_event_type_created_at (event_type, created_at),
  KEY idx_transaction_events_username_created_at (username, created_at),
  KEY idx_transaction_events_cust_id_created_at (cust_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;