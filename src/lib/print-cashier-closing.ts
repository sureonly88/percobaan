export interface PrintableClosingTransactionRow {
  id: number;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName?: string | null;
  productCode?: string | null;
  periodLabel?: string | null;
  transactionCode?: string | null;
  amount: number;
  adminFee: number;
  total: number;
  transactionDate?: string | null;
  multiPaymentCode?: string | null;
}

export interface CashierClosingPrintPayload {
  businessDate: string;
  shiftCode: string;
  loketCode: string;
  loketName: string;
  username: string;
  openingCash: number;
  systemRequestCount: number;
  systemTransactionCount: number;
  systemAmountTotal: number;
  systemAdminTotal: number;
  systemCashTotal: number;
  countedCashTotal: number;
  retainedCash: number;
  depositTotal: number;
  receivedAmount: number;
  receivedDifferenceAmount: number;
  discrepancyAmount: number;
  discrepancyReasonLabel?: string | null;
  cashierNote?: string | null;
  discrepancyNote?: string | null;
  verifierNote?: string | null;
  receivedBy?: string | null;
  verifiedBy?: string | null;
  submittedAt?: string | null;
  receivedAt?: string | null;
  verifiedAt?: string | null;
  proofReference?: string | null;
  proofNote?: string | null;
  detailRows?: PrintableClosingTransactionRow[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function printCashierClosingReport(payload: CashierClosingPrintPayload) {
  const rows = (payload.detailRows || [])
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.transactionDate ? formatDateTime(row.transactionDate) : "-")}</td>
          <td>${escapeHtml(row.provider)}</td>
          <td>${escapeHtml(row.customerName || "-")}</td>
          <td>${escapeHtml(row.customerId)}</td>
          <td>${escapeHtml(row.transactionCode || row.multiPaymentCode || "-")}</td>
          <td class="right">${formatRupiah(row.total)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
  <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <title>Berita Acara Tutup Kasir</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
        h1, h2, h3, p { margin: 0; }
        .header { margin-bottom: 20px; }
        .muted { color: #6b7280; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px 14px; }
        .label { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
        .value { font-size: 15px; font-weight: 700; }
        .summary-table, .detail-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        .summary-table td { padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-table th, .detail-table td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
        .detail-table th { background: #f3f4f6; text-align: left; }
        .right { text-align: right; }
        .notes { margin-top: 18px; }
        .notes .card { min-height: 72px; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
        .signature-box { text-align: center; border-top: 1px dashed #9ca3af; padding-top: 48px; }
        @media print {
          body { margin: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Berita Acara Tutup Kasir</h1>
        <p class="muted">Dokumen serah terima setoran kasir ke admin</p>
      </div>

      <div class="grid">
        <div class="card"><div class="label">Tanggal</div><div class="value">${escapeHtml(payload.businessDate)}</div></div>
        <div class="card"><div class="label">Shift</div><div class="value">${escapeHtml(payload.shiftCode)}</div></div>
        <div class="card"><div class="label">Loket</div><div class="value">${escapeHtml(payload.loketName)} (${escapeHtml(payload.loketCode)})</div></div>
        <div class="card"><div class="label">Kasir</div><div class="value">${escapeHtml(payload.username)}</div></div>
      </div>

      <h3>Ringkasan Kas</h3>
      <table class="summary-table">
        <tr><td>Modal Awal</td><td class="right">${formatRupiah(payload.openingCash)}</td></tr>
        <tr><td>Permintaan Sukses</td><td class="right">${payload.systemRequestCount.toLocaleString("id-ID")}</td></tr>
        <tr><td>Item Transaksi</td><td class="right">${payload.systemTransactionCount.toLocaleString("id-ID")}</td></tr>
        <tr><td>Total Tagihan</td><td class="right">${formatRupiah(payload.systemAmountTotal)}</td></tr>
        <tr><td>Total Admin</td><td class="right">${formatRupiah(payload.systemAdminTotal)}</td></tr>
        <tr><td>Kas Sistem</td><td class="right">${formatRupiah(payload.systemCashTotal)}</td></tr>
        <tr><td>Kas Fisik</td><td class="right">${formatRupiah(payload.countedCashTotal)}</td></tr>
        <tr><td>Kas Ditahan</td><td class="right">${formatRupiah(payload.retainedCash)}</td></tr>
        <tr><td>Setoran Kasir</td><td class="right">${formatRupiah(payload.depositTotal)}</td></tr>
        <tr><td>Nominal Diterima Admin</td><td class="right">${formatRupiah(payload.receivedAmount)}</td></tr>
        <tr><td>Selisih Admin vs Setoran</td><td class="right">${formatRupiah(payload.receivedDifferenceAmount)}</td></tr>
        <tr><td>Selisih Kas</td><td class="right">${formatRupiah(payload.discrepancyAmount)}</td></tr>
        <tr><td>Alasan Selisih</td><td class="right">${escapeHtml(payload.discrepancyReasonLabel || "-")}</td></tr>
        <tr><td>Referensi Bukti</td><td class="right">${escapeHtml(payload.proofReference || "-")}</td></tr>
        <tr><td>Diajukan</td><td class="right">${escapeHtml(formatDateTime(payload.submittedAt))}</td></tr>
        <tr><td>Diterima Admin</td><td class="right">${escapeHtml(formatDateTime(payload.receivedAt))}</td></tr>
        <tr><td>Diverifikasi</td><td class="right">${escapeHtml(formatDateTime(payload.verifiedAt))}</td></tr>
      </table>

      <div class="notes grid">
        <div class="card"><div class="label">Catatan Kasir</div><div>${escapeHtml(payload.cashierNote || "-")}</div></div>
        <div class="card"><div class="label">Catatan Selisih</div><div>${escapeHtml(payload.discrepancyNote || "-")}</div></div>
        <div class="card"><div class="label">Catatan Verifikator</div><div>${escapeHtml(payload.verifierNote || "-")}</div></div>
        <div class="card"><div class="label">Catatan Bukti</div><div>${escapeHtml(payload.proofNote || "-")}</div></div>
      </div>

      <h3 style="margin-top: 24px;">Detail Transaksi Pembentuk Closing</h3>
      <table class="detail-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Tanggal</th>
            <th>Provider</th>
            <th>Nama</th>
            <th>ID Pelanggan</th>
            <th>Kode Transaksi</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" style="text-align:center;">Tidak ada detail transaksi</td></tr>`}
        </tbody>
      </table>

      <div class="signatures">
        <div class="signature-box">
          <p>Kasir</p>
          <strong>${escapeHtml(payload.username)}</strong>
        </div>
        <div class="signature-box">
          <p>Admin / Supervisor</p>
          <strong>${escapeHtml(payload.receivedBy || payload.verifiedBy || "-")}</strong>
        </div>
      </div>
    </body>
  </html>`;

  const printWindow = window.open("", "_blank", "width=980,height=720");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}