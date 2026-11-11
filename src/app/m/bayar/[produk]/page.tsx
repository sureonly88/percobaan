"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { BarcodeScanner, isBarcodeScanSupported } from "@/ui/mobile/BarcodeScanner";
import {
  PLN_TOKEN_NOMINALS,
  findMobileProduct,
  formatPeriode,
  formatRp,
  guessOperator,
  lunasinServiceType,
  normalizePhone,
} from "@/lib/mobile/products";
import { DATA_OPERATORS, DATA_PACKAGES, PDAM_KALIMANTAN, PULSA_NOMINALS, PULSA_OPERATORS } from "@/data/lunasin-products";
import { newIdempotencyKey, streamMultipay } from "@/lib/mobile/multipay-client";
import { buildShareReceipt } from "@/lib/mobile/receipt-share";
import { ReceiptShareCard, TokenCards } from "@/ui/mobile/ReceiptShareCard";
import type { MultiPaymentResponse, UnifiedPaymentItemInput } from "@/lib/multipay/types";

type Step = "input" | "confirm" | "processing" | "result";

interface LoketInfo {
  loketCode: string;
  nama: string;
  saldo: number;
}

/** Tagihan hasil inquiry yang siap dibayar (format item multipay). */
interface CartItem extends UnifiedPaymentItemInput {
  itemCode: string;
  customerName: string;
  periodLabel: string;
  metadata: Record<string, unknown>;
}

type PayOutcome =
  | { kind: "done"; response: MultiPaymentResponse }
  | { kind: "unknown"; error: string };

interface RecentCustomer {
  id: string;
  nama: string;
}

const PDAM_ID = /^[a-zA-Z0-9]+$/;

