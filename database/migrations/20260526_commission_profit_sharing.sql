-- =========================================================
-- Komisi / Profit Sharing per Transaksi
-- Mencakup: rules (admin-configurable), ledger (per transaksi),
--           tambahan akun GL untuk beban & hutang komisi
-- =========================================================

-- ---------------------------------------------------------
-- 1) Tambah akun GL untuk komisi
-- ---------------------------------------------------------
INSERT INTO gl_accounts (code, name, account_type, normal_balance, is_system, is_active, description) VALUES
  ('5301', 'Beban Komisi Kasir',  'EXPENSE',   'DEBIT',  1, 1, 'Komisi yang menjadi hak kasir per transaksi'),
  ('5302', 'Beban Komisi Loket',  'EXPENSE',   'DEBIT',  1, 1, 'Komisi/profit-share yang menjadi hak loket/franchise'),
  ('2201', 'Hutang Komisi Kasir', 'LIABILITY', 'CREDIT', 1, 1, 'Komisi kasir yang belum dibayarkan'),
  ('2202', 'Hutang Komisi Loket', 'LIABILITY', 'CREDIT', 1, 1, 'Komisi loket yang belum dibayarkan')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ---------------------------------------------------------
-- 2) Tabel aturan komisi (rules)
--    Pola matching: paling spesifik menang berdasarkan priority + scope.
--    scope = GLOBAL | LOKET | PROVIDER | LOKET_PROVIDER
--    target = KASIR | LOKET
--    type   = PERCENT | FLAT
--    basis  = AMOUNT (pokok) | ADMIN_FEE | TOTAL
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_rules (
  id             BIGINT NOT NULL AUTO_INCREMENT,
  name           VARCHAR(150) NOT NULL,
  scope          ENUM('GLOBAL','LOKET','PROVIDER','LOKET_PROVIDER') NOT NULL DEFAULT 'GLOBAL',
  loket_code     VARCHAR(64) NULL,
  provider       VARCHAR(32) NULL,
  service_type   VARCHAR(64) NULL,
  target         ENUM('KASIR','LOKET') NOT NULL,
  type           ENUM('PERCENT','FLAT') NOT NULL,
  value          DECIMAL(15,4) NOT NULL DEFAULT 0,
  basis          ENUM('AMOUNT','ADMIN_FEE','TOTAL') NOT NULL DEFAULT 'ADMIN_FEE',
  min_amount     DECIMAL(15,0) NULL,
  max_amount     DECIMAL(15,0) NULL,
  priority       INT NOT NULL DEFAULT 100,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  valid_from     DATE NULL,
  valid_to       DATE NULL,
  notes          VARCHAR(255) NULL,
  created_by     VARCHAR(128) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rules_lookup (is_active, scope, target, provider, loket_code, priority),
  KEY idx_rules_loket (loket_code),
  KEY idx_rules_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------
-- 3) Ledger komisi (1 baris per komisi per item)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_ledger (
  id                  BIGINT NOT NULL AUTO_INCREMENT,
  payment_item_id     BIGINT NOT NULL,
  item_code           VARCHAR(150) NOT NULL,
  transaction_code    VARCHAR(150) NULL,
  multi_payment_code  VARCHAR(150) NULL,
  paid_at             DATETIME NOT NULL,
  loket_code          VARCHAR(64) NOT NULL,
  username            VARCHAR(128) NOT NULL,
  provider            VARCHAR(32) NOT NULL,
  service_type        VARCHAR(64) NULL,
  product_code        VARCHAR(100) NULL,
  target              ENUM('KASIR','LOKET') NOT NULL,
  beneficiary         VARCHAR(150) NOT NULL, -- username untuk KASIR, loket_code untuk LOKET
  rule_id             BIGINT NULL,
  rule_name           VARCHAR(150) NULL,
  rule_type           ENUM('PERCENT','FLAT') NOT NULL,
  rule_value          DECIMAL(15,4) NOT NULL,
  basis               ENUM('AMOUNT','ADMIN_FEE','TOTAL') NOT NULL,
  base_amount         DECIMAL(15,0) NOT NULL,
  commission_amount   DECIMAL(15,0) NOT NULL,
  status              ENUM('ACCRUED','PAID','VOID') NOT NULL DEFAULT 'ACCRUED',
  gl_entry_id         BIGINT NULL,
  paid_batch_id       BIGINT NULL,
  paid_payout_at      DATETIME NULL,
  notes               VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_commission_item_target (payment_item_id, target),
  KEY idx_commission_period (paid_at),
  KEY idx_commission_loket (loket_code, paid_at),
  KEY idx_commission_user (username, paid_at),
  KEY idx_commission_beneficiary (target, beneficiary, paid_at),
  KEY idx_commission_status (status),
  CONSTRAINT fk_commission_rule FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
