'use strict';

// ESC/P control sequences (Epson LX-310 / LX-350 compatible)
const ESC       = '\x1B';
const INIT      = ESC + '@';   // Initialize printer
const BOLD_ON   = ESC + 'E';   // Bold on
const BOLD_OFF  = ESC + 'F';   // Bold off
const LF        = '\n';

function fmtRp(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

function fmtTanggal(s) {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return s; }
}

function fmtPeriode(thbln) {
  if (!thbln || thbln.length < 6) return thbln || '-';
  const year = thbln.substring(0, 4);
  const month = parseInt(thbln.substring(4, 6), 10);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${months[month - 1] || thbln.substring(4, 6)} ${year}`;
}

function getProdukLabel(kode) {
  if (kode.startsWith('pln-postpaid')) return 'PLN Pascabayar';
  if (kode.startsWith('pln-prepaid'))  return 'PLN Prabayar (Token)';
  if (kode.startsWith('pln-nonrek'))   return 'PLN Non-Rekening';
  if (kode.startsWith('bpjs'))         return 'BPJS Kesehatan';
  if (kode.startsWith('telkom'))       return 'Telkom Telepon';
  if (kode.startsWith('pdam'))         return 'PDAM';
  return '';
}

function r2c(left, right, width) {
  const gap = width - left.length - right.length;
  if (gap < 1) return left.substring(0, width - right.length - 1) + ' ' + right;
  return left + ' '.repeat(gap) + right;
}

function detailCell(label, value) {
  const INDENT = 4, LABEL_W = 12, SEP = ' : ';
  const VAL_W = 40 - INDENT - LABEL_W - SEP.length; // = 21
  return ' '.repeat(INDENT) +
    label.substring(0, LABEL_W).padEnd(LABEL_W) +
    SEP +
    value.substring(0, VAL_W).padEnd(VAL_W);
}

/**
 * Format receipt data as ESC/P bytes for Epson LX-310 @ 80 columns.
 * @param {object} data  - ReceiptPrintData (same structure as Next.js app)
 * @param {object} cfg   - { columns: 80, feedLines: 4 }
 * @returns {string}     - ESC/P encoded string — write as binary (latin1)
 */
function formatEscp(data, cfg = {}) {
  const W    = cfg.columns  || 80;
  const FEED = cfg.feedLines || 4;
  const HEAVY = '='.repeat(W);
  const LIGHT = '-'.repeat(W);

  const chunks = [];

  // Helper: append a line (with LF)
  function line(s)        { chunks.push(s + LF); }
  function bold(s)        { return BOLD_ON + s + BOLD_OFF; }
  function ctr(text, b)   {
    const pad = Math.max(0, Math.floor((W - text.length) / 2));
    const content = b ? bold(text) : text;
    chunks.push(' '.repeat(pad) + content + LF);
  }
  function c2(left, right, b) {
    const content = r2c(left, right, W);
    chunks.push((b ? bold(content) : content) + LF);
  }

  // ── Init ──
  chunks.push(INIT);

  // ── Header ──
  line(HEAVY);
  ctr('PEDAMI PAYMENT', true);
  ctr('Layanan Pembayaran Multi-Produk', false);
  line(HEAVY);
  c2('Loket   : ' + data.loketCode + ' ' + (data.loketName || ''), 'Kasir : ' + data.kasir);
  line('Tanggal : ' + fmtTanggal(data.tanggal));
  line(LIGHT);

  // ── Bills ──
  (data.bills || []).forEach((b, idx) => {
    const isPln = b.type === 'pln';

    chunks.push(bold(`[${idx + 1}] ${b.nama}`) + LF);
    let idLine = `    ID   : ${b.idpel}`;
    if (!isPln && b.periode) idLine += '  Periode : ' + fmtPeriode(b.periode);
    line(idLine);
    if (b.alamat)          line('    Alamat: ' + b.alamat.substring(0, W - 12));
    if (b.transactionCode) line('    Kode  : ' + b.transactionCode);

    const pairs = [];
    if (isPln) {
      const prod = getProdukLabel(b.kodeProduk || '');
      if (prod) pairs.push(['Produk', prod]);
      if (b.tarif || b.daya) pairs.push(['Tarif/Daya', (b.tarif || '') + (b.daya ? '/' + b.daya + ' VA' : '')]);
      if (b.noMeter)   pairs.push(['No Meter',    b.noMeter]);
      if (b.standMeter) pairs.push(['Stand Meter', b.standMeter]);
      if (b.jumBill && b.jumBill !== '1' && b.jumBill !== '0') pairs.push(['Jml Tagihan', b.jumBill]);
      if (b.periode && !b.kodeProduk?.startsWith('pln-prepaid')) pairs.push(['Periode', fmtPeriode(b.periode)]);
      if ((b.rpAmount  || 0) > 0) pairs.push(['Tagihan',     fmtRp(b.rpAmount)]);
      if ((b.rpAdmin   || 0) > 0) pairs.push(['Admin',       fmtRp(b.rpAdmin)]);
      if (b.refnumLunasin)        pairs.push(['Ref Lunasin', b.refnumLunasin]);
      if (b.kwh)                  pairs.push(['kWh',         b.kwh]);
      if ((b.rpMaterai || 0) > 0) pairs.push(['Materai',     fmtRp(b.rpMaterai)]);
      if ((b.rpPpn     || 0) > 0) pairs.push(['PPN',         fmtRp(b.rpPpn)]);
      if ((b.rpPju     || 0) > 0) pairs.push(['PPJ',         fmtRp(b.rpPju)]);
      if ((b.rpAngsuran|| 0) > 0) pairs.push(['Angsuran',    fmtRp(b.rpAngsuran)]);
      if ((b.rpToken   || 0) > 0) pairs.push(['Nilai Token', fmtRp(b.rpToken)]);
      if ((b.rpTotal   || 0) > 0) pairs.push(['Total',       fmtRp(b.rpTotal)]);
      if (b.refnum)               pairs.push(['Ref Number',  b.refnum]);
      if (b.tglLunas)             pairs.push(['Tgl Lunas',   b.tglLunas]);
    } else {
      const pemakaian = b.pemakaian ?? ((b.standKini || 0) - (b.standLalu || 0));
      if (b.gol) pairs.push(['Golongan', b.gol]);
      if ((b.standLalu || 0) > 0 || (b.standKini || 0) > 0)
        pairs.push(['Stand Meter', `${b.standLalu || 0} -> ${b.standKini || 0}`]);
      if (pemakaian > 0) pairs.push(['Pemakaian', `${Number(pemakaian).toLocaleString('id-ID', { maximumFractionDigits: 1 })} m3`]);
      if ((b.hargaAir   || 0) > 0) pairs.push(['Harga Air',   fmtRp(b.hargaAir)]);
      if ((b.bebanTetap || 0) > 0) pairs.push(['Beban Tetap', fmtRp(b.bebanTetap)]);
      if ((b.biayaMeter || 0) > 0) pairs.push(['Biaya Meter', fmtRp(b.biayaMeter)]);
      if ((b.limbah     || 0) > 0) pairs.push(['Limbah',      fmtRp(b.limbah)]);
      if ((b.retribusi  || 0) > 0) pairs.push(['Retribusi',   fmtRp(b.retribusi)]);
      if ((b.denda      || 0) > 0) pairs.push(['Denda',       fmtRp(b.denda)]);
      if ((b.materai    || 0) > 0) pairs.push(['Materai',     fmtRp(b.materai)]);
      if ((b.diskon     || 0) > 0) pairs.push(['Diskon',      '- ' + fmtRp(b.diskon)]);
    }

    for (let j = 0; j < pairs.length; j += 2) {
      const c1 = detailCell(pairs[j][0], pairs[j][1]);
      const c2r = j + 1 < pairs.length ? detailCell(pairs[j + 1][0], pairs[j + 1][1]) : ' '.repeat(40);
      line(c1 + c2r);
    }

    // Token PLN — centered, bold
    if (isPln && b.tokenPln) {
      line(LIGHT);
      ctr('TOKEN PLN', false);
      ctr(b.tokenPln, true);
      line(LIGHT);
    }

    if (!isPln) {
      c2('  Tagihan', fmtRp(b.tagihan));
      c2('  Admin  ', fmtRp(b.admin));
    }
    c2('  SUBTOTAL', fmtRp(b.total), true);

    if (idx < (data.bills || []).length - 1) line(LIGHT);
  });

  // ── Summary ──
  line(HEAVY);
  c2('Total Tagihan', fmtRp(data.totalTagihan));
  c2(`Total Admin (${(data.bills || []).length}x)`, fmtRp(data.totalAdmin));
  line(HEAVY);
  c2('TOTAL BAYAR', fmtRp(data.totalBayar), true);
  line(HEAVY);

  if (data.tunai > 0) {
    c2('Tunai  ', fmtRp(data.tunai));
    c2('Kembali', fmtRp(data.kembalian));
    line('');
  }

  ctr('*** LUNAS ***', true);
  line('');
  ctr('Struk ini sebagai bukti pembayaran yang sah.');
  ctr('Terima kasih.');

  // Feed lines (paper advance for easy tear-off)
  for (let i = 0; i < FEED; i++) chunks.push(LF);

  return chunks.join('');
}

module.exports = { formatEscp };