export default function MobileBayarProdukPage() {
  const params = useParams<{ produk: string }>();
  const product = findMobileProduct(String(params?.produk || ""));
  const { data: session } = useSession();
  const user = session?.user as { id?: string; name?: string | null; username?: string } | undefined;

  const [step, setStep] = useState<Step>("input");
  const [loket, setLoket] = useState<LoketInfo | null>(null);

  // Input
  const [customerId, setCustomerId] = useState("");
  const [tokenNominal, setTokenNominal] = useState<number | null>(null);
  const [operator, setOperator] = useState("");
  const [pulsaNominal, setPulsaNominal] = useState<number | null>(null);
  const [dataPackage, setDataPackage] = useState("");
  const [pdamKal, setPdamKal] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);
  const [recent, setRecent] = useState<RecentCustomer[]>([]);

  // Inquiry
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Konfirmasi & bayar
  const [cashInput, setCashInput] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [outcome, setOutcome] = useState<PayOutcome | null>(null);

  const recentKey = product ? `m_recent_${product.slug}` : "";

  // Data loket (kode, nama, saldo) dari profil sendiri — kasir tidak punya akses /api/loket
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/pengaturan/profil?userId=${user.id}`)
      .then((r) => r.json())
      .then((profile) => {
        if (profile?.loket) {
          setLoket({
            loketCode: profile.loket.loketCode,
            nama: profile.loket.nama,
            saldo: Number(profile.loket.pulsa ?? 0),
          });
        }
      })
      .catch(() => {});
  }, [user?.id, step]);

  useEffect(() => {
    setScanSupported(isBarcodeScanSupported());
    if (!recentKey) return;
    try {
      setRecent(JSON.parse(localStorage.getItem(recentKey) || "[]"));
    } catch {
      setRecent([]);
    }
  }, [recentKey]);

  // Pulsa/paket data: tebak operator dari awalan nomor
  useEffect(() => {
    if (product?.kind !== "pulsa" && product?.kind !== "data") return;
    const op = guessOperator(customerId);
    if (op && op !== operator) {
      setOperator(op);
      setPulsaNominal(null);
      setDataPackage("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, product?.kind]);

  const grandTotal = useMemo(() => cart.reduce((s, i) => s + i.total, 0), [cart]);
  const cash = Number(cashInput.replace(/\D/g, "")) || 0;
  const paidAmount = cash > 0 ? cash : grandTotal;
  const change = Math.max(0, paidAmount - grandTotal);
  const saldoKurang = loket !== null && loket.saldo < grandTotal;

  const onScan = useCallback((value: string) => {
    setScanning(false);
    setCustomerId(value);
  }, []);

  if (!product) {
    return (
      <div>
        <MobileHeader title="Produk tidak ditemukan" backHref="/m/bayar" />
        <p className="p-6 text-center text-slate-500">Pilih produk dari menu Bayar.</p>
      </div>
    );
  }

  function saveRecent(id: string, nama: string) {
    const next = [{ id, nama }, ...recent.filter((r) => r.id !== id)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      /* abaikan */
    }
  }

  async function handleInquiry() {
    if (!product) return;
    const id = product.kind === "pulsa" || product.kind === "data" ? normalizePhone(customerId) : customerId.trim();
    setError("");
    if (!id) return setError(`${product.inputLabel} wajib diisi`);
    if (!PDAM_ID.test(id)) return setError(`${product.inputLabel} hanya boleh berisi angka/huruf`);

    let kodeProduk = product.baseCode || "";
    let input2 = "";
    if (product.kind === "pln-token") {
      if (!tokenNominal) return setError("Pilih nominal token");
      input2 = String(tokenNominal);
    } else if (product.kind === "pulsa") {
      if (!operator) return setError("Pilih operator");
      if (!pulsaNominal) return setError("Pilih nominal pulsa");
      kodeProduk = `pulsa-${operator}-${pulsaNominal}K`;
    } else if (product.kind === "data") {
      if (!operator) return setError("Pilih operator");
      if (!dataPackage) return setError("Pilih paket data");
      kodeProduk = dataPackage;
    } else if (product.kind === "pdam-kal") {
      if (!pdamKal) return setError("Pilih PDAM");
      kodeProduk = pdamKal;
    }

    setInquiryLoading(true);
    try {
      if (product.kind === "pdam") {
        const res = await fetch("/api/pembayaran/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idpel: id }),
        });
        const data = await res.json();
        if (!res.ok) return setError(data.error || "Gagal cek tagihan");
        const adminFee = Number(data.adminFee || 0);
        const rows: Array<Record<string, string>> = data.data || [];
        if (rows.length === 0) return setError("Tidak ada tagihan untuk pelanggan ini");
        const items: CartItem[] = rows.map((b, idx) => {
          const total = Number(b.total) || 0;
          return {
            itemCode: `PDAM-${id}-${b.thbln}-${idx}`,
            provider: "PDAM",
            serviceType: "PDAM_NATIVE",
            customerId: id,
            customerName: b.nama || "",
            productCode: "PDAM_NATIVE",
            periodLabel: b.thbln || "",
            amount: total,
            adminFee,
            total: total + adminFee,
            metadata: {
              nama: b.nama || "",
              alamat: b.alamat || "",
              blth: b.thbln || "",
              gol: b.gol || "",
              idgol: b.gol || "",
              harga: Number(b.harga) || 0,
              denda: Number(b.denda) || 0,
              materai: Number(b.materai) || 0,
              limbah: Number(b.limbah) || 0,
              retribusi: Number(b.retribusi) || 0,
              standLalu: Number(b.stand_l) || 0,
              standKini: Number(b.stand_i) || 0,
              subTotal: total,
              biayaMeter: Number(b.biaya_meter) || 0,
              bebanTetap: Number(b.biaya_tetap) || 0,
              abodemen: Number(b.byadmin) || 0,
              total,
              diskon: Number(b.diskon) || 0,
              pakai: Number(b.pakai) || 0,
            },
          };
        });
        setCart(items);
        saveRecent(id, items[0].customerName);
      } else {
        const res = await fetch("/api/pembayaran/lunasin/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idpel: id, kodeProduk, input2 }),
        });
        const data = await res.json();
        if (!res.ok) return setError(data.error || "Gagal cek tagihan");
        const d = data.data;
        if (!d) return setError("Data tagihan tidak ditemukan");
        const resolvedKode = String(data.kodeProduk || kodeProduk);
        const nama = String(d.nama || "");
        const item: CartItem = {
          itemCode: `LUNASIN-${id}-${resolvedKode}-0`,
          provider: "LUNASIN",
          serviceType: lunasinServiceType(resolvedKode),
          customerId: id,
          customerName: nama,
          productCode: resolvedKode,
          periodLabel: String(d.periode || d.jenis_reg || resolvedKode),
          providerRef: String(data.idTrx || ""),
          amount: Number(d.rp_amount) || 0,
          adminFee: Number(d.rp_admin) || 0,
          total: Number(d.rp_total) || 0,
          metadata: {
            nama,
            kodeProduk: resolvedKode,
            idTrx: String(data.idTrx || ""),
            periode: String(d.periode || ""),
            tarif: String(d.tarif || ""),
            daya: String(d.daya || ""),
            jumBill: String(d.jum_bill || "1"),
            input2,
            detail: d.detail || [],
            standMeter: String(d.stand_meter || ""),
            noreg: String(d.noreg || ""),
            tgl_reg: String(d.tgl_reg || ""),
            jenis_reg: String(d.jenis_reg || ""),
            namaPdam: String(d.nama_pdam || ""),
            namaProduk: String(d.nama_produk || ""),
          },
        };
        setCart([item]);
        saveRecent(id, nama);
      }
      setCashInput("");
      setIdempotencyKey(newIdempotencyKey());
      setStep("confirm");
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setInquiryLoading(false);
    }
  }

  async function handlePay() {
    if (!loket || cart.length === 0) return;
    setConfirmOpen(false);
    setError("");
    if (cash > 0 && cash < grandTotal) return setError("Uang diterima kurang dari total bayar");
    // Key dipertahankan bila hasil sebelumnya belum pasti → server mengembalikan hasil lama
    const key = idempotencyKey || newIdempotencyKey();
    setIdempotencyKey(key);
    setProgress("Mengirim pembayaran…");
    setStep("processing");

    const result = await streamMultipay(
      { idempotencyKey: key, loketCode: loket.loketCode, loketName: loket.nama, paidAmount, items: cart },
      (event) => {
        if (event.type === "provider_start") setProgress(`Memproses ${event.itemCount} tagihan…`);
        else if (event.type === "provider_done") setProgress("Menyelesaikan transaksi…");
      },
    );

    if (result.kind === "rejected") {
      // Ditolak sebelum diproses (saldo kurang, snapshot kedaluwarsa, kasir sudah tutup, dst.)
      setIdempotencyKey(newIdempotencyKey());
      setError(result.error);
      setStep("confirm");
      return;
    }
    setOutcome(result.kind === "done" ? { kind: "done", response: result.response } : { kind: "unknown", error: result.error });
    setStep("result");
  }

  function resetAll() {
    setStep("input");
    setCart([]);
    setCustomerId("");
    setError("");
    setOutcome(null);
    setIdempotencyKey(null);
    setCashInput("");
    setWaNumber("");
  }

  const headerTitle = product.label;

  // ─── Langkah: proses ──────────────────────────────────────────────────
  if (step === "processing") {
    return (
      // Menutupi menu bawah agar agen tidak berpindah halaman saat pembayaran berjalan
      <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-14 w-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="font-semibold text-lg">{progress}</p>
        <p className="text-sm text-slate-500">Jangan tutup aplikasi atau menekan tombol kembali.</p>
      </div>
    );
  }

  // ─── Langkah: hasil ───────────────────────────────────────────────────
  if (step === "result" && outcome) {
    return (
      <ResultView
        outcome={outcome}
        cart={cart}
        loket={loket}
        kasir={user?.name || user?.username || ""}
        paidAmount={paidAmount}
        waNumber={waNumber}
        onRetry={handlePay}
        onNew={resetAll}
      />
    );
  }

  // ─── Langkah: konfirmasi ──────────────────────────────────────────────
  if (step === "confirm") {
    const first = cart[0];
    return (
      <div>
        <MobileHeader title="Konfirmasi" subtitle={headerTitle} onBack={() => { setStep("input"); setError(""); }} />
        <div className="p-4 space-y-4 pb-40">
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-500">Pelanggan</p>
            <p className="text-lg font-bold leading-tight">{first?.customerName || "-"}</p>
            <p className="text-sm text-slate-500">{first?.customerId}</p>
            {product.kind === "pln-token" && tokenNominal && (
              <p className="text-sm mt-1">Token {formatRp(tokenNominal)}{first?.metadata.tarif ? ` · ${first.metadata.tarif}/${first.metadata.daya}` : ""}</p>
            )}
            {(product.kind === "pulsa" || product.kind === "data") && (
              <p className="text-sm mt-1">{String(first?.metadata.namaProduk || first?.productCode)}</p>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
            <p className="font-semibold mb-2">Rincian</p>
            <ul className="space-y-2">
              {cart.map((it) => (
                <li key={it.itemCode} className="text-sm">
                  <div className="flex justify-between">
                    <span>{product.kind === "pdam" || it.serviceType === "PLN_POSTPAID" || it.serviceType === "TELKOM" ? `Periode ${periodeLabel(it.periodLabel)}` : "Tagihan"}</span>
                    <span>{formatRp(it.amount)}</span>
                  </div>
                  {it.adminFee > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Biaya admin</span>
                      <span>{formatRp(it.adminFee)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-baseline">
              <span className="font-semibold">Total bayar</span>
              <span className="text-2xl font-bold text-primary">{formatRp(grandTotal)}</span>
            </div>
            {loket && (
              <p className={`text-xs mt-2 ${saldoKurang ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                Saldo loket {formatRp(loket.saldo)}{saldoKurang ? " — tidak cukup, lakukan top-up dulu" : ""}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Uang diterima (opsional)</span>
              <input
                inputMode="numeric"
                value={cashInput ? Number(cashInput.replace(/\D/g, "") || 0).toLocaleString("id-ID") : ""}
                onChange={(e) => setCashInput(e.target.value.replace(/\D/g, ""))}
                placeholder={`Uang pas ${grandTotal.toLocaleString("id-ID")}`}
                className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-lg"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {cashChips(grandTotal).map((v) => (
                <button key={v} type="button" onClick={() => setCashInput(String(v))} className="h-9 px-3 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-medium">
                  {v === grandTotal ? "Uang pas" : formatRp(v)}
                </button>
              ))}
            </div>
            {cash > grandTotal && <p className="text-sm">Kembalian: <b>{formatRp(change)}</b></p>}
            <label className="block">
              <span className="text-sm font-medium">No. WhatsApp pelanggan (untuk kirim struk)</span>
              <input
                inputMode="tel"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3"
              />
            </label>
          </div>

          {error && <ErrorBox message={error} onRecheck={/kedaluwarsa|snapshot|ulangi cek/i.test(error) ? () => { setStep("input"); setError(""); } : undefined} />}
        </div>

        <BottomAction>
          <button
            type="button"
            disabled={!loket || saldoKurang || (cash > 0 && cash < grandTotal)}
            onClick={() => setConfirmOpen(true)}
            className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-bold disabled:opacity-40"
          >
            Bayar {formatRp(grandTotal)}
          </button>
        </BottomAction>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setConfirmOpen(false)}>
            <div className="w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
              <p className="text-lg font-bold">Proses pembayaran?</p>
              <p className="text-sm text-slate-500 mt-1">
                {product.label} untuk <b>{first?.customerName || first?.customerId}</b> sebesar <b>{formatRp(grandTotal)}</b>. Saldo loket akan dipotong.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmOpen(false)} className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">Batal</button>
                <button type="button" onClick={handlePay} className="h-12 rounded-xl bg-primary text-white font-bold">Ya, bayar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Langkah: input ───────────────────────────────────────────────────
  const pulsaOps = product.kind === "data" ? DATA_OPERATORS : PULSA_OPERATORS;
  return (
    <div>
      <MobileHeader title={headerTitle} backHref="/m/bayar" />
      <div className="p-4 space-y-4 pb-36">
        {product.kind === "pdam-kal" && (
          <label className="block rounded-2xl bg-white dark:bg-slate-900 p-4">
            <span className="text-sm font-medium">PDAM</span>
            <select
              value={pdamKal}
              onChange={(e) => setPdamKal(e.target.value)}
              className="mt-1 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3"
            >
              <option value="">Pilih PDAM…</option>
              {PDAM_KALIMANTAN.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
          </label>
        )}

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <label htmlFor="custid" className="text-sm font-medium">{product.inputLabel}</label>
          <div className="mt-1 flex gap-2">
            <input
              id="custid"
              inputMode={product.inputMode}
              autoComplete="off"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.replace(/\s/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") handleInquiry(); }}
              placeholder={product.inputPlaceholder}
              className="flex-1 min-w-0 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-lg tracking-wide"
            />
            {scanSupported && product.kind !== "pulsa" && product.kind !== "data" && (
              <button type="button" onClick={() => setScanning(true)} className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center" aria-label="Pindai barcode">
                <span className="material-symbols-outlined">barcode_scanner</span>
              </button>
            )}
          </div>
          {recent.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-1.5">Terakhir</p>
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {recent.map((r) => (
                  <button key={r.id} type="button" onClick={() => setCustomerId(r.id)} className="shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-left">
                    <span className="block text-xs font-semibold max-w-[9rem] truncate">{r.nama || r.id}</span>
                    <span className="block text-[11px] text-slate-500">{r.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {product.kind === "pln-token" && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
            <p className="text-sm font-medium mb-2">Nominal token</p>
            <div className="grid grid-cols-3 gap-2">
              {PLN_TOKEN_NOMINALS.map((n) => (
                <Chip key={n} active={tokenNominal === n} onClick={() => setTokenNominal(n)}>
                  {n >= 1000000 ? "1 jt" : `${n / 1000} rb`}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {(product.kind === "pulsa" || product.kind === "data") && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">Operator</p>
              <div className="flex flex-wrap gap-2">
                {pulsaOps.map((op) => (
                  <Chip key={op.id} active={operator === op.id} onClick={() => { setOperator(op.id); setPulsaNominal(null); setDataPackage(""); }}>
                    {op.label}
                  </Chip>
                ))}
              </div>
            </div>
            {product.kind === "pulsa" && operator && (
              <div>
                <p className="text-sm font-medium mb-2">Nominal</p>
                <div className="grid grid-cols-4 gap-2">
                  {(PULSA_NOMINALS[operator] || []).map((n) => (
                    <Chip key={n} active={pulsaNominal === n} onClick={() => setPulsaNominal(n)}>
                      {n >= 1000 ? `${n / 1000} jt` : `${n} rb`}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {product.kind === "data" && operator && (
              <div>
                <p className="text-sm font-medium mb-2">Paket</p>
                <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                  {(DATA_PACKAGES[operator] || []).map((p) => (
                    <li key={p.code}>
                      <button
                        type="button"
                        onClick={() => setDataPackage(p.code)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 text-sm border ${dataPackage === p.code ? "border-primary bg-primary/10 text-primary font-semibold" : "border-slate-200 dark:border-slate-700"}`}
                      >
                        {p.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <ErrorBox message={error} />}
      </div>

      <BottomAction>
        <button
          type="button"
          onClick={handleInquiry}
          disabled={inquiryLoading || !customerId.trim()}
          className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-bold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {inquiryLoading && <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {inquiryLoading ? "Mengecek tagihan…" : "Cek tagihan"}
        </button>
      </BottomAction>

      {scanning && <BarcodeScanner onResult={onScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

// ─── Tampilan hasil + struk ──────────────────────────────────────────────

function ResultView({
  outcome,
  cart,
  loket,
  kasir,
  paidAmount,
  waNumber,
  onRetry,
  onNew,
}: {
  outcome: PayOutcome;
  cart: CartItem[];
  loket: LoketInfo | null;
  kasir: string;
  paidAmount: number;
  waNumber: string;
  onRetry: () => void;
  onNew: () => void;
}) {
  if (outcome.kind === "unknown") {
    return (
      <div>
        <MobileHeader title="Status belum pasti" />
        <div className="p-6 text-center space-y-3">
          <StatusIcon tone="amber" icon="help" />
          <p className="text-lg font-bold">Hasil pembayaran belum diterima</p>
          <p className="text-sm text-slate-500">
            {outcome.error}. Pembayaran mungkin sudah diproses. Tekan <b>Cek ulang hasil</b> — aman, tidak akan membayar dua kali.
            Jangan memulai transaksi baru untuk pelanggan yang sama sebelum statusnya jelas.
          </p>
          <button type="button" onClick={onRetry} className="w-full h-14 rounded-2xl bg-primary text-white font-bold">Cek ulang hasil</button>
          <Link href="/m/riwayat" className="block text-primary font-semibold py-2">Lihat riwayat transaksi</Link>
        </div>
      </div>
    );
  }

  const res = outcome.response;
  const byCode = new Map(cart.map((c) => [c.itemCode, c]));
  const rows = res.results.map((r) => {
    const item = byCode.get(r.itemCode);
    const status = r.status === "SUCCESS" ? "SUCCESS" : r.status === "FAILED" ? "FAILED" : "PENDING";
    return { r, item, status: status as "SUCCESS" | "PENDING" | "FAILED" };
  });
  const successRows = rows.filter((x) => x.status === "SUCCESS");
  const pendingRows = rows.filter((x) => x.status === "PENDING");
  const failedRows = rows.filter((x) => x.status === "FAILED");

  const tone = failedRows.length === rows.length ? "red" : pendingRows.length > 0 ? "amber" : failedRows.length > 0 ? "amber" : "green";
  const title =
    successRows.length === rows.length ? "Pembayaran berhasil"
    : pendingRows.length > 0 ? "Pembayaran sedang diproses"
    : successRows.length > 0 ? "Sebagian berhasil"
    : "Pembayaran gagal";

  // Struk hanya memuat tagihan yang sudah LUNAS (lihat buildShareReceipt)
  const receipt = buildShareReceipt({
    loketName: res.loketName || loket?.nama || "",
    loketCode: res.loketCode || loket?.loketCode || "",
    kasir,
    paidAt: res.paidAt || new Date().toISOString(),
    referenceCode: res.multiPaymentCode,
    paidAmount,
    items: rows.map(({ r, item }) => ({
      serviceType: r.serviceType,
      provider: r.provider,
      customerId: r.customerId,
      customerName: r.customerName || item?.customerName,
      periodLabel: item?.periodLabel,
      amount: item?.amount || 0,
      adminFee: item?.adminFee || 0,
      total: item?.total || 0,
      status: r.status,
      transactionCode: r.transactionCode,
      providerData: r.providerData,
      metadata: item?.metadata,
    })),
  });

  return (
    <div>
      <MobileHeader title="Hasil pembayaran" />
      <div className="p-4 space-y-4 pb-36">
        <div className="text-center pt-2">
          <StatusIcon tone={tone} icon={tone === "green" ? "check" : tone === "red" ? "close" : "hourglass_top"} />
          <p className="text-xl font-bold mt-3">{title}</p>
          <p className="text-sm text-slate-500">{res.multiPaymentCode}</p>
        </div>

        {receipt && <TokenCards receipt={receipt} />}

        <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(({ r, item, status }) => (
            <li key={r.itemCode} className="p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.customerName || item?.customerName || r.customerId}</p>
                <p className="text-xs text-slate-500">
                  {r.customerId}{item?.provider === "PDAM" ? ` · ${periodeLabel(item.periodLabel)}` : ""}
                </p>
                {status === "FAILED" && r.error && <p className="text-xs text-red-600 mt-1">{r.error}</p>}
                {status === "PENDING" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Menunggu konfirmasi provider. Saldo ditahan sampai ada kepastian — jangan bayar ulang.
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatRp(item?.total || 0)}</p>
                <StatusBadge status={status} />
              </div>
            </li>
          ))}
        </ul>

        {receipt && <ReceiptShareCard receipt={receipt} waNumber={waNumber} />}
      </div>

      <BottomAction>
        <button type="button" onClick={onNew} className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-bold">
          Transaksi baru
        </button>
      </BottomAction>
    </div>
  );
}

// ─── Komponen kecil ───────────────────────────────────────────────────────

function periodeLabel(raw: string): string {
  return formatPeriode(raw);
}

function cashChips(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>([total]);
  for (const step of [10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
  }
  return Array.from(out).sort((a, b) => a - b).slice(0, 4);
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 px-3 rounded-xl text-sm font-semibold border ${
        active ? "border-primary bg-primary/10 text-primary" : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function BottomAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] px-4 pb-3 pt-3 bg-gradient-to-t from-background-light via-background-light/95 to-transparent dark:from-background-dark dark:via-background-dark/95">
      {children}
    </div>
  );
}

function ErrorBox({ message, onRecheck }: { message: string; onRecheck?: () => void }) {
  return (
    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 text-sm flex gap-2">
      <span className="material-symbols-outlined text-lg">error</span>
      <div className="flex-1">
        <p>{message}</p>
        {onRecheck && (
          <button type="button" onClick={onRecheck} className="mt-1 font-semibold underline">Cek ulang tagihan</button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ tone, icon }: { tone: "green" | "amber" | "red"; icon: string }) {
  const cls = { green: "bg-emerald-100 text-emerald-600", amber: "bg-amber-100 text-amber-600", red: "bg-red-100 text-red-600" }[tone];
  return (
    <span className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${cls}`}>
      <span className="material-symbols-outlined text-4xl">{icon}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: "SUCCESS" | "PENDING" | "FAILED" }) {
  const map = {
    SUCCESS: ["Lunas", "bg-emerald-100 text-emerald-700"],
    PENDING: ["Diproses", "bg-amber-100 text-amber-700"],
    FAILED: ["Gagal", "bg-red-100 text-red-700"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
