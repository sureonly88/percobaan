export interface DailyDepositPerKasir {
  username: string;
  requestCount: number;
  itemCount: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
}

export interface DailyDepositPerKategori {
  kategori: string;
  itemCount: number;
  totalTagihan: number;
  totalAdmin: number;
  totalNominal: number;
}

export interface DailyDepositClosing {
  id: number;
  username: string;
  shiftCode: string;
  status: string;
  openingCash: number;
  systemCashTotal: number;
  countedCashTotal: number;
  retainedCash: number;
  depositTotal: number;
  receivedAmount: number;
  discrepancyAmount: number;
  submittedAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
}

export interface DailyDepositPayload {
  date: string;
  loket: { loketCode: string; nama: string; alamat?: string | null };
  summary: {
    requestCount: number;
    itemCount: number;
    totalTagihan: number;
    totalAdmin: number;
    totalNominal: number;
  };
  perKasir: DailyDepositPerKasir[];
  perKategori: DailyDepositPerKategori[];
  closings: DailyDepositClosing[];
  generatedAt: string;
  generatedBy?: string;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRupiah(amount: number): string {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function printDailyDepositReport(payload: DailyDepositPayload) {
  const kasirRows = payload.perKasir
    .map(
      (k, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(k.username)}</td>
          <td class="right">${k.requestCount.toLocaleString("id-ID")}</td>
          <td class="right">${k.itemCount.toLocaleString("id-ID")}</td>
          <td class="right">${formatRupiah(k.totalTagihan)}</td>
          <td class="right">${formatRupiah(k.totalAdmin)}</td>
          <td class="right"><strong>${formatRupiah(k.totalNominal)}</strong></td>
        </tr>`
    )
    .join("");

  const kategoriRows = payload.perKategori
    .map(
      (k, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(k.kategori)}</td>
          <td class="right">${k.itemCount.toLocaleString("id-ID")}</td>
          <td class="right">${formatRupiah(k.totalTagihan)}</td>
          <td class="right">${formatRupiah(k.totalAdmin)}</td>
          <td class="right"><strong>${formatRupiah(k.totalNominal)}</strong></td>
        </tr>`
    )
    .join("");

  const closingRows = payload.closings
    .map(
      (c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(c.username)}</td>
          <td>${escapeHtml(c.shiftCode)}</td>
          <td>${escapeHtml(c.status)}</td>
          <td class="right">${formatRupiah(c.depositTotal)}</td>
          <td class="right">${formatRupiah(c.receivedAmount)}</td>
          <td class="right">${formatRupiah(c.discrepancyAmount)}</td>
          <td>${escapeHtml(formatDateTime(c.submittedAt))}</td>
          <td>${escapeHtml(formatDateTime(c.verifiedAt))}</td>
        </tr>`
    )
    .join("");

  const totalDeposit = payload.closings.reduce((s, c) => s + c.depositTotal, 0);
  const totalReceived = payload.closings.reduce((s, c) => s + c.receivedAmount, 0);
  const totalDiscrepancy = payload.closings.reduce((s, c) => s + c.discrepancyAmount, 0);

  const html = `<!DOCTYPE html>
  <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <title>Setoran Loket Harian - ${escapeHtml(payload.loket.nama)} - ${escapeHtml(payload.date)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
        h1, h2, h3 { margin: 0 0 8px; }
        .muted { color: #6b7280; }
        .header { margin-bottom: 18px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
        .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; }
        .label { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; letter-spacing: 0.5px; }
        .value { font-size: 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 16px; font-size: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .right { text-align: right; }
        tfoot td { font-weight: 700; background: #f9fafb; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 36px; }
        .signature-box { text-align: center; border-top: 1px dashed #9ca3af; padding-top: 48px; font-size: 12px; }
        .footer { margin-top: 20px; font-size: 10px; color: #6b7280; }
        @media print { body { margin: 14mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Laporan Setoran Loket Harian</h1>
        <p class="muted">Loket: <strong>${escapeHtml(payload.loket.nama)}</strong> (${escapeHtml(payload.loket.loketCode)})
          ${payload.loket.alamat ? ` · ${escapeHtml(payload.loket.alamat)}` : ""}</p>
        <p class="muted">Tanggal Bisnis: <strong>${escapeHtml(payload.date)}</strong></p>
      </div>

      <div class="grid">
        <div class="card"><div class="label">Permintaan Sukses</div><div class="value">${payload.summary.requestCount.toLocaleString("id-ID")}</div></div>
        <div class="card"><div class="label">Item Transaksi</div><div class="value">${payload.summary.itemCount.toLocaleString("id-ID")}</div></div>
        <div class="card"><div class="label">Total Tagihan</div><div class="value">${formatRupiah(payload.summary.totalTagihan)}</div></div>
        <div class="card"><div class="label">Total Admin</div><div class="value">${formatRupiah(payload.summary.totalAdmin)}</div></div>
        <div class="card" style="grid-column: span 4;"><div class="label">Total Nominal Diterima</div><div class="value" style="font-size: 20px; color: #059669;">${formatRupiah(payload.summary.totalNominal)}</div></div>
      </div>

      <h3>Setoran Per Kasir</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Username</th>
            <th class="right">Permintaan</th><th class="right">Item</th>
            <th class="right">Tagihan</th><th class="right">Admin</th><th class="right">Total</th>
          </tr>
        </thead>
        <tbody>${kasirRows || `<tr><td colspan="7" style="text-align:center;color:#9ca3af;">Tidak ada transaksi.</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">TOTAL</td>
            <td class="right">${payload.summary.requestCount.toLocaleString("id-ID")}</td>
            <td class="right">${payload.summary.itemCount.toLocaleString("id-ID")}</td>
            <td class="right">${formatRupiah(payload.summary.totalTagihan)}</td>
            <td class="right">${formatRupiah(payload.summary.totalAdmin)}</td>
            <td class="right">${formatRupiah(payload.summary.totalNominal)}</td>
          </tr>
        </tfoot>
      </table>

      <h3>Breakdown Per Kategori Produk</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Kategori</th>
            <th class="right">Item</th>
            <th class="right">Tagihan</th><th class="right">Admin</th><th class="right">Total</th>
          </tr>
        </thead>
        <tbody>${kategoriRows || `<tr><td colspan="6" style="text-align:center;color:#9ca3af;">Tidak ada transaksi.</td></tr>`}</tbody>
      </table>

      <h3>Rekap Tutup Kasir (Closings)</h3>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Kasir</th><th>Shift</th><th>Status</th>
            <th class="right">Setoran</th><th class="right">Diterima Admin</th><th class="right">Selisih</th>
            <th>Diajukan</th><th>Verifikasi</th>
          </tr>
        </thead>
        <tbody>${closingRows || `<tr><td colspan="9" style="text-align:center;color:#9ca3af;">Belum ada closing untuk tanggal ini.</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">TOTAL</td>
            <td class="right">${formatRupiah(totalDeposit)}</td>
            <td class="right">${formatRupiah(totalReceived)}</td>
            <td class="right">${formatRupiah(totalDiscrepancy)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <div class="signatures">
        <div class="signature-box">Kasir / Pengelola Loket</div>
        <div class="signature-box">Admin Penerima</div>
        <div class="signature-box">Mengetahui / Supervisor</div>
      </div>

      <div class="footer">
        Dicetak: ${escapeHtml(formatDateTime(payload.generatedAt))}${payload.generatedBy ? ` oleh ${escapeHtml(payload.generatedBy)}` : ""}.
      </div>

      <script>
        window.addEventListener('load', function() {
          setTimeout(function() { window.print(); }, 200);
        });
      </script>
    </body>
  </html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Pop-up diblokir. Izinkan pop-up untuk mencetak laporan.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
