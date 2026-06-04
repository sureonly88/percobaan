-- Feature flags for Payment Link and public self-service.

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('payment_links_enabled', 'true'),
  ('public_self_service_enabled', 'true');
