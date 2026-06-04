import { randomBytes } from "crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function generateInvoiceCode(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `INV-${y}${m}${day}-${rand}`;
}

export function generateGatewayOrderId(invoiceCode: string): string {
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `INV-${invoiceCode.replace(/[^A-Z0-9]/gi, "")}-${rand}`.slice(0, 120);
}

export function getAppBaseUrl(): string {
  return (process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
