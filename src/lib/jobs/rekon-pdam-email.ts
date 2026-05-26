/**
 * Job: Generate Excel rekonsiliasi PDAM Native dan kirim via email.
 *
 * Cara kerja:
 * - Default: data kemarin (H-1)
 * - Support override tanggal dan filter loket via parameter
 * - Menggunakan buildReconciliationExport dari lib/reconciliation
 * - Mengirim attachment .xls ke REKON_EMAIL_TO
 */

import { buildReconciliationExport } from "@/lib/reconciliation";
import { sendMail } from "@/lib/mailer";

export interface RekonPdamEmailOptions {
  /** Format YYYY-MM-DD. Default: kemarin. */
  date?: string;
  /** Opsional filter loket tertentu. */
  loketCode?: string;
}

export interface RekonPdamEmailSummary {
  date: string;
  filename: string;
  emailTo: string;
  sentAt: string;
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function runRekonPdamEmail(
  options: RekonPdamEmailOptions = {}
): Promise<RekonPdamEmailSummary> {
  const date = options.date || getYesterday();

  const emailTo = process.env.REKON_EMAIL_TO;
  if (!emailTo) {
    throw new Error("REKON_EMAIL_TO belum diset di .env");
  }

  // Generate file Excel rekonsiliasi PDAM
  const file = await buildReconciliationExport({
    provider: "pdam",
    startDate: date,
    endDate: date,
    loketCode: options.loketCode || null,
    // role admin agar bisa lihat semua loket
    role: "admin",
    page: 1,
    limit: 99999,
  });

  // Ganti nama file agar sesuai tanggal yang di-generate
  const filename = `rekonsiliasi_pdam_native_${date}.xls`;

  const dateFormatted = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T00:00:00"));

  await sendMail({
    to: emailTo,
    subject: `Rekonsiliasi PDAM Native — ${dateFormatted}`,
    html: `
      <p>Halo,</p>
      <p>Terlampir data rekonsiliasi PDAM Native untuk tanggal <strong>${dateFormatted}</strong>.</p>
      <p>File berisi transaksi sukses dengan kolom: Kode Transaksi, ID Pelanggan, Nama Pelanggan,
         Periode, Sub Total, Biaya Admin, Total Bayar, Kode Loket, dan Tanggal Transaksi.</p>
      <br/>
      <p style="color:#666;font-size:12px;">
        Email ini dikirim otomatis oleh sistem Portal Utilitas.
      </p>
    `,
    attachments: [
      {
        filename,
        content: file.buffer,
        contentType: file.contentType,
      },
    ],
  });

  return {
    date,
    filename,
    emailTo,
    sentAt: new Date().toISOString(),
  };
}
