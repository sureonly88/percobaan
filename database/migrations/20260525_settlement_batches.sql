-- ============================================================================
-- Settlement Batches — agregasi harian per loket untuk setoran/transfer
-- ============================================================================
-- Alur:
--   1. Cron harian (atau manual) memanggil generator: buat 1 batch DRAFT per loket
--      yang mengumpulkan semua payment_requests SUCCESS pada tanggal X yang
--      belum termasuk batch manapun.
--   2. Supervisor/Admin meninjau dan APPROVE batch (status DRAFT -> APPROVED).
--   3. Setelah transfer/setoran fisik dilakukan, admin tandai sebagai PAID.
--   4. Saat APPROVED, jurnal otomatis diposting: Dr Hutang Settlement, Cr Kas Loket.

CREATE TABLE IF NOT EXISTS settlement_batches (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_code          VARCHAR(40) NOT NULL,
  batch_date          DATE NOT NULL,
  loket_code          VARCHAR(50) NOT NULL,
  loket_name          VARCHAR(150) NULL,
  status              ENUM('DRAFT','APPROVED','PAID','VOID') NOT NULL DEFAULT 'DRAFT',
  transaction_count   INT UNSIGNED NOT NULL DEFAULT 0,
  total_gross         DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_admin_fee     DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_provider_amt  DECIMAL(18,2) NOT NULL DEFAULT 0,
  net_payable         DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes               TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by          VARCHAR(80) NULL,
  approved_at         DATETIME NULL,
  approved_by         VARCHAR(80) NULL,
  paid_at             DATETIME NULL,
  paid_by             VARCHAR(80) NULL,
  paid_reference      VARCHAR(120) NULL,
  gl_entry_id         BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_batch_code (batch_code),
  UNIQUE KEY uq_settlement_date_loket (batch_date, loket_code),
  KEY idx_settlement_status (status),
  KEY idx_settlement_loket (loket_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settlement_batch_items (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id            BIGINT UNSIGNED NOT NULL,
  payment_request_id  BIGINT UNSIGNED NULL,
  idempotency_key     VARCHAR(120) NOT NULL,
  provider            VARCHAR(20) NOT NULL,
  loket_code          VARCHAR(50) NOT NULL,
  amount              DECIMAL(18,2) NOT NULL DEFAULT 0,
  admin_fee           DECIMAL(18,2) NOT NULL DEFAULT 0,
  total               DECIMAL(18,2) NOT NULL DEFAULT 0,
  transaction_date    DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_item_key (idempotency_key),
  KEY idx_settlement_item_batch (batch_id),
  KEY idx_settlement_item_date (transaction_date),
  CONSTRAINT fk_settlement_item_batch FOREIGN KEY (batch_id)
    REFERENCES settlement_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daftarkan cron job
INSERT IGNORE INTO system_jobs (job_name) VALUES ('settlement_daily_batch');
