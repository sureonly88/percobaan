-- PIN kunci aplikasi versi mobile (/m). PIN hanya disimpan sebagai hash bcrypt.
-- failed_attempts disimpan di DB (bukan memori) agar batas salah PIN tetap berlaku
-- walau server restart. Mencapai batas → sesi dipaksa keluar, lalu PIN harus dibuat ulang
-- dengan password akun.
CREATE TABLE IF NOT EXISTS user_app_pins (
  username VARCHAR(128) NOT NULL,
  pin_hash VARCHAR(100) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
