-- Migration: Loket admin flag + nonaktif status
-- Adds is_loket_admin flag to identify the owner/admin of a loket
-- Adds 'nonaktif' to status enum for deactivation by loket admin
--
-- NOTE: This file sorts before 20260412_user_registration.sql lexicographically
-- ("l" < "u"), so on a fresh server it runs first. We must therefore add the
-- `status` column ourselves before the MODIFY COLUMN can reference it.

-- 1. Add status column if it does not exist yet (safe no-op if it does)
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `status` ENUM('pending','aktif','ditolak','nonaktif') NOT NULL DEFAULT 'aktif' AFTER `role`;

-- 2. Expand enum to include 'nonaktif' (no-op if column was just created above)
ALTER TABLE `users`
  MODIFY COLUMN `status` ENUM('pending','aktif','ditolak','nonaktif') NOT NULL DEFAULT 'aktif';

-- 3. Add is_loket_admin flag
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `is_loket_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;
