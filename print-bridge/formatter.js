'use strict';

// ESC/P control sequences (Epson LX-310 / LX-350 compatible)
const ESC       = '\x1B';
const INIT      = ESC + '@';   // Initialize printer
const BOLD_ON   = ESC + 'E';   // Bold on
const BOLD_OFF  = ESC + 'F';   // Bold off
const LF        = '\r\n';      // Dot matrix lebih aman pakai CRLF agar carriage kembali ke kiri
const FF        = '\x0C';      // Form feed: flush/eject halaman agar job tidak tertahan di buffer

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

function clampInt(v, def, min, max) {
  const n = Math.round(Number(v));
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function r2c(left, right, width) {
  const gap = width - left.length - right.length;
  if (gap < 1) return left.substring(0, width - right.length - 1) + ' ' + right;
  return left + ' '.repeat(gap) + right;
}

function wrapText(text, width) {
  const out = [];
  const value = String(text || '');
  for (let i = 0; i < value.length; i += width) out.push(value.slice(i, i + width));
  return out.length ? out : [''];
}

function detailLine(label, value, width) {
  const INDENT = 2, LABEL_W = 14, SEP = ': ';
  const maxVal = (width || 80) - INDENT - LABEL_W - SEP.length;
  return ' '.repeat(INDENT) +
    label.substring(0, LABEL_W).padEnd(LABEL_W) +
    SEP +
    String(value).substring(0, maxVal);
}

function detailCell(label, value) {
  const INDENT = 4, LABEL_W = 12, SEP = ' : ';
  const VAL_W = 40 - INDENT - LABEL_W - SEP.length; // = 21
  return ' '.repeat(INDENT) +
    label.substring(0, LABEL_W).padEnd(LABEL_W) +
    SEP +
    String(value).substring(0, VAL_W).padEnd(VAL_W);
}

/**
 * Format receipt data as ESC/P bytes for Epson LX-310 @ 80 columns.
 * @param {object} data  - ReceiptPrintData (same structure as Next.js app)
 * @param {object} cfg   - { columns: 80, feedLines: 4 }
 * @returns {string}     - ESC/P encoded string — write as binary (latin1)
 */
function formatEscp(data, cfg = {}) {
  const W    = cfg.columns  || 80;
  const FORM_FEED = cfg.formFeed === true;
  const PLAIN = cfg.plain === true;
  const tpl  = cfg.template || {};
  const HEAVY = '='.repeat(W);
  const LIGHT = '-'.repeat(W);
  // Tinggi 1 lembar continuous form dalam baris @ 6 LPI (1/6 inch per baris).
  // 9.5" x 11" = 66 baris, 9.5" x 5.5" = 33 baris, 9.5" x 11/3" = 22 baris.
  const PAGE_LINES = clampInt(cfg.pageLines, 66, 6, 127);
  // Baris kosong di awal setiap lembar (jarak dari perforasi ke baris pertama).
  const TOP_MARGIN = clampInt(cfg.topMargin, 0, 0, PAGE_LINES - 1);

  const chunks = [];
  // Baris struk yang sedang dirakit: { text, drop }. drop = 0 → wajib dicetak;
  // drop > 0 → boleh dibuang (angka terbesar dibuang duluan) bila struk tidak
  // muat dalam 1 lembar. Struk yang melewati perforasi akan terpotong saat
  // kertas disobek, jadi lebih baik membuang hiasan daripada tumpah.
  let pageBuf = [];

  // Semua teks dipotong ke W kolom. Baris yang lebih panjang dari lebar
  // kertas akan di-wrap otomatis oleh printer menjadi 2 baris fisik,
  // sehingga hitungan baris meleset dan struk berikutnya bergeser.
  function clean(s)       { return String(s).replace(/[^\x20-\x7E]/g, '?').substring(0, W); }
  function line(s, drop)  { pageBuf.push({ text: clean(s), drop: drop || 0 }); }
  // Untuk EPSON LX-310 di komputer ini, job dengan ESC bold (ESC E/F)
  // tertahan di queue. Pakai teks plain ASCII agar cocok dengan `copy /b`
  // yang sudah terbukti mencetak langsung ke share printer.
  function bold(s)        { return s; }
  function ctr(text, b, drop) {
    const t = clean(text);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    line(' '.repeat(pad) + (b ? bold(t) : t), drop);
  }
  function c2(left, right, b) {
    const content = r2c(String(left), String(right), W);
    line(b ? bold(content) : content);
  }
  function startPage() {
    pageBuf = [];
  }
  function endPage() {
    // Buang baris opsional (prioritas drop terbesar dulu, dari bawah) sampai muat.
    const capacity = PAGE_LINES - TOP_MARGIN;
    const levels = [...new Set(pageBuf.map((l) => l.drop).filter((d) => d > 0))].sort((a, b) => b - a);
    for (const level of levels) {
      for (let i = pageBuf.length - 1; i >= 0 && pageBuf.length > capacity; i--) {
        if (pageBuf[i].drop === level) pageBuf.splice(i, 1);
      }
      if (pageBuf.length <= capacity) break;
    }
    if (pageBuf.length > capacity) {
      console.warn(`[Formatter] Struk ${pageBuf.length} baris > kapasitas ${capacity} baris/lembar — akan tumpah ke lembar berikutnya`);
    }

    let pageLineCount = 0;
    for (let i = 0; i < TOP_MARGIN; i++) { chunks.push(LF); pageLineCount++; }
    for (const l of pageBuf) { chunks.push(l.text + LF); pageLineCount++; }
    pageBuf = [];

    if (FORM_FEED && !PLAIN) {
      // FF: printer maju ke top-of-form berikutnya berdasarkan ESC C.
      chunks.push(FF);
    } else {
      // Pad ke kelipatan PAGE_LINES; kalau isi > 1 lembar, lanjut ke batas
      // lembar berikutnya agar struk selanjutnya tetap mulai di perforasi.
      const remaining = (PAGE_LINES - (pageLineCount % PAGE_LINES)) % PAGE_LINES;
      for (let i = 0; i < remaining; i++) chunks.push(LF);
    }
  }

  // ── Init ──
  // ESC @      : reset printer
  // ESC 2      : spasi baris 1/6 inch (6 LPI) — basis hitungan PAGE_LINES
  // ESC C n    : panjang halaman = n baris, posisi sekarang = top-of-form
  // ESC O      : matikan skip-over-perforation (kalau aktif di default
  //              printer, printer melompati ~1 inch tiap halaman → geser)
  if (!PLAIN) {
    chunks.push(INIT + ESC + '2' + ESC + 'C' + String.fromCharCode(PAGE_LINES) + ESC + 'O');
  }

  // Header dicetak di setiap lembar agar setiap potongan struk berdiri
  // sendiri dan posisi isinya sama persis di setiap lembar.
  // Prioritas buang (drop), terbesar dibuang duluan:
  //   7 keterangan cetak ulang, 6 sub-judul, 5 garis tebal hiasan,
  //   4 garis tipis header, 3 garis pemisah blok URL, 2 instruksi scan,
  //   1 judul "VALIDASI STRUK DIGITAL" (agar URL tetap berlabel selama mungkin).
  function header() {
    if (data.isCopy) {
      // Tag COPY wajib tercetak; hiasan & keterangannya boleh dibuang.
      line(HEAVY, 5);
      const tag = data.copyNumber && data.copyNumber > 1
        ? `*** COPY #${data.copyNumber} - BUKAN STRUK ASLI ***`
        : `*** COPY - BUKAN STRUK ASLI ***`;
      ctr(tag, true);
      if (data.copyBy || data.copyAt) {
        const meta = [
          data.copyBy ? `Dicetak ulang oleh: ${data.copyBy}` : '',
          data.copyAt ? fmtTanggal(data.copyAt) : '',
        ].filter(Boolean).join('  -  ');
        if (meta) ctr(meta, false, 7);
      }
    }
    line(HEAVY, data.isCopy ? 0 : 5);
    ctr(tpl.headerLine1 || 'PEDAMI PAYMENT', true);
    ctr(tpl.headerLine2 || 'Layanan Pembayaran Multi-Produk', false, 6);
    line(HEAVY, 5);
    c2('Loket   : ' + data.loketCode + ' ' + (data.loketName || ''), 'Kasir : ' + data.kasir);
    line('Tanggal : ' + fmtTanggal(data.tanggal));
    line(LIGHT, 4);
  }

  // ── Bills ──
  (data.bills || []).forEach((b, idx) => {
    startPage();
    header();

    const isPln = b.type === 'pln';
    const isPdamLunasin = isPln && b.kodeProduk && b.kodeProduk.startsWith('pdam');

    line(`[${idx + 1}] ${b.nama}`);
    let idLine = `    ID   : ${b.idpel}`;
    if (isPdamLunasin && b.periode) idLine += '  Periode : ' + fmtPeriode(b.periode);
    else if (!isPln && b.periode) idLine += '  Periode : ' + fmtPeriode(b.periode);
    line(idLine);
    if (b.namaPdam)        line('    PDAM  : ' + b.namaPdam);
    if (!isPdamLunasin && b.alamat) line('    Alamat: ' + b.alamat.substring(0, W - 12));
    if (b.transactionCode) line('    Kode  : ' + b.transactionCode);

    const pairs = [];
    let useTwoCol = !isPln || isPdamLunasin;
    if (isPln) {
      const prod = getProdukLabel(b.kodeProduk || '');
      const isNonrek = b.kodeProduk && b.kodeProduk.startsWith('pln-nonrek');
      const isBpjs   = b.kodeProduk && b.kodeProduk.startsWith('bpjs');
      const isTelkom = b.kodeProduk && b.kodeProduk.startsWith('telkom');
      const isPulsa  = b.kodeProduk && (b.kodeProduk.startsWith('pulsa') || b.kodeProduk.startsWith('paketdata'));
      if (isPdamLunasin) {
        // ── PDAM via Lunasin API ──────────────────────────────────────────
        if (b.alamat) pairs.push(['Alamat', b.alamat.substring(0, 21)]);
        if (b.gol)    pairs.push(['Golongan', b.gol]);
        if (b.meterAwal != null && b.meterAkhir != null) {
          pairs.push(['Stand Meter', `${b.meterAwal} -> ${b.meterAkhir}`]);
          pairs.push(['Pemakaian', `${(b.meterAkhir - b.meterAwal).toLocaleString('id-ID')} m3`]);
        } else if (b.standMeter) {
          pairs.push(['Stand Meter', b.standMeter]);
        }
        pairs.push(['Rek. Air',     fmtRp(b.rpAir          || 0)]);
        pairs.push(['Dana Meter',   fmtRp(b.rpDanameter    || 0)]);
        pairs.push(['Ret. Sampah',  fmtRp(b.rpSampah       || 0)]);
        pairs.push(['Administrasi', fmtRp(b.rpAdministrasi || 0)]);
        pairs.push(['Materai',      fmtRp(b.materai        || 0)]);
        pairs.push(['Denda',        fmtRp(b.denda          || 0)]);
        if (b.extraBillFields) {
          for (const ef of b.extraBillFields) pairs.push([String(ef.label).substring(0, 12), ef.value]);
        }
        if (b.refnumLunasin) pairs.push(['Ref Lunasin', b.refnumLunasin]);
        if (b.tglLunas)      pairs.push(['Tgl Lunas',   fmtTanggal(b.tglLunas)]);
      } else {
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
        useTwoCol = true;
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

    if (useTwoCol) {
      for (let i = 0; i < pairs.length; i += 2) {
        const [lbl1, val1] = pairs[i];
        if (i + 1 < pairs.length) {
          const [lbl2, val2] = pairs[i + 1];
          line(detailCell(lbl1, String(val1)) + detailCell(lbl2, String(val2)));
        } else {
          line(detailLine(lbl1, val1, W));
        }
      }
    } else {
      for (const [lbl, val] of pairs) {
        line(detailLine(lbl, val, W));
      }
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
    } else if (isPdamLunasin) {
      if ((b.admin || 0) > 0) c2('  Biaya Admin', fmtRp(b.admin));
    }
    c2('  SUBTOTAL', fmtRp(b.total), true);

    // Digital receipt URL — hanya di halaman tagihan terakhir
    if (idx === (data.bills || []).length - 1 && data.digitalReceiptUrl) {
      line(LIGHT, 3);
      ctr('VALIDASI STRUK DIGITAL', true, 1);
      ctr('Scan QR atau buka URL berikut:', false, 2);
      for (const part of wrapText(data.digitalReceiptUrl, W)) ctr(part, false);
    }

    // Setiap tagihan = tepat 1 lembar (PAGE_LINES baris), dipangkas bila perlu
    endPage();
  });

  return chunks.join('');
}

/**
 * Plain-text version (no ESC/P control bytes) — for live preview di UI.
 */
function formatPlainText(data, cfg = {}) {
  return formatEscp(data, { ...cfg, plain: true });
}

module.exports = { formatEscp, formatPlainText };
