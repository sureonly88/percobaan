-- Laporan masalah per transaksi: agen/kasir melapor, admin/supervisor menanggapi.
-- Selalu terikat ke satu multi_payment (kode MP-…) agar konteks transaksi jelas dan
-- percakapan tercatat di sistem (bukan di WhatsApp pribadi).
-- awaiting: siapa yang perlu menanggapi berikutnya (HANDLER = admin/supervisor, REPORTER = pelapor).
CREATE TABLE IF NOT EXISTS transaction_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  multi_payment_code VARCHAR(64) NOT NULL,
  transaction_code VARCHAR(150) NULL,
  loket_code VARCHAR(64) NULL,
  customer_id VARCHAR(64) NULL,
  customer_name VARCHAR(255) NULL,
  service_type VARCHAR(40) NULL,
  total_amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  category VARCHAR(40) NOT NULL,
  status ENUM('BARU','DIPROSES','SELESAI') NOT NULL DEFAULT 'BARU',
  awaiting ENUM('HANDLER','REPORTER','NONE') NOT NULL DEFAULT 'HANDLER',
  reported_by VARCHAR(128) NOT NULL,
  assigned_to VARCHAR(128) NULL,
  resolution VARCHAR(500) NULL,
  resolved_by VARCHAR(128) NULL,
  resolved_at DATETIME NULL,
  last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tr_status (status, awaiting, last_message_at),
  KEY idx_tr_reporter (reported_by, status),
  KEY idx_tr_mp (multi_payment_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS transaction_report_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  author VARCHAR(128) NOT NULL,
  author_role VARCHAR(20) NOT NULL,
  kind ENUM('MESSAGE','EVENT') NOT NULL DEFAULT 'MESSAGE',
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trm_report (report_id, id),
  CONSTRAINT fk_trm_report FOREIGN KEY (report_id) REFERENCES transaction_reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
