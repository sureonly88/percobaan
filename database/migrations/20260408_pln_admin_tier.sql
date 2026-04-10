-- Add PLN admin tier column to lokets table
-- This stores the admin fee tier for PLN products (e.g., 3000 = pln-postpaid-3000)
ALTER TABLE lokets ADD COLUMN pln_admin_tier INT NOT NULL DEFAULT 3000;

-- Change default biaya_admin from 2500 to 0
ALTER TABLE lokets ALTER COLUMN biaya_admin SET DEFAULT 0;
