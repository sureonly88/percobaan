-- Index untuk GET /report/migrasi/pdambjm (filter service_type + rentang paid_at).
CREATE INDEX IF NOT EXISTS idx_mpi_service_paid_at
  ON multi_payment_items (service_type, paid_at);
