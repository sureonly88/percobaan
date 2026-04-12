-- Migration: User self-registration support
-- Adds status column to users table for pending/active/rejected states
-- Also adds phone, nama_usaha, alamat_usaha fields for registrant info

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `status`        ENUM('pending','aktif','ditolak') NOT NULL DEFAULT 'aktif' AFTER `role`,
  ADD COLUMN IF NOT EXISTS `phone`         VARCHAR(20)  DEFAULT NULL AFTER `email`,
  ADD COLUMN IF NOT EXISTS `nama_usaha`    VARCHAR(255) DEFAULT NULL AFTER `phone`,
  ADD COLUMN IF NOT EXISTS `alamat_usaha`  TEXT         DEFAULT NULL AFTER `nama_usaha`,
  ADD COLUMN IF NOT EXISTS `catatan_tolak` VARCHAR(500) DEFAULT NULL AFTER `alamat_usaha`;

-- Index for fast pending list queries
ALTER TABLE `users`
  ADD INDEX IF NOT EXISTS `idx_users_status` (`status`);
