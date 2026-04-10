-- Migration: Create runtime-created tables and ensure loket columns
-- Run this before deploying to production

-- App settings table
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Customer favorites table
CREATE TABLE IF NOT EXISTS customer_favorites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  service_type ENUM('PDAM', 'PLN') NOT NULL DEFAULT 'PDAM',
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) DEFAULT NULL,
  alias_name VARCHAR(150) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_customer_favorites_user_service_customer (user_id, service_type, customer_id),
  KEY idx_customer_favorites_user_service_last_used (user_id, service_type, last_used_at DESC),
  KEY idx_customer_favorites_user_updated (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Loket table column additions
ALTER TABLE lokets ADD COLUMN IF NOT EXISTS status ENUM('aktif','nonaktif') NOT NULL DEFAULT 'aktif';
ALTER TABLE lokets ADD COLUMN IF NOT EXISTS alamat VARCHAR(255) DEFAULT '';
ALTER TABLE lokets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
