-- Top-up requests: user self-service deposit via payment gateway
CREATE TABLE IF NOT EXISTS topup_requests (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_code     VARCHAR(64)  NOT NULL UNIQUE,
  loket_code       VARCHAR(32)  NOT NULL,
  username         VARCHAR(64)  NOT NULL,
  nominal          BIGINT       NOT NULL,
  fee              INT          NOT NULL DEFAULT 0,
  total_bayar      BIGINT       NOT NULL,
  status           ENUM('PENDING','SUCCESS','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  payment_method   VARCHAR(32)  DEFAULT NULL,
  gateway          VARCHAR(16)  NOT NULL DEFAULT 'midtrans',
  gateway_order_id VARCHAR(128) NOT NULL UNIQUE,
  gateway_tx_id    VARCHAR(128) DEFAULT NULL,
  snap_token       VARCHAR(255) DEFAULT NULL,
  snap_url         TEXT         DEFAULT NULL,
  expires_at       DATETIME     DEFAULT NULL,
  paid_at          DATETIME     DEFAULT NULL,
  webhook_payload  JSON         DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT NOW(),
  updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_topup_loket      (loket_code),
  INDEX idx_topup_status     (status),
  INDEX idx_topup_created    (created_at DESC),
  INDEX idx_topup_gateway_id (gateway_order_id)
);
