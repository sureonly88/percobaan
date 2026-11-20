// ─────────────────────────────────────────────────────────────────────────────
// Penyusun isi struk (ReceiptBillItem[]) — SATU sumber untuk semua jalur cetak:
//   • cetak otomatis & tombol "Cetak Struk" setelah lunas (pembayaran/page.tsx)
//   • cetak ulang (/api/pembayaran/reprint → Pembayaran, Laporan, Riwayat,
//     Cetak Ulang, Monitoring, Detail Pelanggan)
// Modul murni tanpa dependensi server/browser — aman di client maupun server.
// Logika Lunasin disalin apa adanya dari cetak otomatis pasca-bayar.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReceiptBillItem } from "@/lib/print-receipt";
import { parsePdamNumber } from "@/lib/pdam-number";

export interface ReceiptSourceItem {
  provider?: string;              // "PDAM" | "LUNASIN"
  idpel: string;
  nama: string;
  /** PDAM: blth (YYYYMM). */
  blth: string;
  kodeProduk?: string;
  transactionCode?: string;
  /** Biaya admin item (loket). */
  adminFee: number;
  /** Total item = tagihan + admin. */
  total: number;
  /** Lunasin: respons provider (providerData hasil bayar / provider_response di DB). */
  providerData?: Record<string, unknown> | null;
  /**
   * PDAM: sumber rincian tagihan, urut prioritas (mis. snapshot inquiry,
   * metadata_json, provider_response). Kunci camelCase/snake_case/format PDAM
   * ("58.500") semuanya dikenali.
   */
  pdamSources?: Array<Record<string, unknown> | null | undefined>;
}

/** provider_response hasil advice terbungkus {rc, tipe_pesan, data:{…}} — buka bungkusnya. */
export function unwrapProviderData(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const pd = raw || {};
  const inner = pd.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return { ...pd, ...(inner as Record<string, unknown>) };
  }
  return pd;
}

function pickPdam(sources: Array<Record<string, unknown> | null | undefined>, keys: string[]): unknown {
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return undefined;
}

function pdamNum(sources: Array<Record<string, unknown> | null | undefined>, keys: string[]): number | undefined {
  const v = pickPdam(sources, keys);
  return v === undefined ? undefined : parsePdamNumber(v as string | number);
}

