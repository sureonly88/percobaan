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

function fmtPeriodeList(periodeStr) {
  if (!periodeStr) return '-';
  return periodeStr.split(',').map((p) => fmtPeriode(p.trim())).join(', ');
}

function fmtTglReg(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd || '-';
  const year  = yyyymmdd.substring(0, 4);
  const month = parseInt(yyyymmdd.substring(4, 6), 10);
  const day   = yyyymmdd.substring(6, 8);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${day} ${months[month - 1] || yyyymmdd.substring(4, 6)} ${year}`;
}

function getProdukLabel(kode) {
  if (kode.startsWith('pln-postpaid')) return 'PLN Pascabayar';
  if (kode.startsWith('pln-prepaid'))  return 'PLN Prabayar (Token)';
  if (kode.startsWith('pln-nonrek'))   return 'PLN Non-Rekening';
  if (kode.startsWith('bpjs'))         return 'BPJS Kesehatan';
  if (kode.startsWith('telkom'))       return 'Telkom Telepon';
  if (kode.startsWith('pulsa'))        return 'Pulsa';
  if (kode.startsWith('paketdata'))    return 'Paket Data';
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
  const tpl  = cfg.template || {};
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

  // ── COPY watermark banner (cetak ulang) ──
  if (data.isCopy) {
    line(HEAVY);
    const tag = data.copyNumber && data.copyNumber > 1
      ? `*** COPY #${data.copyNumber} - BUKAN STRUK ASLI ***`
      : `*** COPY - BUKAN STRUK ASLI ***`;
    ctr(tag, true);
    if (data.copyBy || data.copyAt) {
      const meta = [
        data.copyBy ? `Dicetak ulang oleh: ${data.copyBy}` : '',
        data.copyAt ? fmtTanggal(data.copyAt) : '',
      ].filter(Boolean).join('  -  ');
      if (meta) ctr(meta, false);
    }
    line(HEAVY);
  }

  // ── Header ──
  line(HEAVY);
  ctr(tpl.headerLine1 || 'PEDAMI PAYMENT', true);
  ctr(tpl.headerLine2 || 'Layanan Pembayaran Multi-Produk', false);
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
      const isNonrek = b.kodeProduk && b.kodeProduk.startsWith('pln-nonrek');
      const isBpjs   = b.kodeProduk && b.kodeProduk.startsWith('bpjs');
      const isTelkom = b.kodeProduk && b.kodeProduk.startsWith('telkom');
      const isPulsa  = b.kodeProduk && (b.kodeProduk.startsWith('pulsa') || b.kodeProduk.startsWith('paketdata'));
      if (prod) pairs.push(['Produk', b.namaProduk || prod]);
      if (isBpjs) {
        if (b.nova)                                                  pairs.push(['No VA',          b.nova]);
        if (b.novaKepalaKeluarga && b.novaKepalaKeluarga !== b.nova) pairs.push(['VA Kepala Kel',  b.novaKepalaKeluarga]);
        if (b.jumPeserta)  pairs.push(['Jml Peserta', b.jumPeserta + ' orang']);
        if (b.namaCabang)  pairs.push(['Cabang',      b.namaCabang]);
        if (b.periode)     pairs.push(['Periode',     b.periode + ' Bulan']);
        if (b.refnum)      pairs.push(['Ref Biller',  b.refnum]);
        if (b.tglLunas)    pairs.push(['Tgl Lunas',   fmtTanggal(b.tglLunas)]);
        if (b.pesanBiller) pairs.push(['Info',        b.pesanBiller.substring(0, 60)]);
      } else if (isNonrek) {
        if (b.noreg)    pairs.push(['No Registrasi',  b.noreg]);
        if (b.tglReg)   pairs.push(['Tgl Registrasi', fmtTglReg(b.tglReg)]);
        if (b.jenisReg) pairs.push(['Jenis Reg',      b.jenisReg]);
      } else if (isTelkom) {
        const jum = Number(b.jumBill || 1);
        if (jum > 1)         pairs.push(['Jml Tagihan',  String(jum) + ' bulan']);
        if (b.periode)       pairs.push(['Periode',      fmtPeriodeList(b.periode)]);
        if (b.refnum)        pairs.push(['Ref Biller',   b.refnum]);
        if (b.tglLunas)      pairs.push(['Tgl Lunas',    fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin) pairs.push(['Ref Lunasin',  b.refnumLunasin]);
      } else if (isPulsa) {
        if (b.nomor)         pairs.push(['No. HP',       b.nomor]);
        if (b.denom)         pairs.push(['Denominasi',   'Rp ' + Number(b.denom).toLocaleString('id-ID')]);
        if (b.serialNumber)  pairs.push(['Serial No',    b.serialNumber]);
        if (b.masaBerlaku)   pairs.push(['Masa Berlaku', b.masaBerlaku]);
        if (b.tglLunas)      pairs.push(['Tgl Lunas',    fmtTanggal(b.tglLunas)]);
        if (b.refnumLunasin) pairs.push(['Ref Lunasin',  b.refnumLunasin]);
      } else {
        if (b.tarif || b.daya) pairs.push(['Tarif/Daya', (b.tarif || '') + (b.daya ? '/' + b.daya + ' VA' : '')]);
        if (b.noMeter)    pairs.push(['No Meter',    b.noMeter]);
        if (b.standMeter) pairs.push(['Stand Meter', b.standMeter]);
        if (b.jumBill && b.jumBill !== '1' && b.jumBill !== '0') pairs.push(['Jml Tagihan', b.jumBill]);
        if (b.periode && !b.kodeProduk.startsWith('pln-prepaid')) pairs.push(['Periode', fmtPeriode(b.periode)]);
      }
      if (!isBpjs && !isTelkom && !isPulsa) {
        if ((b.rpAmount || 0) > 0) pairs.push(['Tagihan', fmtRp(b.rpAmount)]);
        if ((b.rpAdmin  || 0) > 0) pairs.push(['Admin',   fmtRp(b.rpAdmin)]);
      }
      if (!isBpjs && !isPulsa) {
        if (b.refnumLunasin)        pairs.push(['Ref Lunasin', b.refnumLunasin]);
        if (b.kwh)                  pairs.push(['kWh',         b.kwh]);
        if ((b.rpMaterai || 0) > 0) pairs.push(['Materai',     fmtRp(b.rpMaterai)]);
        if ((b.rpPpn     || 0) > 0) pairs.push(['PPN',         fmtRp(b.rpPpn)]);
        if ((b.rpPju     || 0) > 0) pairs.push(['PPJ',         fmtRp(b.rpPju)]);
        if ((b.rpAngsuran|| 0) > 0) pairs.push(['Angsuran',    fmtRp(b.rpAngsuran)]);
        if ((b.rpToken   || 0) > 0) pairs.push(['Nilai Token', fmtRp(b.rpToken)]);
        if ((b.rpTotal   || 0) > 0) pairs.push(['Total',       fmtRp(b.rpTotal)]);
      }
      if (!isBpjs && !isTelkom && !isPulsa) {
        if (b.refnum)      pairs.push(['Ref Number',   b.refnum]);
        if (b.tglLunas)    pairs.push(['Tgl Lunas',    b.tglLunas]);
        if (b.pesanBiller) pairs.push(['Pesan Biller', b.pesanBiller.substring(0, 21)]);
      }
    } else {
      const pemakaian = b.pemakaian ?? ((b.standKini || 0) - (b.standLalu || 0));
      pairs.push(['Golongan',    b.gol || '-']);
      pairs.push(['Stand Meter', `${b.standLalu || 0} -> ${b.standKini || 0}`]);
      pairs.push(['Pemakaian',   `${Number(pemakaian).toLocaleString('id-ID', { maximumFractionDigits: 1 })} m3`]);
      pairs.push(['Harga Air',   fmtRp(b.hargaAir   || 0)]);
      pairs.push(['Beban Tetap', fmtRp(b.bebanTetap || 0)]);
      pairs.push(['Biaya Meter', fmtRp(b.biayaMeter || 0)]);
      pairs.push(['Limbah',      fmtRp(b.limbah     || 0)]);
      pairs.push(['Retribusi',   fmtRp(b.retribusi  || 0)]);
      pairs.push(['Denda',       fmtRp(b.denda      || 0)]);
      pairs.push(['Materai',     fmtRp(b.materai    || 0)]);
      pairs.push(['Diskon',      '- ' + fmtRp(b.diskon || 0)]);
    }

    for (let j = 0; j < pairs.length; j += 2) {
      const c1 = detailCell(pairs[j][0], pairs[j][1]);
      const c2r = j + 1 < pairs.length ? detailCell(pairs[j + 1][0], pairs[j + 1][1]) : ' '.repeat(40);
      line(c1 + c2r);
    }

    // Token PLN — centered, bold
    if (isPln && b.tokenPln) {
      const tokenFmt = String(b.tokenPln).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1-');
      line(LIGHT);
      ctr('TOKEN PLN', false);
      ctr(tokenFmt, true);
      line(LIGHT);
    }

    if (!isPln) {
      c2('  Tagihan', fmtRp(b.tagihan));
      c2('  Admin  ', fmtRp(b.admin));
    }
    c2('  SUBTOTAL', fmtRp(b.total), true);

    if (idx < (data.bills || []).length - 1) line(LIGHT);
  });

  // Feed lines (paper advance for easy tear-off)
  for (let i = 0; i < FEED; i++) chunks.push(LF);

  return chunks.join('');
}

/**
 * Plain-text version (no ESC/P control bytes) — for live preview di UI.
 */
function formatPlainText(data, cfg = {}) {
  // Strip ESC/P bold sequences from formatEscp output
  return formatEscp(data, cfg)
    .replace(new RegExp(ESC + '@', 'g'), '')
    .replace(new RegExp(ESC + 'E', 'g'), '')
    .replace(new RegExp(ESC + 'F', 'g'), '');
}

module.exports = { formatEscp, formatPlainText };
