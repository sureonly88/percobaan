-- Kehadiran pengguna (terakhir aktif) untuk fitur Pantau Agen.
-- Diperbarui ringan oleh aplikasi (desktop dan /m) selama halaman terbuka, maksimal sekali per menit.
-- channel: mobile = versi /m (PWA agen keliling), web = desktop.
CREATE TABLE IF NOT EXISTS user_presence (
  username VARCHAR(128) NOT NULL,
  last_seen_at DATETIME NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'web',
  last_path VARCHAR(255) NULL,
  user_agent VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (username),
  KEY idx_presence_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
