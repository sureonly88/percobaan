-- Migration: Create separate table for PLN/Lunasin transactions
-- Date: 2026-04-07

CREATE TABLE IF NOT EXISTS lunasin_trans (
  id              INT(11)       NOT NULL AUTO_INCREMENT,
  transaction_code VARCHAR(150)  NOT NULL,
  transaction_date TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cust_id         VARCHAR(50)   NOT NULL,
  nama            VARCHAR(150)  NOT NULL,
  kode_produk     VARCHAR(50)   NOT NULL COMMENT 'e.g. pln-postpaid-3000, pln-prepaid-3000',
  id_trx          VARCHAR(30)   NOT NULL COMMENT 'Lunasin transaction ID from inquiry',
  periode         VARCHAR(20)   NULL     COMMENT 'Periode tagihan (YYYYMMYYYYMM)',
  jum_bill        VARCHAR(5)    NULL     COMMENT 'Jumlah bulan tagihan',
  tarif           VARCHAR(10)   NULL     COMMENT 'Golongan tarif PLN (R1, R2, dll)',
  daya            VARCHAR(10)   NULL     COMMENT 'Daya listrik (VA)',
  stand_meter     VARCHAR(30)   NULL     COMMENT 'Stand meter',
  rp_amount       DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Tagihan pokok dari biller',
  rp_admin        DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Biaya admin dari biller',
  rp_total        DECIMAL(15,0) NOT NULL DEFAULT 0 COMMENT 'Total (amount + admin)',
  refnum_lunasin  VARCHAR(50)   NULL     COMMENT 'Reference number dari Lunasin',
  token_pln       VARCHAR(50)   NULL     COMMENT 'Token PLN Prepaid (jika ada)',
  username        VARCHAR(30)   NOT NULL,
  loket_name      VARCHAR(30)   NULL,
  loket_code      VARCHAR(30)   NOT NULL,
  jenis_loket     VARCHAR(30)   NOT NULL DEFAULT 'SWITCHING',

  flag_transaksi      VARCHAR(100) NULL,
  processing_status   ENUM('PENDING','SUCCESS','FAILED') NULL,
  provider_error_code VARCHAR(64)  NULL,
  provider_error_message TEXT      NULL,
  provider_rc         VARCHAR(10)  NULL COMMENT 'Response code dari Lunasin',
  provider_response   JSON         NULL COMMENT 'Full response dari Lunasin',
  advice_attempts     INT          NULL DEFAULT 0 COMMENT 'Jumlah percobaan advice',

  paid_at         DATETIME      NULL,
  failed_at       DATETIME      NULL,
  created_at      TIMESTAMP     NULL,
  updated_at      TIMESTAMP     NULL,

  PRIMARY KEY (id),
  INDEX idx_transaction_code (transaction_code),
  INDEX idx_cust_id (cust_id),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_loket_code (loket_code),
  INDEX idx_kode_produk (kode_produk),
  INDEX idx_processing_status (processing_status),
  INDEX idx_id_trx (id_trx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
