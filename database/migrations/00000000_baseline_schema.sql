-- =============================================================================
-- BASELINE SCHEMA — pedami_payment
-- =============================================================================
-- File ini adalah definisi lengkap seluruh tabel database.
-- Gunakan sebagai titik awal deployment ke server baru.
-- Aman dijalankan ulang: semua statement menggunakan IF NOT EXISTS.
-- Urutan CREATE TABLE memperhatikan dependensi foreign key.
-- =============================================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`             int(11)       NOT NULL AUTO_INCREMENT,
  `name`           varchar(255)  DEFAULT NULL,
  `username`       varchar(255)  NOT NULL,
  `email`          varchar(255)  DEFAULT NULL,
  `password`       varchar(255)  NOT NULL,
  `role`           varchar(255)  DEFAULT NULL,
  `loket_id`       int(11)       DEFAULT NULL,
  `api_token`      varchar(255)  DEFAULT NULL,
  `remember_token` varchar(255)  DEFAULT NULL,
  `session_id`     varchar(40)   DEFAULT NULL,
  `ip_address`     varchar(50)   DEFAULT NULL,
  `created_at`     datetime(6)   NOT NULL DEFAULT current_timestamp(6),
  `updated_at`     datetime(6)   NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_fe0bb3f6520ee0469504521e71` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. lokets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `lokets` (
  `id`           int(11)       NOT NULL AUTO_INCREMENT,
  `nama`         varchar(255)  DEFAULT NULL,
  `alamat`       varchar(255)  DEFAULT NULL,
  `loket_code`   varchar(255)  DEFAULT NULL,
  `is_blok`      tinyint(4)    NOT NULL DEFAULT 0,
  `blok_message` varchar(255)  DEFAULT NULL,
  `byadmin`      varchar(255)  DEFAULT NULL,
  `jenis`        varchar(255)  DEFAULT NULL,
  `pulsa`        decimal(10,0) NOT NULL DEFAULT 0,
  `biaya_admin`  decimal(10,0) NOT NULL DEFAULT 0,
  `pln_admin_tier` int(11)     NOT NULL DEFAULT 3000,
  `tipe`         text          DEFAULT NULL,
  `status`       enum('aktif','nonaktif') NOT NULL DEFAULT 'aktif',
  `created_at`   datetime(6)   NOT NULL DEFAULT current_timestamp(6),
  `updated_at`   datetime(6)   NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `idx_lokets_code`   (`loket_code`),
  KEY `idx_lokets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. app_settings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key`   varchar(100) NOT NULL,
  `setting_value` text         NOT NULL,
  `updated_at`    timestamp    NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. log_inquery
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `log_inquery` (
  `id`         int(11)      NOT NULL AUTO_INCREMENT,
  `jenis`      varchar(100) NOT NULL,
  `log`        longtext     NOT NULL,
  `created_at` datetime     NOT NULL,
  `user_login` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. request_saldo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `request_saldo` (
  `id`                  int(11)       NOT NULL AUTO_INCREMENT,
  `request_code`        varchar(100)  NOT NULL,
  `username`            varchar(80)   NOT NULL,
  `kode_loket`          varchar(80)   NOT NULL,
  `request_saldo`       decimal(50,0) NOT NULL,
  `tgl_request`         datetime      NOT NULL,
  `ket_request`         varchar(350)  NOT NULL,
  `is_konfirmasi`       int(11)       DEFAULT NULL,
  `tgl_konfirmasi`      datetime      DEFAULT NULL,
  `ket_konfirmasi`      varchar(350)  DEFAULT NULL,
  `metode_bayar`        varchar(80)   DEFAULT NULL,
  `total_konfirmasi`    decimal(50,0) DEFAULT NULL,
  `tgl_bayar`           datetime      DEFAULT NULL,
  `bank_konfirmasi`     varchar(100)  DEFAULT NULL,
  `nama_pemilik_bank`   varchar(100)  DEFAULT NULL,
  `is_verifikasi`       int(11)       DEFAULT NULL,
  `verifikasi_saldo`    decimal(50,0) DEFAULT NULL,
  `username_verifikasi` varchar(100)  DEFAULT NULL,
  `tgl_verifikasi`      datetime      DEFAULT NULL,
  `status_verifikasi`   varchar(50)   DEFAULT NULL,
  `ket_verifikasi`      varchar(350)  DEFAULT NULL,
  `id_bank_tujuan`      int(11)       NOT NULL,
  `updated_at`          timestamp     NULL DEFAULT NULL,
  `created_at`          timestamp     NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. pdambjm_trans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pdambjm_trans` (
  `id`                     int(11)       NOT NULL AUTO_INCREMENT,
  `transaction_code`       varchar(150)  NOT NULL,
  `transaction_date`       timestamp     NOT NULL DEFAULT current_timestamp(),
  `cust_id`                varchar(50)   NOT NULL,
  `nama`                   varchar(150)  NOT NULL,
  `alamat`                 varchar(150)  NOT NULL,
  `blth`                   varchar(10)   NOT NULL,
  `harga_air`              decimal(15,0) NOT NULL,
  `abodemen`               decimal(15,0) NOT NULL,
  `materai`                decimal(10,0) NOT NULL,
  `limbah`                 decimal(10,0) NOT NULL,
  `retribusi`              decimal(10,0) NOT NULL,
  `denda`                  decimal(10,0) NOT NULL,
  `stand_lalu`             decimal(15,3) NOT NULL,
  `stand_kini`             decimal(15,3) NOT NULL,
  `sub_total`              decimal(10,0) NOT NULL,
  `admin`                  decimal(15,2) NOT NULL,
  `total`                  decimal(15,0) NOT NULL,
  `username`               varchar(30)   NOT NULL,
  `loket_name`             varchar(30)   DEFAULT NULL,
  `loket_code`             varchar(30)   NOT NULL,
  `idgol`                  varchar(10)   NOT NULL,
  `jenis_loket`            varchar(30)   NOT NULL,
  `beban_tetap`            decimal(8,2)  DEFAULT NULL,
  `biaya_meter`            decimal(8,2)  DEFAULT NULL,
  `flag_transaksi`         varchar(100)  DEFAULT NULL,
  `processing_status`      enum('PENDING','SUCCESS','FAILED') DEFAULT NULL,
  `provider_error_code`    varchar(64)   DEFAULT NULL,
  `provider_error_message` text          DEFAULT NULL,
  `diskon`                 decimal(10,0) DEFAULT NULL,
  `paid_at`                datetime      DEFAULT NULL,
  `failed_at`              datetime      DEFAULT NULL,
  `created_at`             timestamp     NULL DEFAULT NULL,
  `updated_at`             timestamp     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `transaction_date`            (`transaction_date`),
  KEY `jenis_loket`                 (`jenis_loket`),
  KEY `cust_id`                     (`cust_id`),
  KEY `nama`                        (`nama`),
  KEY `loket_code`                  (`loket_code`),
  KEY `idx_pdam_cust_id`            (`cust_id`),
  KEY `idx_pdam_transaction_code`   (`transaction_code`),
  KEY `idx_pdam_transaction_date`   (`transaction_date`),
  KEY `idx_pdam_loket_code`         (`loket_code`),
  KEY `idx_pdam_processing_status`  (`processing_status`),
  KEY `idx_pdam_loket_date`         (`loket_code`, `transaction_date`),
  KEY `idx_pdam_status_date`        (`processing_status`, `transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. transaksi_pln
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `transaksi_pln` (
  `id`                 bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `subcriber_id`       text          NOT NULL,
  `subcriber_name`     text          NOT NULL,
  `subcriber_segment`  text          NOT NULL,
  `switcher_ref`       text          NOT NULL,
  `power_consumtion`   text          DEFAULT NULL,
  `trace_audit_number` text          DEFAULT NULL,
  `bill_periode`       text          NOT NULL,
  `added_tax`          decimal(8,2)  NOT NULL,
  `incentive`          text          DEFAULT NULL,
  `penalty_fee`        decimal(8,2)  NOT NULL,
  `admin_charge`       decimal(8,2)  NOT NULL,
  `total_elec_bill`    decimal(20,2) NOT NULL,
  `username`           text          NOT NULL,
  `loket_name`         text          NOT NULL,
  `loket_code`         text          NOT NULL,
  `jenis_loket`        text          NOT NULL,
  `transaction_code`   text          NOT NULL,
  `outstanding_bill`   text          NOT NULL,
  `bill_status`        text          NOT NULL,
  `prev_meter_read_1`  text          NOT NULL,
  `curr_meter_read_1`  text          NOT NULL,
  `prev_meter_read_2`  text          NOT NULL,
  `curr_meter_read_2`  text          NOT NULL,
  `prev_meter_read_3`  text          NOT NULL,
  `curr_meter_read_3`  text          NOT NULL,
  `idpelblth`          char(80)      NOT NULL,
  `flag_transaksi`     varchar(100)  DEFAULT NULL,
  `jenis`              varchar(20)   DEFAULT NULL,
  `transaction_date`   timestamp     NULL DEFAULT NULL,
  `created_at`         timestamp     NULL DEFAULT current_timestamp(),
  `updated_at`         timestamp     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaksi_pln_idpelblth_unique` (`idpelblth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. lunasin_trans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `lunasin_trans` (
  `id`                     int(11)       NOT NULL AUTO_INCREMENT,
  `transaction_code`       varchar(150)  NOT NULL,
  `transaction_date`       timestamp     NOT NULL DEFAULT current_timestamp(),
  `cust_id`                varchar(50)   NOT NULL,
  `nama`                   varchar(150)  NOT NULL,
  `kode_produk`            varchar(50)   NOT NULL COMMENT 'e.g. pln-postpaid-3000, pln-prepaid-3000',
  `id_trx`                 varchar(30)   NOT NULL COMMENT 'Lunasin transaction ID from inquiry',
  `periode`                varchar(20)   DEFAULT NULL,
  `jum_bill`               varchar(5)    DEFAULT NULL,
  `tarif`                  varchar(10)   DEFAULT NULL,
  `daya`                   varchar(10)   DEFAULT NULL,
  `stand_meter`            varchar(30)   DEFAULT NULL,
  `rp_amount`              decimal(15,0) NOT NULL DEFAULT 0,
  `rp_admin`               decimal(15,0) NOT NULL DEFAULT 0,
  `rp_total`               decimal(15,0) NOT NULL DEFAULT 0,
  `refnum_lunasin`         varchar(50)   DEFAULT NULL,
  `token_pln`              varchar(50)   DEFAULT NULL,
  `username`               varchar(30)   NOT NULL,
  `loket_name`             varchar(30)   DEFAULT NULL,
  `loket_code`             varchar(30)   NOT NULL,
  `jenis_loket`            varchar(30)   NOT NULL DEFAULT 'SWITCHING',
  `flag_transaksi`         varchar(100)  DEFAULT NULL,
  `processing_status`      enum('PENDING','SUCCESS','FAILED') DEFAULT NULL,
  `provider_error_code`    varchar(64)   DEFAULT NULL,
  `provider_error_message` text          DEFAULT NULL,
  `provider_rc`            varchar(10)   DEFAULT NULL,
  `provider_response`      longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`provider_response`)),
  `advice_attempts`        int(11)       DEFAULT 0,
  `paid_at`                datetime      DEFAULT NULL,
  `failed_at`              datetime      DEFAULT NULL,
  `created_at`             timestamp     NULL DEFAULT NULL,
  `updated_at`             timestamp     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lunasin_transaction_code`  (`transaction_code`),
  KEY `idx_lunasin_cust_id`           (`cust_id`),
  KEY `idx_lunasin_transaction_date`  (`transaction_date`),
  KEY `idx_lunasin_loket_code`        (`loket_code`),
  KEY `idx_lunasin_processing_status` (`processing_status`),
  KEY `idx_lunasin_kode_produk`       (`kode_produk`),
  KEY `idx_lunasin_id_trx`            (`id_trx`),
  KEY `idx_lunasin_loket_date`        (`loket_code`, `transaction_date`),
  KEY `idx_lunasin_status_date`       (`processing_status`, `transaction_date`),
  KEY `idx_lunasin_produk_date`       (`kode_produk`, `transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. payment_requests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payment_requests` (
  `id`               bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `idempotency_key`  varchar(128)  NOT NULL,
  `request_hash`     char(64)      NOT NULL,
  `status`           enum('PENDING','SUCCESS','PARTIAL_SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `provider`         varchar(32)   NOT NULL DEFAULT 'PDAM',
  `loket_code`       varchar(64)   DEFAULT NULL,
  `username`         varchar(128)  DEFAULT NULL,
  `request_payload`  longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`request_payload`)),
  `response_payload` longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`response_payload`)),
  `error_code`       varchar(64)   DEFAULT NULL,
  `error_message`    text          DEFAULT NULL,
  `created_at`       datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`       datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_requests_idempotency_key` (`idempotency_key`),
  KEY `idx_payreq_idempotency`      (`idempotency_key`),
  KEY `idx_payreq_status`           (`status`),
  KEY `idx_payreq_created`          (`created_at`),
  KEY `idx_payreq_loket_status`     (`loket_code`, `status`),
  KEY `idx_payreq_status_created`   (`status`, `created_at`),
  KEY `idx_payreq_error_code`       (`error_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`                 bigint(20)   NOT NULL AUTO_INCREMENT,
  `recipient_username` varchar(100) NOT NULL COMMENT 'Target user, or "*" for broadcast',
  `recipient_role`     varchar(20)  DEFAULT NULL COMMENT 'Target role (admin/supervisor/kasir)',
  `category`           enum('transaksi','saldo','sistem','pengumuman') NOT NULL DEFAULT 'sistem',
  `severity`           enum('info','warning','error','success')        NOT NULL DEFAULT 'info',
  `title`              varchar(255) NOT NULL,
  `message`            text         NOT NULL,
  `link`               varchar(500) DEFAULT NULL,
  `is_read`            tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`         datetime     NOT NULL DEFAULT current_timestamp(),
  `read_at`            datetime     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_recipient` (`recipient_username`, `is_read`, `created_at` DESC),
  KEY `idx_notif_role`      (`recipient_role`,     `is_read`, `created_at` DESC),
  KEY `idx_notif_created`   (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. transaction_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `transaction_events` (
  `id`                   bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `idempotency_key`      varchar(255) DEFAULT NULL,
  `multi_payment_code`   varchar(150) DEFAULT NULL,
  `transaction_code`     varchar(255) DEFAULT NULL,
  `provider`             varchar(50)  DEFAULT 'PDAM',
  `event_type`           varchar(100) NOT NULL,
  `severity`             enum('INFO','WARN','ERROR') DEFAULT 'INFO',
  `http_status`          int(11)      DEFAULT NULL,
  `provider_error_code`  varchar(100) DEFAULT NULL,
  `message`              text         DEFAULT NULL,
  `payload_json`         longtext     DEFAULT NULL CHECK (json_valid(`payload_json`)),
  `username`             varchar(100) DEFAULT NULL,
  `loket_code`           varchar(50)  DEFAULT NULL,
  `cust_id`              varchar(100) DEFAULT NULL,
  `created_at`           datetime     NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_te_idemkey_id`              (`idempotency_key`, `id` DESC),
  KEY `idx_te_txcode_idemkey`          (`transaction_code`, `idempotency_key`),
  KEY `idx_txevents_created`           (`created_at`),
  KEY `idx_txevents_event_type`        (`event_type`),
  KEY `idx_transaction_events_multi_payment_code` (`multi_payment_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. api_providers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `api_providers` (
  `id`                   int(11)        NOT NULL AUTO_INCREMENT,
  `name`                 varchar(100)   NOT NULL,
  `code`                 varchar(50)    NOT NULL COMMENT 'Kode unik provider',
  `api_key`              varchar(64)    NOT NULL,
  `api_secret`           varchar(128)   NOT NULL,
  `status`               enum('active','suspended','inactive') NOT NULL DEFAULT 'active',
  `rate_limit_per_minute` int(11)       NOT NULL DEFAULT 60,
  `rate_limit_per_day`   int(11)        NOT NULL DEFAULT 10000,
  `allowed_ips`          text           DEFAULT NULL,
  `webhook_url`          varchar(500)   DEFAULT NULL,
  `webhook_secret`       varchar(128)   DEFAULT NULL,
  `balance`              decimal(15,2)  NOT NULL DEFAULT 0.00,
  `min_balance`          decimal(15,2)  NOT NULL DEFAULT 0.00,
  `admin_fee`            decimal(10,2)  NOT NULL DEFAULT 0.00,
  `user_id`              int(11)        DEFAULT NULL,
  `loket_id`             int(11)        DEFAULT NULL,
  `contact_name`         varchar(100)   DEFAULT NULL,
  `contact_email`        varchar(200)   DEFAULT NULL,
  `contact_phone`        varchar(20)    DEFAULT NULL,
  `notes`                text           DEFAULT NULL,
  `created_at`           timestamp      NULL DEFAULT current_timestamp(),
  `updated_at`           timestamp      NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code`    (`code`),
  UNIQUE KEY `api_key` (`api_key`),
  KEY `idx_provider_code`   (`code`),
  KEY `idx_provider_api_key`(`api_key`),
  KEY `idx_provider_status` (`status`),
  KEY `idx_provider_user`   (`user_id`),
  KEY `idx_provider_loket`  (`loket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. provider_transactions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `provider_transactions` (
  `id`                   bigint(20)     NOT NULL AUTO_INCREMENT,
  `provider_id`          int(11)        NOT NULL,
  `provider_code`        varchar(50)    NOT NULL,
  `provider_ref`         varchar(100)   DEFAULT NULL,
  `idempotency_key`      varchar(100)   NOT NULL COMMENT 'Idempotency key dari provider',
  `transaction_type`     enum('inquiry','payment') NOT NULL,
  `cust_id`              varchar(50)    NOT NULL,
  `status`               enum('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `request_payload`      longtext       CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`request_payload`)),
  `response_payload`     longtext       CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`response_payload`)),
  `amount`               decimal(15,2)  DEFAULT NULL,
  `admin_fee`            decimal(10,2)  DEFAULT NULL,
  `total`                decimal(15,2)  DEFAULT NULL,
  `error_code`           varchar(50)    DEFAULT NULL,
  `error_message`        text           DEFAULT NULL,
  `transaction_code`     varchar(100)   DEFAULT NULL,
  `ip_address`           varchar(45)    DEFAULT NULL,
  `duration_ms`          int(11)        DEFAULT NULL,
  `webhook_status`       enum('pending','sent','failed','not_required') DEFAULT 'not_required',
  `webhook_attempts`     int(11)        DEFAULT 0,
  `webhook_last_attempt` timestamp      NULL DEFAULT NULL,
  `created_at`           timestamp      NULL DEFAULT current_timestamp(),
  `updated_at`           timestamp      NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_idempotency` (`provider_id`, `idempotency_key`),
  KEY `idx_pt_provider`      (`provider_id`),
  KEY `idx_pt_provider_code` (`provider_code`),
  KEY `idx_pt_status`        (`status`),
  KEY `idx_pt_cust`          (`cust_id`),
  KEY `idx_pt_created`       (`created_at`),
  KEY `idx_pt_webhook`       (`webhook_status`),
  KEY `idx_pt_txcode`        (`transaction_code`),
  CONSTRAINT `fk_pt_provider` FOREIGN KEY (`provider_id`) REFERENCES `api_providers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. customer_favorites
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customer_favorites` (
  `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id`       bigint(20)    NOT NULL,
  `service_type`  enum('PDAM','PLN') NOT NULL DEFAULT 'PDAM',
  `customer_id`   varchar(64)   NOT NULL,
  `customer_name` varchar(150)  DEFAULT NULL,
  `alias_name`    varchar(150)  DEFAULT NULL,
  `address`       varchar(255)  DEFAULT NULL,
  `usage_count`   int(10) unsigned NOT NULL DEFAULT 1,
  `last_used_at`  datetime      NOT NULL DEFAULT current_timestamp(),
  `created_at`    datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`    datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_customer_favorites_user_service_customer` (`user_id`, `service_type`, `customer_id`),
  KEY `idx_customer_favorites_user_service_last_used` (`user_id`, `service_type`, `last_used_at` DESC),
  KEY `idx_customer_favorites_user_updated`           (`user_id`, `updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. favorite_groups
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `favorite_groups` (
  `id`           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id`      bigint(20)  NOT NULL,
  `group_name`   varchar(150) NOT NULL,
  `usage_count`  int(10) unsigned NOT NULL DEFAULT 0,
  `last_used_at` datetime    DEFAULT NULL,
  `created_at`   datetime    NOT NULL DEFAULT current_timestamp(),
  `updated_at`   datetime    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fg_user_last_used` (`user_id`, `last_used_at` DESC),
  KEY `idx_fg_user_updated`   (`user_id`, `updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. favorite_group_items  (FK → favorite_groups)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `favorite_group_items` (
  `id`            bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `group_id`      bigint(20) unsigned NOT NULL,
  `service_type`  varchar(20)  NOT NULL DEFAULT 'PDAM',
  `customer_id`   varchar(64)  NOT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `product_code`  varchar(100) NOT NULL DEFAULT '',
  `input2`        varchar(100) NOT NULL DEFAULT '',
  `sort_order`    smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at`    datetime     NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fgi_group_service_customer_product` (`group_id`, `service_type`, `customer_id`, `product_code`),
  KEY `idx_fgi_group_sort` (`group_id`, `sort_order`),
  CONSTRAINT `fk_fgi_group` FOREIGN KEY (`group_id`) REFERENCES `favorite_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. multi_payment_requests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `multi_payment_requests` (
  `id`                 bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `multi_payment_code` varchar(150)  NOT NULL,
  `idempotency_key`    varchar(128)  NOT NULL,
  `status`             enum('PENDING','SUCCESS','PARTIAL_SUCCESS','FAILED','PENDING_REVIEW') NOT NULL DEFAULT 'PENDING',
  `loket_code`         varchar(64)   DEFAULT NULL,
  `loket_name`         varchar(150)  DEFAULT NULL,
  `username`           varchar(128)  DEFAULT NULL,
  `total_items`        int(10) unsigned NOT NULL DEFAULT 0,
  `total_amount`       decimal(15,0) NOT NULL DEFAULT 0,
  `total_admin`        decimal(15,0) NOT NULL DEFAULT 0,
  `grand_total`        decimal(15,0) NOT NULL DEFAULT 0,
  `paid_amount`        decimal(15,0) NOT NULL DEFAULT 0,
  `change_amount`      decimal(15,0) NOT NULL DEFAULT 0,
  `request_payload`    longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`request_payload`)),
  `response_payload`   longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`response_payload`)),
  `error_code`         varchar(64)   DEFAULT NULL,
  `error_message`      text          DEFAULT NULL,
  `paid_at`            datetime      DEFAULT NULL,
  `created_at`         datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`         datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_multi_payment_code`            (`multi_payment_code`),
  UNIQUE KEY `uq_multi_payment_idempotency_key` (`idempotency_key`),
  KEY `idx_multi_payment_status_created_at`  (`status`,     `created_at`),
  KEY `idx_multi_payment_loket_created_at`   (`loket_code`, `created_at`),
  KEY `idx_multi_payment_username_created_at`(`username`,   `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. multi_payment_items  (FK → multi_payment_requests)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `multi_payment_items` (
  `id`                     bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `multi_payment_id`       bigint(20) unsigned NOT NULL,
  `item_code`              varchar(150)  NOT NULL,
  `provider`               varchar(32)   NOT NULL,
  `service_type`           varchar(64)   NOT NULL,
  `customer_id`            varchar(64)   NOT NULL,
  `customer_name`          varchar(150)  DEFAULT NULL,
  `product_code`           varchar(100)  DEFAULT NULL,
  `provider_ref`           varchar(100)  DEFAULT NULL,
  `period_label`           varchar(50)   DEFAULT NULL,
  `amount`                 decimal(15,0) NOT NULL DEFAULT 0,
  `admin_fee`              decimal(15,0) NOT NULL DEFAULT 0,
  `total`                  decimal(15,0) NOT NULL DEFAULT 0,
  `status`                 enum('PENDING','SUCCESS','FAILED','PENDING_PROVIDER','PENDING_ADVICE') NOT NULL DEFAULT 'PENDING',
  `transaction_code`       varchar(150)  DEFAULT NULL,
  `provider_error_code`    varchar(64)   DEFAULT NULL,
  `provider_error_message` text          DEFAULT NULL,
  `provider_response`      longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`provider_response`)),
  `retry_count`            int(10) unsigned NOT NULL DEFAULT 0,
  `advice_attempts`        int(10) unsigned NOT NULL DEFAULT 0,
  `metadata_json`          longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata_json`)),
  `meta_idgol`             varchar(20)   GENERATED ALWAYS AS (json_unquote(json_extract(`metadata_json`, '$.idgol')))  VIRTUAL,
  `meta_id_trx`            varchar(50)   GENERATED ALWAYS AS (json_unquote(json_extract(`metadata_json`, '$.idTrx'))) VIRTUAL,
  `paid_at`                datetime      DEFAULT NULL,
  `failed_at`              datetime      DEFAULT NULL,
  `created_at`             datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`             datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_multi_payment_item_per_request` (`multi_payment_id`, `item_code`),
  KEY `idx_multi_payment_items_parent`           (`multi_payment_id`),
  KEY `idx_multi_payment_items_provider_status`  (`provider`, `status`),
  KEY `idx_multi_payment_items_customer_id`      (`customer_id`),
  KEY `idx_multi_payment_items_transaction_code` (`transaction_code`),
  KEY `idx_mpi_meta_idgol`    (`meta_idgol`),
  KEY `idx_mpi_meta_id_trx`   (`meta_id_trx`),
  KEY `idx_mpi_advice_lookup` (`provider`, `status`, `meta_id_trx`),
  CONSTRAINT `fk_multi_payment_items_parent` FOREIGN KEY (`multi_payment_id`) REFERENCES `multi_payment_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. cashier_openings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cashier_openings` (
  `id`                bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `business_date`     date          NOT NULL,
  `shift_code`        enum('REGULER','PAGI','SIANG','MALAM') NOT NULL DEFAULT 'REGULER',
  `loket_code`        varchar(64)   NOT NULL,
  `loket_name`        varchar(150)  DEFAULT NULL,
  `username`          varchar(128)  NOT NULL,
  `opening_cash`      decimal(15,0) NOT NULL DEFAULT 0,
  `carried_cash`      decimal(15,0) NOT NULL DEFAULT 0,
  `source_closing_id` bigint(20) unsigned DEFAULT NULL,
  `opening_note`      text          DEFAULT NULL,
  `status`            enum('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `opened_at`         datetime      NOT NULL DEFAULT current_timestamp(),
  `closed_at`         datetime      DEFAULT NULL,
  `closed_by`         varchar(128)  DEFAULT NULL,
  `created_at`        datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`        datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cashier_opening_shift` (`business_date`, `loket_code`, `username`, `shift_code`),
  KEY `idx_cashier_openings_status_date`   (`status`,     `business_date`),
  KEY `idx_cashier_openings_loket_date`    (`loket_code`, `business_date`),
  KEY `idx_cashier_openings_username_date` (`username`,   `business_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. cashier_closings  (FK → cashier_openings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cashier_closings` (
  `id`                         bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `business_date`              date          NOT NULL,
  `shift_code`                 enum('REGULER','PAGI','SIANG','MALAM') NOT NULL DEFAULT 'REGULER',
  `loket_code`                 varchar(64)   NOT NULL,
  `loket_name`                 varchar(150)  DEFAULT NULL,
  `username`                   varchar(128)  NOT NULL,
  `opening_id`                 bigint(20) unsigned DEFAULT NULL,
  `opening_cash`               decimal(15,0) NOT NULL DEFAULT 0,
  `system_request_count`       int(10) unsigned NOT NULL DEFAULT 0,
  `system_transaction_count`   int(10) unsigned NOT NULL DEFAULT 0,
  `system_amount_total`        decimal(15,0) NOT NULL DEFAULT 0,
  `system_admin_total`         decimal(15,0) NOT NULL DEFAULT 0,
  `system_cash_total`          decimal(15,0) NOT NULL DEFAULT 0,
  `counted_cash_total`         decimal(15,0) NOT NULL DEFAULT 0,
  `other_cash_amount`          decimal(15,0) NOT NULL DEFAULT 0,
  `retained_cash`              decimal(15,0) NOT NULL DEFAULT 0,
  `deposit_total`              decimal(15,0) NOT NULL DEFAULT 0,
  `received_amount`            decimal(15,0) NOT NULL DEFAULT 0,
  `received_difference_amount` decimal(15,0) NOT NULL DEFAULT 0,
  `discrepancy_amount`         decimal(15,0) NOT NULL DEFAULT 0,
  `cashier_note`               text          DEFAULT NULL,
  `discrepancy_note`           text          DEFAULT NULL,
  `discrepancy_reason_code`    varchar(50)   DEFAULT NULL,
  `proof_reference`            varchar(255)  DEFAULT NULL,
  `proof_note`                 text          DEFAULT NULL,
  `status`                     enum('DRAFT','SUBMITTED','VERIFIED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `submitted_at`               datetime      DEFAULT NULL,
  `received_at`                datetime      DEFAULT NULL,
  `received_by`                varchar(128)  DEFAULT NULL,
  `verified_at`                datetime      DEFAULT NULL,
  `verified_by`                varchar(128)  DEFAULT NULL,
  `verifier_note`              text          DEFAULT NULL,
  `reopen_requested_at`        datetime      DEFAULT NULL,
  `reopen_requested_by`        varchar(128)  DEFAULT NULL,
  `reopen_request_note`        text          DEFAULT NULL,
  `reopened_at`                datetime      DEFAULT NULL,
  `reopened_by`                varchar(128)  DEFAULT NULL,
  `reopen_note`                text          DEFAULT NULL,
  `revision_count`             int(10) unsigned NOT NULL DEFAULT 0,
  `created_at`                 datetime      NOT NULL DEFAULT current_timestamp(),
  `updated_at`                 datetime      NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cashier_closing_shift` (`business_date`, `loket_code`, `username`, `shift_code`),
  KEY `idx_cashier_closings_status_date`   (`status`,     `business_date`),
  KEY `idx_cashier_closings_loket_date`    (`loket_code`, `business_date`),
  KEY `idx_cashier_closings_username_date` (`username`,   `business_date`),
  KEY `idx_cashier_closings_shift_date`    (`shift_code`, `business_date`),
  KEY `fk_cashier_closings_opening`        (`opening_id`),
  CONSTRAINT `fk_cashier_closings_opening` FOREIGN KEY (`opening_id`) REFERENCES `cashier_openings` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. cashier_closing_denominations  (FK → cashier_closings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cashier_closing_denominations` (
  `id`           bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `closing_id`   bigint(20) unsigned NOT NULL,
  `denomination` int(10) unsigned    NOT NULL,
  `quantity`     int(10) unsigned    NOT NULL DEFAULT 0,
  `subtotal`     decimal(15,0)       NOT NULL DEFAULT 0,
  `created_at`   datetime            NOT NULL DEFAULT current_timestamp(),
  `updated_at`   datetime            NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cashier_closing_denomination` (`closing_id`, `denomination`),
  KEY `idx_cashier_closing_denominations_closing` (`closing_id`),
  CONSTRAINT `fk_cashier_closing_denominations_closing` FOREIGN KEY (`closing_id`) REFERENCES `cashier_closings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Default data: app_settings
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `app_settings` (`setting_key`, `setting_value`) VALUES
  ('app_name',        'Pedami Payment'),
  ('app_version',     '1.0.0'),
  ('maintenance_mode','false');

SET foreign_key_checks = 1;
