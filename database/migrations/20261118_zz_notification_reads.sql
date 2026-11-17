-- Status "sudah dibaca" per user. Dulu hanya ada kolom notifications.is_read (satu per baris),
-- sehingga notifikasi siaran / per peran yang dibaca satu orang ikut terlihat terbaca oleh
-- semua orang. Mulai sekarang menandai dibaca menulis ke tabel ini.
-- notifications.is_read tetap dibaca sebagai status lama (sebelum tabel ini ada).
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id BIGINT NOT NULL,
  username VARCHAR(100) NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, username),
  KEY idx_nr_username (username, notification_id),
  CONSTRAINT fk_nr_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
