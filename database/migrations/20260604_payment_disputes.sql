-- Refund / dispute workflow untuk invoice online yang gateway sukses tetapi provider gagal.

CREATE TABLE IF NOT EXISTS payment_disputes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  invoice_code VARCHAR(80) NOT NULL,
  status ENUM('OPEN','RETRYING','REFUND_NEEDED','REFUND_PROCESSED','RESOLVED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  reason VARCHAR(255) NULL,
  resolution_note TEXT NULL,
  refund_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  refund_reference VARCHAR(150) NULL,
  created_by VARCHAR(128) NULL,
  updated_by VARCHAR(128) NULL,
  resolved_by VARCHAR(128) NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_disputes_invoice (invoice_id),
  KEY idx_payment_disputes_status_created (status, created_at),
  KEY idx_payment_disputes_invoice_code (invoice_code),
  CONSTRAINT fk_payment_disputes_invoice
    FOREIGN KEY (invoice_id) REFERENCES payment_invoices(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
