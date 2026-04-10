-- Composite indexes for optimized query patterns
-- Run: mysql -u yakinyakin pedami_payment < database/migrations/20260408_composite_indexes.sql

-- Monitoring: stuck query (status + created_at)
CREATE INDEX IF NOT EXISTS idx_payreq_status_created ON payment_requests (status, created_at);

-- Monitoring: error_code grouping
CREATE INDEX IF NOT EXISTS idx_payreq_error_code ON payment_requests (error_code);

-- Transaction events: LEFT JOIN optimization (idempotency_key + id DESC for latest event)
CREATE INDEX IF NOT EXISTS idx_te_idemkey_id ON transaction_events (idempotency_key, id DESC);

-- Laporan detail: LEFT JOIN on transaction_events by transaction_code
CREATE INDEX IF NOT EXISTS idx_te_txcode_idemkey ON transaction_events (transaction_code, idempotency_key);
