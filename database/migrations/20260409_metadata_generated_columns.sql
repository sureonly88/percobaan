-- ============================================================
-- Generated (virtual) columns for frequently queried
-- metadata_json fields in multi_payment_items.
-- These are VIRTUAL columns: no extra disk space, computed
-- on read, and indexable for fast lookups.
-- ============================================================

-- PDAM: golongan pelanggan (used in WHERE + SELECT DISTINCT filter)
ALTER TABLE multi_payment_items
  ADD COLUMN meta_idgol VARCHAR(20) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.idgol'))
  ) VIRTUAL AFTER metadata_json;

ALTER TABLE multi_payment_items
  ADD INDEX idx_mpi_meta_idgol (meta_idgol);

-- LUNASIN: id transaksi provider (used in advice GET query)
ALTER TABLE multi_payment_items
  ADD COLUMN meta_id_trx VARCHAR(50) GENERATED ALWAYS AS (
    JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.idTrx'))
  ) VIRTUAL AFTER meta_idgol;

ALTER TABLE multi_payment_items
  ADD INDEX idx_mpi_meta_id_trx (meta_id_trx);

-- Composite index for advice listing: provider + status + meta_id_trx
ALTER TABLE multi_payment_items
  ADD INDEX idx_mpi_advice_lookup (provider, status, meta_id_trx);
