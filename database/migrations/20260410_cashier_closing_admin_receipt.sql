-- Migration: admin receipt fields for cashier closing verification
-- Purpose:
--   1. store actual cash amount received by admin
--   2. compare received amount vs cashier submitted deposit

ALTER TABLE cashier_closings
  ADD COLUMN IF NOT EXISTS received_amount DECIMAL(15,0) NOT NULL DEFAULT 0 AFTER deposit_total,
  ADD COLUMN IF NOT EXISTS received_difference_amount DECIMAL(15,0) NOT NULL DEFAULT 0 AFTER received_amount,
  ADD COLUMN IF NOT EXISTS received_at DATETIME NULL AFTER submitted_at,
  ADD COLUMN IF NOT EXISTS received_by VARCHAR(128) NULL AFTER received_at;