function buildLunasinBills(r: ReceiptSourceItem): ReceiptBillItem[] {
  const pd = unwrapProviderData(r.providerData);
  const rpAdmin = Number(pd.rp_admin || r.adminFee || 0);
  const isPlnPostpaid = (r.kodeProduk || "").startsWith("pln-postpaid");
  const isPdamLunasin = (r.kodeProduk || "").startsWith("pdam");
  const rawDetail = Array.isArray(pd.detail) ? (pd.detail as Array<Record<string, unknown>>) : [];

  // PLN Pascabayar & PDAM Lunasin dengan multi-bulan: cetak 1 struk per periode
  if ((isPlnPostpaid || isPdamLunasin) && rawDetail.length > 1) {
    const adminFeePerPeriod = Math.round(rpAdmin / rawDetail.length);
    return rawDetail.map((d, i) => {
      // rp_amount = PLN Pascabayar; rp_total = PDAM Lunasin (field berbeda per docs)
      const periodAmount = Number(d.rp_amount ?? d.rp_total ?? 0);
      const periodAdmin =
        i === 0
          ? rpAdmin - adminFeePerPeriod * (rawDetail.length - 1)
          : adminFeePerPeriod;
      const periodTotal = periodAmount + periodAdmin;

      if (isPdamLunasin) {
        // Keterangan tambahan dinamis (retribusi dll dari nama_field_N)
        const extraBillFields: Array<{ label: string; value: string }> = [];
        for (let n = 1; n <= 3; n++) {
          const nama = d[`nama_field_${n}`];
          const val  = d[`value_field_${n}`];
          if (nama && String(nama) !== "" && val != null) {
            extraBillFields.push({
              label: String(nama).charAt(0).toUpperCase() + String(nama).slice(1),
              value: !isNaN(Number(val)) ? `Rp ${Number(val).toLocaleString("id-ID")}` : String(val),
            });
          }
        }
        return {
          type: "pln" as const,
          kodeProduk: r.kodeProduk || "",
          idpel: r.idpel,
          nama: r.nama,
          namaPdam: String(pd.nama_pdam || ""),
          alamat: String(pd.alamat || ""),
          gol: String(pd.golongan || pd.gol || ""),
          periode: String(d.periode ?? ""),
          meterAwal: d.meter_awal != null ? Number(d.meter_awal) : undefined,
          meterAkhir: d.meter_akhir != null ? Number(d.meter_akhir) : undefined,
          standMeter: String(
            d.stand_meter ??
            (d.meter_awal != null && d.meter_akhir != null ? `${d.meter_awal}-${d.meter_akhir}` : "")
          ),
          rpAir: Number(d.rp_air ?? 0),
          rpDanameter: Number(d.rp_danameter ?? 0),
          rpSampah: Number(d.rp_sampah ?? 0),
          rpAdministrasi: Number(d.rp_administrasi ?? 0),
          materai: Number(d.rp_materai ?? 0),
          denda: Number(d.rp_denda ?? 0),
          extraBillFields,
          refnumLunasin: String(pd.refnum_lunasin || ""),
          tglLunas: String(pd.tgl_lunas || ""),
          jumBill: "1",
          tagihan: periodAmount,
          admin: periodAdmin,
          total: periodTotal,
          transactionCode: r.transactionCode,
        };
      }

      return {
        type: "pln" as const,
        idpel: r.idpel,
        nama: r.nama,
        kodeProduk: r.kodeProduk || "",
        periode: String(d.periode ?? ""),
        tarif: String(pd.tarif || ""),
        daya: String(pd.daya || ""),
        // stand_meter = PLN; meter_awal/meter_akhir = PDAM Lunasin
        standMeter: String(
          d.stand_meter ??
          (d.meter_awal != null && d.meter_akhir != null
            ? `${d.meter_awal}-${d.meter_akhir}`
            : "")
        ),
        noMeter: String(pd.nometer || ""),
        jumBill: "1",
        tokenPln: "",
        refnumLunasin: String(pd.refnum_lunasin || ""),
        noreg: "",
        tglReg: "",
        jenisReg: "",
        rpAmount: periodAmount,
        rpAdmin: periodAdmin,
        tagihan: periodAmount,
        admin: periodAdmin,
        total: periodTotal,
        transactionCode: r.transactionCode,
        kwh: String(d.kwh ?? pd.kwh ?? ""),
        rpMaterai: Number(d.rp_materai ?? pd.rp_materai ?? 0),
        rpPpn: Number(d.rp_ppn ?? pd.rp_ppn ?? 0),
        rpPju: Number(d.rp_pju ?? pd.rp_pju ?? 0),
        rpAngsuran: Number(d.rp_angsuran ?? pd.rp_angsuran ?? 0),
        rpToken: Number(d.rp_token ?? pd.rp_token ?? 0),
        rpTotal: periodTotal,
        saldoTerpotong: 0,
        refnum: String(pd.refnum || ""),
        tglLunas: String(pd.tgl_lunas || ""),
        pesanBiller: String(pd.pesan_biller || ""),
        nova: "",
        novaKepalaKeluarga: "",
        jumPeserta: "",
        kodeCabang: "",
        namaCabang: "",
        sisaSaldoBpjs: "",
        nomor: "",
        denom: "",
        namaProduk: "",
        serialNumber: "",
        masaBerlaku: "",
      };
    });
  }

  // Single period: prepaid, BPJS, Telkom, Pulsa, dll
  // Khusus PDAM Lunasin 1 bulan: gunakan field PDAM bukan PLN
  if (isPdamLunasin) {
    const d = rawDetail.length === 1 ? rawDetail[0] : {};
    const extraBillFields: Array<{ label: string; value: string }> = [];
    for (let n = 1; n <= 3; n++) {
      const nama = d[`nama_field_${n}`];
      const val  = d[`value_field_${n}`];
      if (nama && String(nama) !== "" && val != null) {
        extraBillFields.push({
          label: String(nama).charAt(0).toUpperCase() + String(nama).slice(1),
          value: !isNaN(Number(val)) ? `Rp ${Number(val).toLocaleString("id-ID")}` : String(val),
        });
      }
    }
    const singleAmount = Number(d.rp_total ?? pd.rp_total ?? Math.max(0, r.total - rpAdmin));
    return [{
      type: "pln" as const,
      kodeProduk: r.kodeProduk || "",
      idpel: r.idpel,
      nama: r.nama,
      namaPdam: String(pd.nama_pdam || ""),
      alamat: String(pd.alamat || ""),
      gol: String(pd.golongan || pd.gol || ""),
      periode: String(d.periode ?? pd.periode ?? ""),
      meterAwal: d.meter_awal != null ? Number(d.meter_awal) : undefined,
      meterAkhir: d.meter_akhir != null ? Number(d.meter_akhir) : undefined,
      standMeter: String(
        d.stand_meter ??
        (d.meter_awal != null && d.meter_akhir != null ? `${d.meter_awal}-${d.meter_akhir}` : "")
      ),
      rpAir: Number(d.rp_air ?? 0),
      rpDanameter: Number(d.rp_danameter ?? 0),
      rpSampah: Number(d.rp_sampah ?? 0),
      rpAdministrasi: Number(d.rp_administrasi ?? 0),
      materai: Number(d.rp_materai ?? 0),
      denda: Number(d.rp_denda ?? 0),
      extraBillFields,
      refnumLunasin: String(pd.refnum_lunasin || ""),
      tglLunas: String(pd.tgl_lunas || ""),
      jumBill: "1",
      tagihan: singleAmount,
      admin: rpAdmin,
      total: r.total,
      transactionCode: r.transactionCode,
    }];
  }

  const rpAmount = Number(pd.rp_amount || Math.max(0, r.total - rpAdmin));
  return [{
    type: "pln" as const,
    idpel: r.idpel,
    nama: r.nama,
    kodeProduk: r.kodeProduk || "",
    periode: String(pd.periode || ""),
    tarif: String(pd.tarif || ""),
    daya: String(pd.daya || ""),
    standMeter: String(pd.stand_meter || ""),
    noMeter: String(pd.nometer || ""),
    jumBill: String(pd.jum_bill || "1"),
    tokenPln: String(pd.token || ""),
    refnumLunasin: String(pd.refnum_lunasin || ""),
    noreg: String(pd.noreg || ""),
    tglReg: String(pd.tgl_reg || ""),
    jenisReg: String(pd.jenis_reg || ""),
    rpAmount,
    rpAdmin,
    tagihan: rpAmount,
    admin: rpAdmin,
    total: r.total,
    transactionCode: r.transactionCode,
    kwh: String(pd.kwh || ""),
    rpMaterai: Number(pd.rp_materai || 0),
    rpPpn: Number(pd.rp_ppn || 0),
    rpPju: Number(pd.rp_pju || 0),
    rpAngsuran: Number(pd.rp_angsuran || 0),
    rpToken: Number(pd.rp_token || 0),
    rpTotal: Number(pd.rp_total || 0),
    saldoTerpotong: Number(pd.saldo_terpotong || 0),
    refnum: String(pd.refnum || ""),
    tglLunas: String(pd.tgl_lunas || ""),
    pesanBiller: String(pd.pesan_biller || ""),
    nova: String(pd.nova || ""),
    novaKepalaKeluarga: String(pd.nova_kepala_keluarga || ""),
    jumPeserta: String(pd.jum_peserta || ""),
    kodeCabang: String(pd.kode_cabang || ""),
    namaCabang: String(pd.nama_cabang || ""),
    sisaSaldoBpjs: String(pd.sisa || ""),
    nomor: String(pd.nomor || ""),
    denom: String(pd.denom || ""),
    namaProduk: String(pd.nama_produk || ""),
    serialNumber: String(pd.serial_number || ""),
    masaBerlaku: String(pd.masa_berlaku || ""),
  }];
}

