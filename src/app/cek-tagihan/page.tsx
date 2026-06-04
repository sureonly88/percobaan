"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DATA_OPERATORS, DATA_PACKAGES, PULSA_NOMINALS, PULSA_OPERATORS } from "@/data/lunasin-products";

type ServiceCode =
  | "pdam-native"
  | "pln-postpaid"
  | "pln-prepaid"
  | "pln-nonrek"
  | "bpjs-kesehatan"
  | "telkom-telepon"
  | "pdam-kota-banjarmasin"
  | "pulsa"
  | "paket-data";

const SERVICES: Array<{ code: ServiceCode; label: string; icon: string; tone: string; hint: string }> = [
  { code: "pdam-native", label: "PDAM", icon: "water_drop", tone: "text-blue-600 bg-blue-50 border-blue-100", hint: "ID pelanggan" },
  { code: "pln-postpaid", label: "PLN Pascabayar", icon: "electric_meter", tone: "text-amber-600 bg-amber-50 border-amber-100", hint: "ID pelanggan PLN" },
  { code: "pln-prepaid", label: "PLN Token", icon: "bolt", tone: "text-yellow-600 bg-yellow-50 border-yellow-100", hint: "Nomor meter / IDPEL" },
  { code: "pln-nonrek", label: "PLN Non-Rekening", icon: "receipt_long", tone: "text-orange-600 bg-orange-50 border-orange-100", hint: "Nomor registrasi" },
  { code: "bpjs-kesehatan", label: "BPJS", icon: "health_and_safety", tone: "text-green-600 bg-green-50 border-green-100", hint: "Nomor VA BPJS" },
  { code: "telkom-telepon", label: "Telkom", icon: "call", tone: "text-red-600 bg-red-50 border-red-100", hint: "Nomor telepon" },
  { code: "pdam-kota-banjarmasin", label: "PDAM Banjarmasin", icon: "water_drop", tone: "text-sky-600 bg-sky-50 border-sky-100", hint: "ID pelanggan" },
  { code: "pulsa", label: "Pulsa", icon: "smartphone", tone: "text-purple-600 bg-purple-50 border-purple-100", hint: "Nomor HP" },
  { code: "paket-data", label: "Paket Data", icon: "wifi", tone: "text-cyan-600 bg-cyan-50 border-cyan-100", hint: "Nomor HP" },
];

const PLN_TOKEN_NOMINALS = [20000, 50000, 100000, 200000, 500000, 1000000];

interface InquiryItem {
  provider: string;
  serviceType: string;
  customerId: string;
  customerName?: string;
  productCode?: string;
  periodLabel?: string;
  amount: number;
  adminFee: number;
  total: number;
}

interface InquiryResult {
  serviceLabel: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  totalAdmin: number;
  grandTotal: number;
  items: InquiryItem[];
}

function formatRp(value: number) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

