-- Add jenis_kasir column to lokets table
ALTER TABLE lokets ADD COLUMN jenis_kasir ENUM('PM', 'SWITCHER') NOT NULL DEFAULT 'PM' AFTER jenis;
