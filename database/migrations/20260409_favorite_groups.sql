-- Migration: Favorite groups — multi-customer favorites for batch inquiry

CREATE TABLE IF NOT EXISTS favorite_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  group_name VARCHAR(150) NOT NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fg_user_last_used (user_id, last_used_at DESC),
  KEY idx_fg_user_updated (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorite_group_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  service_type VARCHAR(20) NOT NULL DEFAULT 'PDAM',
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) DEFAULT NULL,
  product_code VARCHAR(100) NOT NULL DEFAULT '',
  input2 VARCHAR(100) NOT NULL DEFAULT '',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_fgi_group FOREIGN KEY (group_id) REFERENCES favorite_groups(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_fgi_group_service_customer_product (group_id, service_type, customer_id, product_code),
  KEY idx_fgi_group_sort (group_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
