/**
 * Midtrans Payment Gateway Helper
 *
 * Supports Snap integration for top-up deposits.
 * Docs: https://docs.midtrans.com/reference/snap-api
 *
 * Required env vars:
 *   MIDTRANS_SERVER_KEY
 *   MIDTRANS_CLIENT_KEY
 *   MIDTRANS_IS_PRODUCTION  (default: false → sandbox)
 */

import { createHash } from "crypto";

function getConfig() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || "";
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || "";
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diset");

  const baseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

  return { serverKey, clientKey, isProduction, baseUrl };
}

function authHeader(): string {
  const { serverKey } = getConfig();
  return "Basic " + Buffer.from(serverKey + ":").toString("base64");
}

// ── Snap Token ──────────────────────────────────────────────────────────────

function getAppBaseUrl(): string {
  // APP_PUBLIC_URL — set ke URL publik (ngrok/domain) khusus untuk Midtrans callbacks
  // Jangan pakai NEXTAUTH_URL karena itu mengubah perilaku cookie auth
  return (process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export interface SnapRequest {
  orderId: string;
  grossAmount: number;
  customerName: string;
  customerEmail?: string;
  itemName: string;
}

export interface SnapResponse {
  token: string;
  redirect_url: string;
}

export async function createSnapTransaction(req: SnapRequest): Promise<SnapResponse> {
  const { baseUrl } = getConfig();
  const appUrl = getAppBaseUrl();

  const body = {
    transaction_details: {
      order_id: req.orderId,
      gross_amount: req.grossAmount,
    },
    customer_details: {
      first_name: req.customerName,
      email: req.customerEmail || undefined,
    },
    item_details: [
      {
        id: "TOPUP",
        price: req.grossAmount,
        quantity: 1,
        name: req.itemName,
      },
    ],
    callbacks: {
      finish:   `${appUrl}/topup/finish`,
      unfinish: `${appUrl}/topup/unfinish`,
      error:    `${appUrl}/topup/error`,
    },
  };

  const res = await fetch(`${baseUrl}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Midtrans Snap error ${res.status}: ${text}`);
  }

  return (await res.json()) as SnapResponse;
}

// ── Webhook Signature Verification ──────────────────────────────────────────

/**
 * Midtrans notification signature:
 *   SHA512( order_id + status_code + gross_amount + server_key )
 */
export function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string
): boolean {
  const { serverKey } = getConfig();
  const payload = orderId + statusCode + grossAmount + serverKey;
  const expected = createHash("sha512").update(payload).digest("hex");
  return expected === signatureKey;
}

// ── Transaction Status Check ────────────────────────────────────────────────

export interface MidtransStatus {
  transaction_status: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_id: string;
  status_code: string;
  signature_key: string;
  fraud_status?: string;
}

export async function getTransactionStatus(orderId: string): Promise<MidtransStatus> {
  const { serverKey, isProduction } = getConfig();
  const baseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  const res = await fetch(`${baseUrl}/v2/${orderId}/status`, {
    headers: {
      Authorization: "Basic " + Buffer.from(serverKey + ":").toString("base64"),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Midtrans status error ${res.status}: ${text}`);
  }

  return (await res.json()) as MidtransStatus;
}

/**
 * Map Midtrans transaction_status → our internal status
 */
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string
): "SUCCESS" | "PENDING" | "FAILED" | "EXPIRED" {
  switch (transactionStatus) {
    case "capture":
      return fraudStatus === "accept" ? "SUCCESS" : "PENDING";
    case "settlement":
      return "SUCCESS";
    case "pending":
      return "PENDING";
    case "deny":
    case "cancel":
      return "FAILED";
    case "expire":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

export function getMidtransClientKey(): string {
  return getConfig().clientKey;
}
