-- Add max_pdam_tagihan column to lokets table
-- NULL = unlimited (no restriction)
-- Positive integer = max number of PDAM bill months allowed per transaction
ALTER TABLE `lokets`
  ADD COLUMN `max_pdam_tagihan` int(11) NULL DEFAULT NULL
    COMMENT 'Maks jumlah tagihan PDAM per transaksi. NULL = tidak dibatasi.';