export default function CekTagihanPage() {
  const [service, setService] = useState<ServiceCode>("pdam-native");
  const [customerId, setCustomerId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [pulsaNominal, setPulsaNominal] = useState(0);
  const [plnTokenNominal, setPlnTokenNominal] = useState(50000);
  const [dataPackageCode, setDataPackageCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [result, setResult] = useState<InquiryResult | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [featureLoading, setFeatureLoading] = useState(true);
  const [selfServiceEnabled, setSelfServiceEnabled] = useState(true);
  const [paymentLinksEnabled, setPaymentLinksEnabled] = useState(true);

  const selected = useMemo(() => SERVICES.find((item) => item.code === service) || SERVICES[0], [service]);
  const selectedDataPackages = useMemo(() => DATA_PACKAGES[operatorId] || [], [operatorId]);
  const selectedPulsaNominals = useMemo(() => PULSA_NOMINALS[operatorId] || [], [operatorId]);

  useEffect(() => {
    fetch("/api/public/features", { cache: "no-store" })
      .then((res) => res.json())
      .then((flags) => {
        setSelfServiceEnabled(flags.publicSelfServiceEnabled !== false);
        setPaymentLinksEnabled(flags.paymentLinksEnabled !== false);
      })
      .catch(() => {})
      .finally(() => setFeatureLoading(false));
  }, []);

  function resetResult() {
    setResult(null);
    setInvoiceUrl("");
    setError("");
  }

  function buildProductPayload() {
    if (service === "pln-prepaid") return { nominal: plnTokenNominal };
    if (service === "pulsa") return { operator: operatorId, nominal: pulsaNominal };
    if (service === "paket-data") return { operator: operatorId, packageCode: dataPackageCode };
    return {};
  }

  async function handleInquiry(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setInvoiceUrl("");
    try {
      const res = await fetch("/api/public/self-service/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, customerId, ...buildProductPayload() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal cek tagihan");
        return;
      }
      setResult(data);
      setCustomerName(data.customerName || "");
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePaymentLink() {
    if (!result || creating || !paymentLinksEnabled) return;
    setCreating(true);
    setError("");
    setInvoiceUrl("");
    try {
      const res = await fetch("/api/public/self-service/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, customerId: result.customerId, customerName, customerPhone, customerEmail, ...buildProductPayload() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat invoice");
        return;
      }
      setInvoiceUrl(data.publicUrl || "");
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {!featureLoading && !selfServiceEnabled ? (
          <div className="rounded-3xl border border-amber-200 bg-white p-10 text-center shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
            <span className="material-symbols-outlined text-6xl text-amber-600">public_off</span>
            <h1 className="mt-4 text-3xl font-black text-slate-950 dark:text-white">Self-Service Publik Nonaktif</h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-500">Layanan cek tagihan mandiri sedang dimatikan. Silakan hubungi loket atau admin untuk melakukan pembayaran.</p>
            <Link href="/login" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-black text-white">Login Loket</Link>
          </div>
        ) : (
          <>
        <div className="mb-8 flex items-center justify-between gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary font-black">Pedami Payment</p>
            <h1 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-slate-950">Cek dan Bayar Tagihan</h1>
            <p className="mt-3 text-slate-600 max-w-2xl">Cek tagihan utilitas secara mandiri, buat invoice online, lalu bayar melalui channel pembayaran yang tersedia.</p>
          </div>
          <Link href="/login" className="hidden sm:inline-flex px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm hover:border-primary/30 hover:text-primary">Login Loket</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-2 rounded-3xl bg-white text-slate-900 p-5 sm:p-6 shadow-xl shadow-slate-200/70 border border-slate-200">
            <form onSubmit={handleInquiry} className="space-y-5">
              <div>
                <label className="text-sm font-black">Pilih Layanan</label>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SERVICES.map((item) => (
                    <button
                      type="button"
                      key={item.code}
                      onClick={() => { setService(item.code); resetResult(); }}
                      className={`rounded-2xl border p-3 text-left transition ${service === item.code ? item.tone : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                      <span className="block mt-1 text-sm font-black">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {service === "pln-prepaid" && (
                <div>
                  <label className="text-sm font-black">Nominal Token</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {PLN_TOKEN_NOMINALS.map((nominal) => (
                      <button
                        key={nominal}
                        type="button"
                        onClick={() => { setPlnTokenNominal(nominal); resetResult(); }}
                        className={`rounded-xl border px-3 py-2 text-sm font-black ${plnTokenNominal === nominal ? "border-yellow-300 bg-yellow-50 text-yellow-700" : "border-slate-200 hover:bg-slate-50"}`}
                      >
                        {formatRp(nominal)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(service === "pulsa" || service === "paket-data") && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <label className="block">
                    <span className="text-sm font-black">Operator</span>
                    <select
                      value={operatorId}
                      onChange={(event) => {
                        setOperatorId(event.target.value);
                        setPulsaNominal(0);
                        setDataPackageCode("");
                        resetResult();
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                    >
                      <option value="">Pilih operator</option>
                      {(service === "pulsa" ? PULSA_OPERATORS : DATA_OPERATORS).map((operator) => (
                        <option key={operator.id} value={operator.id}>{operator.label}</option>
                      ))}
                    </select>
                  </label>

                  {service === "pulsa" && operatorId && (
                    <label className="block">
                      <span className="text-sm font-black">Nominal Pulsa</span>
                      <select
                        value={pulsaNominal}
                        onChange={(event) => { setPulsaNominal(Number(event.target.value)); resetResult(); }}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                      >
                        <option value={0}>Pilih nominal</option>
                        {selectedPulsaNominals.map((nominal) => (
                          <option key={nominal} value={nominal}>{formatRp(nominal * 1000)}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  {service === "paket-data" && operatorId && (
                    <label className="block">
                      <span className="text-sm font-black">Paket Data</span>
                      <select
                        value={dataPackageCode}
                        onChange={(event) => { setDataPackageCode(event.target.value); resetResult(); }}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                      >
                        <option value="">Pilih paket</option>
                        {selectedDataPackages.map((pkg) => (
                          <option key={pkg.code} value={pkg.code}>{pkg.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <label className="block">
                <span className="text-sm font-black">{selected.hint}</span>
                <input
                  value={customerId}
                  onChange={(event) => { setCustomerId(event.target.value.replace(/\s/g, "")); resetResult(); }}
                  placeholder={`Masukkan ${selected.hint.toLowerCase()}`}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-primary"
                />
              </label>

              {!paymentLinksEnabled && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Payment Link sedang nonaktif. Cek tagihan bisa dilakukan, tetapi invoice online tidak bisa dibuat.</div>}
              {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

              <button disabled={loading || !customerId.trim()} className="w-full rounded-2xl bg-primary px-5 py-3 font-black text-white disabled:opacity-50">
                {loading ? "Mengecek tagihan..." : `Cek ${selected.label}`}
              </button>
            </form>
          </section>

          <section className="lg:col-span-3 rounded-3xl border border-slate-200 bg-white/90 backdrop-blur p-5 sm:p-6 shadow-xl shadow-slate-200/70">
            {!result ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70">
                <span className="material-symbols-outlined text-7xl text-primary/70">receipt_long</span>
                <h2 className="mt-4 text-2xl font-black text-slate-900">Hasil tagihan tampil di sini</h2>
                <p className="mt-2 max-w-md">Setelah tagihan ditemukan, kamu bisa membuat invoice online dan melanjutkan pembayaran.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-primary font-black">{result.serviceLabel}</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">{result.customerName || result.customerId}</h2>
                    <p className="text-sm text-slate-500">{result.customerId}</p>
                  </div>
                  <div className="rounded-2xl bg-primary/5 text-slate-900 px-4 py-3 border border-primary/10">
                    <p className="text-xs uppercase font-black text-slate-400">Total Bayar</p>
                    <p className="text-2xl font-black text-primary">{formatRp(result.grandTotal)}</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  {result.items.map((item, index) => (
                    <div key={`${item.customerId}-${item.periodLabel}-${index}`} className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0 hover:bg-slate-50">
                      <div>
                        <p className="font-black text-slate-900">{item.customerName || item.customerId}</p>
                        <p className="text-xs text-slate-500">{item.provider} · {item.serviceType} · {item.periodLabel || item.productCode}</p>
                      </div>
                      <p className="font-black whitespace-nowrap text-slate-900">{formatRp(item.total)}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-slate-50 text-slate-900 p-4 space-y-3 border border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block text-sm">
                      <span className="font-bold">Nama</span>
                      <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block text-sm">
                      <span className="font-bold">No. WhatsApp</span>
                      <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Opsional" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block text-sm">
                      <span className="font-bold">Email</span>
                      <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Opsional" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="text-sm text-slate-500">
                      Tagihan {formatRp(result.totalAmount)} · Admin {formatRp(result.totalAdmin)}
                    </div>
                    <button onClick={handleCreatePaymentLink} disabled={creating || !paymentLinksEnabled} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">
                      {creating ? "Membuat invoice..." : "Buat Invoice & Bayar"}
                    </button>
                  </div>
                </div>

                {invoiceUrl && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-black text-emerald-700">Invoice berhasil dibuat.</p>
                    <a href={invoiceUrl} className="mt-2 inline-flex rounded-xl bg-emerald-500 px-5 py-3 font-black text-white" target="_blank" rel="noreferrer">Buka Invoice Pembayaran</a>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
          </>
        )}
      </div>
    </main>
  );
}
