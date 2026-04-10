-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recipient_username VARCHAR(100) NOT NULL COMMENT 'Target user, or "*" for broadcast',
  recipient_role VARCHAR(20) DEFAULT NULL COMMENT 'Target role (admin/supervisor/kasir), NULL = specific user only',
  category ENUM('transaksi','saldo','sistem','pengumuman') NOT NULL DEFAULT 'sistem',
  severity ENUM('info','warning','error','success') NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500) DEFAULT NULL COMMENT 'Optional deep-link path e.g. /monitoring/abc-123',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME DEFAULT NULL,
  INDEX idx_notif_recipient (recipient_username, is_read, created_at DESC),
  INDEX idx_notif_role (recipient_role, is_read, created_at DESC),
  INDEX idx_notif_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
