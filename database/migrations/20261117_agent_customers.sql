-- Pelanggan langganan milik agen (versi mobile /m). Terpisah dari customer_favorites desktop
-- (ENUM PDAM/PLN saja) karena agen butuh semua produk tagihan, nomor WA, dan catatan alamat.
-- product_slug mengikuti katalog src/lib/mobile/products.ts (pdam, pln-pasca, bpjs, dst.).
-- product_code dipakai untuk PDAM daerah lain (kode Lunasin), selain itu kosong.
CREATE TABLE IF NOT EXISTS agent_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(128) NOT NULL,
  product_slug VARCHAR(32) NOT NULL,
  product_code VARCHAR(100) NOT NULL DEFAULT '',
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(255) NULL,
  alias_name VARCHAR(100) NULL,
  wa_number VARCHAR(20) NULL,
  note VARCHAR(255) NULL,
  last_paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_agent_customer (username, product_slug, product_code, customer_id),
  KEY idx_agent_customers_user (username, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
