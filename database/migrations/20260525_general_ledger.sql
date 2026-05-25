-- ============================================================================
-- General Ledger (GL) — Buku Besar otomatis untuk Portal Utilitas
-- ============================================================================
-- Catatan:
--   - Semua jurnal hanya berlaku untuk transaksi BARU (tidak ada backfill).
--   - Setiap entri jurnal harus seimbang: SUM(debit) = SUM(credit) per entry.
--   - Validasi balance dilakukan di lapisan aplikasi (postJournal helper) +
--     trigger BEFORE INSERT untuk mencegah tampering manual via SQL.
--   - Append-only: tidak boleh UPDATE atau DELETE entri yang sudah diposting
--     (kecuali field is_voided=1 melalui jurnal balik / reversal entry).

-- ----------------------------------------------------------------------------
-- 1. Chart of Accounts (COA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_accounts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(150) NOT NULL,
  account_type    ENUM('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE') NOT NULL,
  normal_balance  ENUM('DEBIT','CREDIT') NOT NULL,
  parent_code     VARCHAR(20) NULL,
  description     VARCHAR(255) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  is_system       TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_accounts_code (code),
  KEY idx_gl_accounts_type (account_type),
  KEY idx_gl_accounts_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Journal Entries (header)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_journal_entries (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_no        VARCHAR(40) NOT NULL,
  entry_date      DATE NOT NULL,
  description     VARCHAR(255) NOT NULL,
  source_type     ENUM('PAYMENT','TOPUP','SETTLEMENT','REVERSAL','MANUAL','OPENING') NOT NULL,
  source_id       VARCHAR(80) NULL,
  reference_no    VARCHAR(80) NULL,
  loket_code      VARCHAR(50) NULL,
  provider        VARCHAR(20) NULL,
  service_type    VARCHAR(40) NULL,
  total_debit     DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_credit    DECIMAL(18,2) NOT NULL DEFAULT 0,
  reverses_entry_id BIGINT UNSIGNED NULL,
  created_by      VARCHAR(80) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gl_entries_no (entry_no),
  KEY idx_gl_entries_date (entry_date),
  KEY idx_gl_entries_source (source_type, source_id),
  KEY idx_gl_entries_loket (loket_code),
  KEY idx_gl_entries_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Journal Lines (detail debit/kredit)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_journal_lines (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id        BIGINT UNSIGNED NOT NULL,
  line_no         SMALLINT UNSIGNED NOT NULL,
  account_code    VARCHAR(20) NOT NULL,
  debit           DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit          DECIMAL(18,2) NOT NULL DEFAULT 0,
  memo            VARCHAR(255) NULL,
  dim_loket       VARCHAR(50) NULL,
  dim_provider    VARCHAR(20) NULL,
  dim_service     VARCHAR(40) NULL,
  dim_product     VARCHAR(80) NULL,
  PRIMARY KEY (id),
  KEY idx_gl_lines_entry (entry_id),
  KEY idx_gl_lines_account (account_code),
  KEY idx_gl_lines_dim_loket (dim_loket),
  KEY idx_gl_lines_dim_provider (dim_provider),
  CONSTRAINT fk_gl_lines_entry FOREIGN KEY (entry_id)
    REFERENCES gl_journal_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_lines_account FOREIGN KEY (account_code)
    REFERENCES gl_accounts(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Triggers — append-only enforcement (single-statement bodies, runner split per titik-koma)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_gl_entries_no_update;
CREATE TRIGGER trg_gl_entries_no_update BEFORE UPDATE ON gl_journal_entries
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gl_journal_entries is append-only';

DROP TRIGGER IF EXISTS trg_gl_entries_no_delete;
CREATE TRIGGER trg_gl_entries_no_delete BEFORE DELETE ON gl_journal_entries
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gl_journal_entries is append-only';

DROP TRIGGER IF EXISTS trg_gl_lines_no_update;
CREATE TRIGGER trg_gl_lines_no_update BEFORE UPDATE ON gl_journal_lines
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gl_journal_lines is append-only';

DROP TRIGGER IF EXISTS trg_gl_lines_no_delete;
CREATE TRIGGER trg_gl_lines_no_delete BEFORE DELETE ON gl_journal_lines
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gl_journal_lines is append-only';

-- ----------------------------------------------------------------------------
-- 5. Seed Chart of Accounts (minimal — 13 akun standar PPOB)
-- ----------------------------------------------------------------------------
INSERT INTO gl_accounts (code, name, account_type, normal_balance, description, is_system) VALUES
  ('1101', 'Kas Loket',                        'ASSET',     'DEBIT',  'Kas tunai yang dipegang loket dari pembayaran pelanggan', 1),
  ('1102', 'Saldo Deposit Provider',           'ASSET',     'DEBIT',  'Saldo loket yang tersimpan di aggregator/provider (kolom pulsa di tabel lokets)', 1),
  ('1201', 'Piutang Settlement',               'ASSET',     'DEBIT',  'Tagihan yang sudah dibayar tapi belum disetorkan oleh loket', 1),
  ('2101', 'Hutang Settlement ke Loket',       'LIABILITY', 'CREDIT', 'Dana yang harus disetor oleh kantor pusat ke loket', 1),
  ('2102', 'Titipan Pelanggan',                'LIABILITY', 'CREDIT', 'Pembayaran pelanggan yang belum diteruskan ke provider', 1),
  ('3101', 'Modal Disetor',                    'EQUITY',    'CREDIT', 'Modal awal / setoran tambahan dari pemilik/loket', 1),
  ('3201', 'Laba Ditahan',                     'EQUITY',    'CREDIT', 'Akumulasi laba periode-periode sebelumnya', 1),
  ('4101', 'Pendapatan Biaya Admin',           'INCOME',    'CREDIT', 'Pendapatan dari biaya admin yang dibebankan ke pelanggan', 1),
  ('4102', 'Pendapatan Margin Provider',       'INCOME',    'CREDIT', 'Selisih harga jual vs harga modal dari provider (markup)', 1),
  ('4901', 'Pendapatan Lain-lain',             'INCOME',    'CREDIT', 'Pendapatan non-operasional', 1),
  ('5101', 'Beban Provider/Aggregator',        'EXPENSE',   'DEBIT',  'Fee yang dipotong oleh provider per transaksi', 1),
  ('5201', 'Beban Operasional',                'EXPENSE',   'DEBIT',  'Beban operasional umum (listrik, internet, dll)', 1),
  ('5901', 'Beban Penyesuaian / Selisih',      'EXPENSE',   'DEBIT',  'Selisih kas atau penyesuaian akuntansi', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
