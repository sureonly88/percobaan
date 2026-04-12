-- Migration: Loket admin flag + nonaktif status
-- Adds is_loket_admin flag to identify the owner/admin of a loket
-- Adds 'nonaktif' to status enum for deactivation by loket admin

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `is_loket_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;

ALTER TABLE `users`
  MODIFY COLUMN `status` ENUM('pending','aktif','ditolak','nonaktif') NOT NULL DEFAULT 'aktif';
