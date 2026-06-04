import pool from "@/lib/db";
import { cached } from "@/lib/cache";
import type { RowDataPacket } from "mysql2";

export type FeatureFlagKey = "payment_links_enabled" | "public_self_service_enabled";

const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  payment_links_enabled: true,
  public_self_service_enabled: true,
};

function parseEnabled(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return !["0", "false", "off", "no", "disabled", "nonaktif"].includes(normalized);
}

export async function getFeatureFlags() {
  return cached(
    "feature_flags",
    async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('payment_links_enabled','public_self_service_enabled')",
      );
      const values: Record<string, string> = {};
      for (const row of rows) values[String(row.setting_key)] = String(row.setting_value);
      return {
        paymentLinksEnabled: parseEnabled(values.payment_links_enabled, DEFAULT_FEATURE_FLAGS.payment_links_enabled),
        publicSelfServiceEnabled: parseEnabled(values.public_self_service_enabled, DEFAULT_FEATURE_FLAGS.public_self_service_enabled),
      };
    },
    30 * 1000,
  );
}

export async function isPaymentLinksEnabled() {
  return (await getFeatureFlags()).paymentLinksEnabled;
}

export async function isPublicSelfServiceEnabled() {
  return (await getFeatureFlags()).publicSelfServiceEnabled;
}
