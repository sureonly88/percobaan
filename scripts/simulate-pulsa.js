#!/usr/bin/env node
/**
 * Simulasi pembayaran Pulsa Telkomsel 50K
 *
 * Usage:
 *   node scripts/simulate-pulsa.js
 *   LOKET_CODE=LYKN KASIR_USERNAME=yakin node scripts/simulate-pulsa.js
 */

const mysql  = require("mysql2/promise");
const crypto = require("crypto");

// ─── Data Inquiry & Payment dari Lunasin ────────────────────────────────────
const INQUIRY = {
  rc: "0000",
  rc_msg: "Sukses",
  tipe_pesan: "inquiry",
  kode_loket: "ABC00123",
  input1: "081321123412",
  input2: "",
  id_trx: "158997790078304",
  kode_produk: "pulsa-telkomsel-50K",
  data: {
    nama: "-",
    jum_bill: "1",
    refnum_lunasin: "62fda5d5fecdd41078f8aa221e33aa99",
    rp_amount: "48200",
    rp_admin: "0",
    rp_total: "48200",
    nomor: "081321123412",
    denom: "50000",
    nama_produk: "Pulsa Telkomsel 50K",
  },
};

const PAYMENT_RESPONSE = {
  rc: "0000",
  rc_msg: "Sukses",
  tipe_pesan: "payment",
  kode_loket: "ABC00123",
  input1: "081321123412",
  input2: "",
  id_trx: "158997790078304",
  kode_produk: "pulsa-telkomsel-50K",
  data: {
    nama: "-",
    jum_bill: "1",
    refnum_lunasin: "62fda5d5fecdd41078f8aa221e33aa99",
    rp_amount: "48200",
    rp_admin: "0",
    rp_total: "48200",
    saldo_terpotong: "48200",
    sisa_saldo: "1251235",
    tgl_lunas: "2020-12-07 19:52:34",
    nomor: "081321123412",
    denom: "50000",
    masa_berlaku: "",
    serial_number: "17394716",
    nama_produk: "Pulsa Telkomsel 50K",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateTransactionCode() {
  return `LNS${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function buildRequestHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
  console.log("║         Simulasi Pembayaran Pulsa Telkomsel 50K              ║");
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

    const d           = INQUIRY.data;
    const idpel       = d.nomor || INQUIRY.input1;    // for pulsa, id = phone number
    const nama        = d.nama_produk;               // "Pulsa Telkomsel 50K"
    const kodeProduk  = INQUIRY.kode_produk;
    const idTrx       = INQUIRY.id_trx;
    const rpAmount    = Number(d.rp_amount);
    const rpAdmin     = Number(d.rp_admin);           // 0 for pulsa
    const rpTotal     = Number(d.rp_total);
    const denom       = Number(d.denom);

    console.log(`🏪 Loket         : ${loket.loket_code} — ${loket.nama}`);
    console.log(`👤 Kasir         : ${kasirUsername}`);
    console.log(`💰 Saldo         : Rp ${Number(loket.pulsa).toLocaleString("id-ID")}`);
    console.log("");
    console.log(`📦 Produk        : ${d.nama_produk}`);
    console.log(`📱 No. HP        : ${d.nomor}`);
    console.log(`💸 Denominasi    : Rp ${denom.toLocaleString("id-ID")}`);
    console.log(`💵 Harga Beli    : Rp ${rpAmount.toLocaleString("id-ID")}`);
    console.log(`💵 Admin         : Rp ${rpAdmin.toLocaleString("id-ID")}`);
    console.log(`💵 Total         : Rp ${rpTotal.toLocaleString("id-ID")}`);
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
      ["PULSA_INQUIRY_SIM", JSON.stringify({ idpel, response: INQUIRY }), kasirUsername]
    );
    console.log("✅ [1/6] log_inquery — inquiry tercatat");

    // ── 5. payment_requests ───────────────────────────────────────────────────
    const requestPayload = {
      provider: "LUNASIN",
      bills: [{ idpel, nama, kodeProduk, idTrx, total: rpTotal, admin: rpAdmin, rpAmount, denom }],
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
      [multiPayCode, idempotencyKey, loket.loket_code, loket.nama, kasirUsername, rpAmount, rpAdmin, rpTotal]
    );
    const multiPaymentId = mprResult.insertId;
    console.log(`✅ [3/6] multi_payment_requests — id: ${multiPaymentId}, code: ${multiPayCode}`);

    // ── 7. multi_payment_items ────────────────────────────────────────────────
    const metadata = {
      nama, kodeProduk, idTrx,
      jenis_loket: loket.jenis || "KASIR",
      source: "simulasi",
      // Pulsa-specific
      nomor: d.nomor,
      denom: d.denom,
      nama_produk: d.nama_produk,
      serial_number: PAYMENT_RESPONSE.data.serial_number,
      masa_berlaku: PAYMENT_RESPONSE.data.masa_berlaku,
      tgl_lunas: PAYMENT_RESPONSE.data.tgl_lunas,
    };

    const itemCode    = `LNS-${transactionCode}`;
    const periodLabel = d.nama_produk;  // "Pulsa Telkomsel 50K"

    await conn.execute(
      `INSERT INTO multi_payment_items
        (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
         product_code, period_label, provider_ref, amount, admin_fee, total, status,
         transaction_code, provider_response, advice_attempts, metadata_json, paid_at)
       VALUES (?, ?, 'LUNASIN', 'PULSA', ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, 0, ?, NOW())`,
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
        "",         // periode — tidak relevan untuk pulsa
        d.jum_bill,
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
        message: `Simulasi inquiry Pulsa ${d.nama_produk} untuk ${idpel}`,
        payload: { idpel, kodeProduk, idTrx, denom, namaProduk: d.nama_produk, source: "simulasi" },
      },
      {
        event_type: "PAYMENT_REQUEST_CREATED",
        severity: "INFO",
        message: `Payment request Lunasin Pulsa berhasil dibuat (simulasi)`,
        payload: { billsCount: 1, totalPembayaran: rpTotal },
      },
      {
        event_type: "PAYMENT_PROVIDER_SUCCESS",
        severity: "INFO",
        message: `Payment Lunasin berhasil untuk ${kodeProduk} (simulasi)`,
        payload: { data: PAYMENT_RESPONSE.data, transactionCode, serialNumber: PAYMENT_RESPONSE.data.serial_number },
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
    await conn.execute("UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?", [rpTotal, loket.loket_code]);

    const responsePayload = {
      success: true, partialSuccess: false, message: "Semua pembayaran berhasil",
      results: [{ idpel, transactionCode, success: true, total: rpTotal, nama, kodeProduk, finalStatus: "SUCCESS", providerData: PAYMENT_RESPONSE.data }],
      loketCode: loket.loket_code, loketName: loket.nama,
      biayaAdmin: rpAdmin, totalAdmin: rpAdmin, grandTotal: rpTotal,
      paidAt: now.toISOString(), idempotencyKey,
    };

    await conn.execute(
      "UPDATE payment_requests SET status='SUCCESS', response_payload=?, updated_at=NOW() WHERE idempotency_key=?",
      [JSON.stringify(responsePayload), idempotencyKey]
    );
    await conn.execute(
      "UPDATE multi_payment_requests SET status='SUCCESS', response_payload=?, paid_at=NOW(), updated_at=NOW() WHERE multi_payment_code=?",
      [JSON.stringify(responsePayload), multiPayCode]
    );

    const [[saldoBaru]] = await conn.query("SELECT pulsa FROM lokets WHERE loket_code = ? LIMIT 1", [loket.loket_code]);

    console.log("\n════════════════════════════════════════════════════════════════");
    console.log("  SIMULASI SELESAI — SEMUA DATA BERHASIL MASUK KE DATABASE");
    console.log("════════════════════════════════════════════════════════════════");
    console.log(`  Transaction Code : ${transactionCode}`);
    console.log(`  Multi Pay Code   : ${multiPayCode}`);
    console.log(`  Idempotency Key  : ${idempotencyKey}`);
    console.log(`  Produk           : ${d.nama_produk}`);
    console.log(`  No. HP           : ${d.nomor}`);
    console.log(`  Serial Number    : ${PAYMENT_RESPONSE.data.serial_number}`);
    console.log(`  Ref Lunasin      : ${PAYMENT_RESPONSE.data.refnum_lunasin}`);
    console.log(`  Tgl Lunas        : ${PAYMENT_RESPONSE.data.tgl_lunas}`);
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
