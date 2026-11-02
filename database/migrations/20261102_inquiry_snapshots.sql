-- Snapshot hasil inquiry provider (PDAM / Lunasin) per user.
-- Dipakai endpoint pay untuk memakai nominal otoritatif dari server,
-- bukan nominal yang dikirim client.
--   PDAM    : ref_key = thbln (periode tagihan)
--   LUNASIN : ref_key = id_trx hasil inquiry

CREATE TABLE IF NOT EXISTS inquiry_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(20) NOT NULL,
  username VARCHAR(128) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  ref_key VARCHAR(100) NOT NULL,
  amount DECIMAL(15,0) NOT NULL DEFAULT 0,
  admin_fee DECIMAL(15,0) NOT NULL DEFAULT 0,
  total DECIMAL(15,0) NOT NULL DEFAULT 0,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inquiry_snapshots_ref (provider, username, customer_id, ref_key),
  KEY idx_inquiry_snapshots_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
