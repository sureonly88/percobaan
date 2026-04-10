import pool from "@/lib/db";
import type { NotificationCategory, NotificationSeverity } from "@/types";

export interface CreateNotificationInput {
  recipientUsername?: string;  // specific user, default "*" (broadcast)
  recipientRole?: string | null; // target role, null = user-specific
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link?: string | null;
}

/**
 * Insert a notification row. Fire-and-forget safe.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await pool.execute(
    `INSERT INTO notifications
      (recipient_username, recipient_role, category, severity, title, message, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      input.recipientUsername ?? "*",
      input.recipientRole ?? null,
      input.category,
      input.severity,
      input.title,
      input.message,
      input.link ?? null,
    ]
  );
}

/**
 * Safe wrapper — never throws, used inline in payment/saldo flows.
 */
export async function createNotificationSafe(input: CreateNotificationInput): Promise<void> {
  try {
    await createNotification(input);
  } catch {
    // notification failure must never break business logic
  }
}

/**
 * Notify all admins + supervisors about a failed transaction.
 */
export async function notifyTransactionFailed(opts: {
  idempotencyKey: string;
  username: string;
  loketCode: string;
  errorMessage: string;
  billCount: number;
}): Promise<void> {
  await createNotificationSafe({
    recipientRole: "admin",
    category: "transaksi",
    severity: "error",
    title: "Transaksi Gagal",
    message: `Pembayaran ${opts.billCount} tagihan oleh ${opts.username} (loket ${opts.loketCode}) gagal: ${opts.errorMessage}`,
    link: `/monitoring/${opts.idempotencyKey}`,
  });
  await createNotificationSafe({
    recipientRole: "supervisor",
    category: "transaksi",
    severity: "error",
    title: "Transaksi Gagal",
    message: `Pembayaran ${opts.billCount} tagihan oleh ${opts.username} (loket ${opts.loketCode}) gagal: ${opts.errorMessage}`,
    link: `/monitoring/${opts.idempotencyKey}`,
  });
  // Also notify the kasir who made the payment
  await createNotificationSafe({
    recipientUsername: opts.username,
    category: "transaksi",
    severity: "error",
    title: "Pembayaran Gagal",
    message: `Pembayaran ${opts.billCount} tagihan gagal: ${opts.errorMessage}`,
    link: `/monitoring/${opts.idempotencyKey}`,
  });
}

/**
 * Notify about low loket balance after a payment.
 */
export async function notifyLowBalance(opts: {
  loketCode: string;
  loketName: string;
  currentBalance: number;
  threshold?: number;
}): Promise<void> {
  const threshold = opts.threshold ?? 500_000;
  if (opts.currentBalance > threshold) return;

  const formattedBalance = opts.currentBalance.toLocaleString("id-ID");
  const severity: NotificationSeverity = opts.currentBalance <= 100_000 ? "error" : "warning";

  await createNotificationSafe({
    recipientRole: "admin",
    category: "saldo",
    severity,
    title: "Saldo Loket Rendah",
    message: `Saldo loket ${opts.loketName} (${opts.loketCode}) tinggal Rp ${formattedBalance}. Segera lakukan top-up.`,
    link: "/saldo",
  });
}

/**
 * Notify about provider errors (spike detection).
 */
export async function notifyProviderError(opts: {
  provider: string;
  errorMessage: string;
}): Promise<void> {
  await createNotificationSafe({
    recipientRole: "admin",
    category: "sistem",
    severity: "warning",
    title: `Provider ${opts.provider} Error`,
    message: opts.errorMessage,
    link: "/monitoring",
  });
}
