-- Fix collation mismatch antara settlement_batches/settlement_batch_items
-- (dibuat dengan utf8mb4_unicode_ci) dan tabel baseline seperti
-- multi_payment_requests / payment_requests (utf8mb4_general_ci).
-- Tanpa ini JOIN pada idempotency_key dan loket_code akan menghasilkan:
--   Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT)
--   and (utf8mb4_general_ci,IMPLICIT) for operation '='

ALTER TABLE settlement_batches
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE settlement_batch_items
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
