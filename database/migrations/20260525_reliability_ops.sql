-- ─────────────────────────────────────────────────────────────────────────────
-- Operasional & Keandalan (item #1):
--   - audit_logs       : log immutable hash-chained untuk aksi sensitif
--   - provider_health  : persist circuit-breaker state + rollup latency/success
--   - provider_health_samples : raw sample latency per panggilan provider
--   - system_jobs      : cron lock + last-run tracking untuk auto-resolve worker
-- Catatan: migration runner split per titik-koma, sehingga trigger ditulis sebagai
-- single-statement (tanpa BEGIN..END).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. AUDIT LOGS (append-only, hash-chained)
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_type      ENUM('user','system','cron') NOT NULL DEFAULT 'user',
  actor_username  VARCHAR(128) NULL,
  actor_role      VARCHAR(32)  NULL,
  actor_ip        VARCHAR(64)  NULL,
  action          VARCHAR(96)  NOT NULL,
  entity_type     VARCHAR(64)  NOT NULL,
  entity_id       VARCHAR(128) NULL,
  before_json     JSON         NULL,
  after_json      JSON         NULL,
  context_json    JSON         NULL,
  prev_hash       CHAR(64)     NULL,
  hash            CHAR(64)     NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_action_created (action, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_actor (actor_username, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Triggers (single-statement bodies) untuk membuat audit_logs append-only.
DROP TRIGGER IF EXISTS trg_audit_logs_no_update;
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;
CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

-- 2. PROVIDER HEALTH (state per provider, dipersist supaya tahan restart)
CREATE TABLE IF NOT EXISTS provider_health (
  provider_name        VARCHAR(64) NOT NULL,
  state                ENUM('CLOSED','OPEN','HALF_OPEN') NOT NULL DEFAULT 'CLOSED',
  failure_count        INT UNSIGNED NOT NULL DEFAULT 0,
  last_failure_at      DATETIME NULL,
  last_success_at      DATETIME NULL,
  opened_at            DATETIME NULL,
  success_24h          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  failure_24h          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  avg_latency_ms_24h   INT UNSIGNED NOT NULL DEFAULT 0,
  p95_latency_ms_24h   INT UNSIGNED NOT NULL DEFAULT 0,
  rollup_updated_at    DATETIME NULL,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. PROVIDER HEALTH SAMPLES (raw, dipurge oleh cron health-rollup)
CREATE TABLE IF NOT EXISTS provider_health_samples (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_name VARCHAR(64)  NOT NULL,
  operation     VARCHAR(64)  NOT NULL,
  success       TINYINT(1)   NOT NULL,
  latency_ms    INT UNSIGNED NOT NULL,
  error_code    VARCHAR(64)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_phs_provider_created (provider_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. SYSTEM JOBS (cron lock + last-run history)
CREATE TABLE IF NOT EXISTS system_jobs (
  job_name      VARCHAR(96) NOT NULL,
  is_locked     TINYINT(1)  NOT NULL DEFAULT 0,
  locked_at     DATETIME    NULL,
  locked_by     VARCHAR(96) NULL,
  last_run_at   DATETIME    NULL,
  last_run_ms   INT         NULL,
  last_status   ENUM('SUCCESS','FAILED','RUNNING') NULL,
  last_summary  TEXT        NULL,
  run_count     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  fail_count    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (job_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed baris untuk job yang dikenal supaya UPDATE-based lock bekerja
INSERT IGNORE INTO system_jobs (job_name) VALUES ('auto_resolve_pending');
INSERT IGNORE INTO system_jobs (job_name) VALUES ('provider_health_rollup');

-- Seed baris provider_health untuk provider yang dipakai
INSERT IGNORE INTO provider_health (provider_name) VALUES ('PDAM');
INSERT IGNORE INTO provider_health (provider_name) VALUES ('LUNASIN');