function buildPdamBill(r: ReceiptSourceItem): ReceiptBillItem {
  const src = r.pdamSources || [];
  const str = (...keys: string[]) => {
    const v = pickPdam(src, keys);
    return v === undefined ? undefined : String(v);
  };
  return {
    type: "pdam",
    idpel: r.idpel,
    nama: r.nama,
    alamat: str("alamat"),
    gol: str("gol", "idgol"),
    periode: r.blth,
    standLalu: pdamNum(src, ["standLalu", "stand_lalu", "stand_l"]),
    standKini: pdamNum(src, ["standKini", "stand_kini", "stand_i"]),
    pemakaian: pdamNum(src, ["pakai", "pemakaian"]),
    hargaAir: pdamNum(src, ["harga", "harga_air", "hargaAir"]),
    denda: pdamNum(src, ["denda"]),
    materai: pdamNum(src, ["materai"]),
    limbah: pdamNum(src, ["limbah"]),
    retribusi: pdamNum(src, ["retribusi"]),
    bebanTetap: pdamNum(src, ["bebanTetap", "beban_tetap", "biaya_tetap"]),
    biayaMeter: pdamNum(src, ["biayaMeter", "biaya_meter"]),
    diskon: pdamNum(src, ["diskon"]),
    tagihan: Math.max(0, r.total - (r.adminFee || 0)),
    admin: r.adminFee || 0,
    total: r.total,
    transactionCode: r.transactionCode,
  };
}

/** Susun baris struk untuk item-item yang berhasil dibayar (urutan dipertahankan). */
export function buildReceiptBills(items: ReceiptSourceItem[]): ReceiptBillItem[] {
  return items.flatMap((r) => (r.provider === "LUNASIN" ? buildLunasinBills(r) : [buildPdamBill(r)]));
}
