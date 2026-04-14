#!/usr/bin/env node
/**
 * Simulasi pembayaran BPJS Kesehatan
 *
 * Usage:
 *   node scripts/simulate-bpjs.js
 *   LOKET_CODE=LYKN KASIR_USERNAME=yakin node scripts/simulate-bpjs.js
 */

const mysql  = require("mysql2/promise");
const crypto = require("crypto");

// ─── Data Inquiry & Payment dari Lunasin ────────────────────────────────────
const INQUIRY = {
  rc: "0000",
  rc_msg: "Sukses",
  tipe_pesan: "inquiry",
  kode_loket: "ABC00123",
  input1: "8888802740000902",
  input2: "1",
  id_trx: "158997790078304",
  kode_produk: "bpjs-kesehatan",
  data: {
    nama: "IRWAN AMIR",
    jum_bill: "1",
    refnum_lunasin: "62fda5d5fecdd41078f8aa221e33aa99",
    rp_amount: "45000",
    rp_admin: "3000",
    rp_total: "48000",
    nova: "8888802740000902",
    nova_kepala_keluarga: "8888802740000902",
    periode: "1",
    jum_peserta: "1",
    kode_cabang: "",
    nama_cabang: "",
    sisa: "0",
  },
};

const PAYMENT_RESPONSE = {
  rc: "0000",
  rc_msg: "Sukses",
  tipe_pesan: "payment",
  kode_loket: "ABC00123",
  input1: "8888802740000902",
  input2: "1",
  id_trx: "158997790078304",
  kode_produk: "bpjs-kesehatan",
  data: {
    nama: "IRWAN AMIR",
    jum_bill: "1",
    refnum_lunasin: "62fda5d5fecdd41078f8aa221e33aa99",
    rp_amount: "45000",
    rp_admin: "3000",
    rp_total: "48000",
    saldo_terpotong: "48000",
    sisa_saldo: "1251235",
    tgl_lunas: "2020-12-07 19:52:34",
    nova: "8888802740000902",
    nova_kepala_keluarga: "8888802740000902",
    periode: "1",
    jum_peserta: "1",
    kode_cabang: "",
    nama_cabang: "",
    sisa: "0",
    refnum: "1263781965183687",
    pesan_biller:
      "Rincian tagihan dapat diakses pada http://www.bpjs-kesehatan.go.id",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateTransactionCode() {
  return `LNS${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function buildRequestHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "127.0.0.1",
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || "yakinyakin",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME     || "pedami_payment",
  });

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         Simulasi Pembayaran BPJS Kesehatan                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  try {
    // ── 1. Resolve Loket ─────────────────────────────────────────────────────
    const loketCodeEnv = process.env.LOKET_CODE;
    let loket;
    if (loketCodeEnv) {
      const [[row]] = await conn.query(
        "SELECT loket_code, nama, biaya_admin, jenis, pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
        [loketCodeEnv]
      );
      loket = row;
    } else {
      const [[row]] = await conn.query(
        "SELECT loket_code, nama, biaya_admin, jenis, pulsa FROM lokets WHERE status = 'aktif' ORDER BY id ASC LIMIT 1"
      );
      loket = row;
    }

    if (!loket) {
      console.error("❌ Tidak ada loket aktif di database.");
      process.exit(1);
    }

    // ── 2. Resolve Kasir ─────────────────────────────────────────────────────
    const kasirUsernameEnv = process.env.KASIR_USERNAME;
    let kasirUsername;
    if (kasirUsernameEnv) {
      kasirUsername = kasirUsernameEnv;
    } else {
      const [[userRow]] = await conn.query(
        "SELECT username FROM users WHERE loket_id = (SELECT id FROM lokets WHERE loket_code = ? LIMIT 1) AND status = 'aktif' LIMIT 1",
        [loket.loket_code]
      );
      kasirUsername = userRow?.username || "admin";
    }

    const d          = INQUIRY.data;
    const idpel      = d.nova;              // BPJS pakai nomor VA (nova) sebagai ID
    const nama       = d.nama;
    const kodeProduk = INQUIRY.kode_produk; // "bpjs-kesehatan"
    const idTrx      = INQUIRY.id_trx;
    const rpAmount   = Number(d.rp_amount);
    const rpAdmin    = Number(d.rp_admin);
    const rpTotal    = Number(d.rp_total);

    console.log(`🏪 Loket       : ${loket.loket_code} — ${loket.nama}`);
    console.log(`👤 Kasir       : ${kasirUsername}`);
    console.log(`💰 Saldo       : Rp ${Number(loket.pulsa).toLocaleString("id-ID")}`);
    console.log("");
    console.log(`📋 Peserta     : ${nama}`);
    console.log(`🆔 No. VA      : ${d.nova}`);
    console.log(`👨‍👩‍👦 VA Kep. Kel  : ${d.nova_kepala_keluarga}`);
    console.log(`📅 Periode     : ${d.periode} bulan`);
    console.log(`👥 Jml Peserta : ${d.jum_peserta}`);
    console.log(`📦 Produk      : ${kodeProduk}`);
    console.log(`💵 Iuran       : Rp ${rpAmount.toLocaleString("id-ID")}`);
    console.log(`💵 Admin       : Rp ${rpAdmin.toLocaleString("id-ID")}`);
    console.log(`💵 Total       : Rp ${rpTotal.toLocaleString("id-ID")}`);
    console.log("");

    // ── 3. Cek saldo ──────────────────────────────────────────────────────────
    if (Number(loket.pulsa) < rpTotal) {
      console.error(
        `❌ Saldo loket tidak cukup. Saldo: Rp ${Number(loket.pulsa).toLocaleString("id-ID")}, Total: Rp ${rpTotal.toLocaleString("id-ID")}`
      );
      process.exit(1);
    }

    const idempotencyKey  = crypto.randomUUID();
    const transactionCode = generateTransactionCode();
    const multiPayCode    = `LNS-SIM-${Date.now()}`;
    const now             = new Date();

    // ── 4. log_inquery ────────────────────────────────────────────────────────
    await conn.execute(
      "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
      [
        "BPJS_INQUIRY_SIM",
        JSON.stringify({ idpel, response: INQUIRY }),
        kasirUsername,
      ]
    );
    console.log("✅ [1/6] log_inquery — inquiry tercatat");

    // ── 5. payment_requests ───────────────────────────────────────────────────
    const requestPayload = {
      provider: "LUNASIN",
      bills: [{
        idpel,
        nama,
        kodeProduk,
        idTrx,
        total: rpTotal,
        admin: rpAdmin,
        rpAmount,
        periode: d.periode,
        jumBill: d.jum_bill,
        input2: INQUIRY.input2,
      }],
      loketCode: loket.loket_code,
      loketName: loket.nama,
      biayaAdmin: rpAdmin,
    };
    const requestHash = buildRequestHash(requestPayload);

    await conn.execute(
      `INSERT INTO payment_requests
        (idempotency_key, request_hash, status, provider, loket_code, username, request_payload, created_at, updated_at)
       VALUES (?, ?, 'PENDING', 'LUNASIN', ?, ?, ?, NOW(), NOW())`,
      [idempotencyKey, requestHash, loket.loket_code, kasirUsername, JSON.stringify(requestPayload)]
    );
    console.log(`✅ [2/6] payment_requests — key: ${idempotencyKey}`);

    // ── 6. multi_payment_requests ─────────────────────────────────────────────
    const [mprResult] = await conn.execute(
      `INSERT INTO multi_payment_requests
        (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
         total_items, total_amount, total_admin, grand_total, paid_amount, change_amount, paid_at)
       VALUES (?, ?, 'SUCCESS', ?, ?, ?, 1, ?, ?, ?, 0, 0, NOW())`,
      [
        multiPayCode, idempotencyKey,
        loket.loket_code, loket.nama, kasirUsername,
        rpAmount, rpAdmin, rpTotal,
      ]
    );
    const multiPaymentId = mprResult.insertId;
    console.log(`✅ [3/6] multi_payment_requests — id: ${multiPaymentId}, code: ${multiPayCode}`);

    // ── 7. multi_payment_items ────────────────────────────────────────────────
    const metadata = {
      nama,
      kodeProduk,
      idTrx,
      periode: d.periode,
      tarif: "",
      daya: "",
      jumBill: d.jum_bill,
      input2: INQUIRY.input2,
      input3: "",
      jenis_loket: loket.jenis || "KASIR",
      source: "simulasi",
      // BPJS-specific
      nova: d.nova,
      nova_kepala_keluarga: d.nova_kepala_keluarga,
      jum_peserta: d.jum_peserta,
      kode_cabang: d.kode_cabang,
      nama_cabang: d.nama_cabang,
      sisa: d.sisa,
    };

    const itemCode = `LNS-${transactionCode}`;
    // period_label: "1 Bulan" lebih informatif daripada kode produk
    const periodLabel = `${d.periode} Bulan`;

    await conn.execute(
      `INSERT INTO multi_payment_items
        (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
         product_code, period_label, provider_ref, amount, admin_fee, total, status,
         transaction_code, provider_response, advice_attempts, metadata_json, paid_at)
       VALUES (?, ?, 'LUNASIN', 'BPJS', ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, 0, ?, NOW())`,
      [
        multiPaymentId, itemCode,
        idpel, nama,
        kodeProduk, periodLabel, idTrx,
        rpAmount, rpAdmin, rpTotal,
        transactionCode,
        JSON.stringify(PAYMENT_RESPONSE.data),
        JSON.stringify(metadata),
      ]
    );
    console.log(`✅ [4/6] multi_payment_items — item_code: ${itemCode}, trx: ${transactionCode}`);

    // ── 8. lunasin_trans ──────────────────────────────────────────────────────
    await conn.execute(
      `INSERT INTO lunasin_trans
        (transaction_code, transaction_date, cust_id, nama, kode_produk, id_trx,
         periode, jum_bill, rp_amount, rp_admin, rp_total,
         refnum_lunasin, username, loket_name, loket_code, jenis_loket,
         processing_status, provider_rc, provider_response,
         advice_attempts, paid_at, created_at, updated_at)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', '0000', ?, 0, NOW(), NOW(), NOW())`,
      [
        transactionCode,
        idpel, nama, kodeProduk, idTrx,
        d.periode, d.jum_bill,
        rpAmount, rpAdmin, rpTotal,
        PAYMENT_RESPONSE.data.refnum_lunasin,
        kasirUsername, loket.nama, loket.loket_code, loket.jenis || "KASIR",
        JSON.stringify(PAYMENT_RESPONSE.data),
      ]
    );
    console.log(`✅ [5/6] lunasin_trans — transaction_code: ${transactionCode}`);

    // ── 9. transaction_events ─────────────────────────────────────────────────
    const events = [
      {
        event_type: "INQUIRY_REQUEST",
        severity: "INFO",
        message: `Simulasi inquiry BPJS Kesehatan untuk ${idpel}`,
        payload: { idpel, kodeProduk, idTrx, source: "simulasi" },
      },
      {
        event_type: "PAYMENT_REQUEST_CREATED",
        severity: "INFO",
        message: "Payment request Lunasin BPJS berhasil dibuat (simulasi)",
        payload: { billsCount: 1, totalPembayaran: rpTotal },
      },
      {
        event_type: "PAYMENT_PROVIDER_SUCCESS",
        severity: "INFO",
        message: `Payment Lunasin berhasil untuk ${kodeProduk} (simulasi)`,
        payload: {
          data: PAYMENT_RESPONSE.data,
          transactionCode,
          refnum: PAYMENT_RESPONSE.data.refnum,
        },
      },
    ];

    for (const ev of events) {
      await conn.execute(
        `INSERT INTO transaction_events
          (idempotency_key, multi_payment_code, transaction_code, provider,
           event_type, severity, message, payload_json, username, loket_code, cust_id, created_at)
         VALUES (?, ?, ?, 'LUNASIN', ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          idempotencyKey, multiPayCode, transactionCode,
          ev.event_type, ev.severity, ev.message,
          JSON.stringify(ev.payload),
          kasirUsername, loket.loket_code, idpel,
        ]
      );
    }
    console.log("✅ [6/6] transaction_events — 3 events tercatat");

    // ── 10. Kurangi saldo & update status SUCCESS ─────────────────────────────
    await conn.execute(
      "UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?",
      [rpTotal, loket.loket_code]
    );

    const responsePayload = {
      success: true,
      partialSuccess: false,
      message: "Semua pembayaran berhasil",
      results: [{
        idpel, transactionCode, success: true,
        total: rpTotal, nama, kodeProduk,
        finalStatus: "SUCCESS",
        providerData: PAYMENT_RESPONSE.data,
      }],
      loketCode: loket.loket_code,
      loketName: loket.nama,
      biayaAdmin: rpAdmin,
      totalAdmin: rpAdmin,
      grandTotal: rpTotal,
      paidAt: now.toISOString(),
      idempotencyKey,
    };

    await conn.execute(
      "UPDATE payment_requests SET status='SUCCESS', response_payload=?, updated_at=NOW() WHERE idempotency_key=?",
      [JSON.stringify(responsePayload), idempotencyKey]
    );
    await conn.execute(
      "UPDATE multi_payment_requests SET status='SUCCESS', response_payload=?, paid_at=NOW(), updated_at=NOW() WHERE multi_payment_code=?",
      [JSON.stringify(responsePayload), multiPayCode]
    );

    const [[saldoBaru]] = await conn.query(
      "SELECT pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
      [loket.loket_code]
    );

    console.log("\n════════════════════════════════════════════════════════════════");
    console.log("  SIMULASI SELESAI — SEMUA DATA BERHASIL MASUK KE DATABASE");
    console.log("════════════════════════════════════════════════════════════════");
    console.log(`  Transaction Code : ${transactionCode}`);
    console.log(`  Multi Pay Code   : ${multiPayCode}`);
    console.log(`  Idempotency Key  : ${idempotencyKey}`);
    console.log(`  Ref Lunasin      : ${PAYMENT_RESPONSE.data.refnum_lunasin}`);
    console.log(`  Refnum Biller    : ${PAYMENT_RESPONSE.data.refnum}`);
    console.log(`  Tgl Lunas        : ${PAYMENT_RESPONSE.data.tgl_lunas}`);
    console.log(`  Pesan Biller     : ${PAYMENT_RESPONSE.data.pesan_biller}`);
    console.log(`  Saldo Loket Baru : Rp ${Number(saldoBaru.pulsa).toLocaleString("id-ID")}`);
    console.log("════════════════════════════════════════════════════════════════\n");

  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ Simulasi gagal:", err.message || err);
  process.exit(1);
});
