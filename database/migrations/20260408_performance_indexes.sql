-- Migration: Performance indexes for high-traffic operations
-- Run before production deployment

-- pdambjm_trans indexes
CREATE INDEX IF NOT EXISTS idx_pdam_cust_id ON pdambjm_trans (cust_id);
CREATE INDEX IF NOT EXISTS idx_pdam_transaction_code ON pdambjm_trans (transaction_code);
CREATE INDEX IF NOT EXISTS idx_pdam_transaction_date ON pdambjm_trans (transaction_date);
CREATE INDEX IF NOT EXISTS idx_pdam_loket_code ON pdambjm_trans (loket_code);
CREATE INDEX IF NOT EXISTS idx_pdam_processing_status ON pdambjm_trans (processing_status);
CREATE INDEX IF NOT EXISTS idx_pdam_loket_date ON pdambjm_trans (loket_code, transaction_date);
CREATE INDEX IF NOT EXISTS idx_pdam_status_date ON pdambjm_trans (processing_status, transaction_date);

-- lunasin_trans indexes
CREATE INDEX IF NOT EXISTS idx_lunasin_cust_id ON lunasin_trans (cust_id);
CREATE INDEX IF NOT EXISTS idx_lunasin_transaction_code ON lunasin_trans (transaction_code);
CREATE INDEX IF NOT EXISTS idx_lunasin_transaction_date ON lunasin_trans (transaction_date);
CREATE INDEX IF NOT EXISTS idx_lunasin_loket_code ON lunasin_trans (loket_code);
CREATE INDEX IF NOT EXISTS idx_lunasin_processing_status ON lunasin_trans (processing_status);
CREATE INDEX IF NOT EXISTS idx_lunasin_kode_produk ON lunasin_trans (kode_produk);
CREATE INDEX IF NOT EXISTS idx_lunasin_loket_date ON lunasin_trans (loket_code, transaction_date);
CREATE INDEX IF NOT EXISTS idx_lunasin_status_date ON lunasin_trans (processing_status, transaction_date);
CREATE INDEX IF NOT EXISTS idx_lunasin_produk_date ON lunasin_trans (kode_produk, transaction_date);

-- payment_requests indexes
CREATE INDEX IF NOT EXISTS idx_payreq_idempotency ON payment_requests (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payreq_status ON payment_requests (status);
CREATE INDEX IF NOT EXISTS idx_payreq_created ON payment_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_payreq_loket_status ON payment_requests (loket_code, status);

-- transaction_events indexes
CREATE INDEX IF NOT EXISTS idx_txevents_idempotency ON transaction_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_txevents_transaction_code ON transaction_events (transaction_code);
CREATE INDEX IF NOT EXISTS idx_txevents_created ON transaction_events (created_at);
CREATE INDEX IF NOT EXISTS idx_txevents_event_type ON transaction_events (event_type);

-- lokets indexes
CREATE INDEX IF NOT EXISTS idx_lokets_code ON lokets (loket_code);
CREATE INDEX IF NOT EXISTS idx_lokets_status ON lokets (status);

-- notifications indexes
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications (recipient_username, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_role ON notifications (recipient_role, is_read, created_at);
