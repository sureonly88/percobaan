"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { ReceiptShareCard, TokenCards, TxStatusBadge } from "@/ui/mobile/ReceiptShareCard";
import { formatPeriode, formatRp, serviceVisual } from "@/lib/mobile/products";
import { buildShareReceipt, serviceLabel } from "@/lib/mobile/receipt-share";

interface DetailItem {
  itemCode: string;
  provider: string;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  productCode: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  status: string;
  transactionCode: string | null;
  providerErrorMessage: string | null;
  adviceAttempts: number;
  providerResponse: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface Detail {
  maxAdviceAttempts?: number;
  multiPayment: {
    multiPaymentCode: string;
    status: string;
    loketCode: string | null;
    loketName: string | null;
    username: string | null;
    grandTotal: number;
    totalAdmin: number;
    paidAmount: number;
    changeAmount: number;
    paidAt: string | null;
    createdAt: string;
  };
  items: DetailItem[];
}

const PENDING = ["PENDING", "PENDING_PROVIDER", "PENDING_ADVICE"];

/** Item yang boleh dicek ulang ke provider oleh agen (PENDING_REVIEW = wewenang admin). */
function canRunAdvice(i: DetailItem, max: number): boolean {
  if (!i.transactionCode || i.adviceAttempts >= max) return false;
  if (i.provider === "PDAM") return i.status === "PENDING_ADVICE";
  if (i.provider === "LUNASIN") return PENDING.includes(i.status);
  return false;
}

type AdviceMsg = { tone: "ok" | "wait" | "bad"; text: string };

export default function MobileRiwayatDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(String(params?.code || ""));
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; username?: string } | undefined;

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState<string | null>(null);
  const [adviceMsg, setAdviceMsg] = useState<Record<string, AdviceMsg>>({});

  const load = useCallback(async (): Promise<Detail | null> => {
    setLoading(true);
    setError("");
    try {
      // Server mengembalikan 404 bila transaksi milik loket lain (untuk kasir)
      const res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Transaksi tidak ditemukan");
        return null;
      }
      setData(json);
      return json as Detail;
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [code]);

  /**
   * Tanya ulang status ke provider (advice). Hasil final tetap ditentukan server:
   * lunas → SUCCESS; belum ada kepastian → tetap Diproses (hold ditahan);
   * batas percobaan habis → diteruskan ke Review Transaksi. Agen tidak bisa me-refund.
   */
  async function runAdvice(item: DetailItem) {
    const key = item.transactionCode || item.itemCode;
    setChecking(key);
    setAdviceMsg((m) => ({ ...m, [key]: { tone: "wait", text: "Menghubungi provider…" } }));
    let serverError = "";
    try {
      let res: Response;
      if (item.provider === "PDAM") {
        res = await fetch("/api/pembayaran/pdam/advice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idpel: item.customerId, transactionCode: item.transactionCode }),
        });
      } else {
        res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(code)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemCode: item.itemCode, action: "run_advice" }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        serverError = String(j.error || "");
      }
    } catch {
      serverError = "Koneksi terputus saat menghubungi server";
    }

    // Status sebenarnya dibaca ulang dari server, bukan ditebak dari respons advice
    const fresh = await load();
    const now = fresh?.items.find((x) => x.itemCode === item.itemCode);
    const max = fresh?.maxAdviceAttempts ?? 3;
    let msg: AdviceMsg;
    if (!now) {
      msg = { tone: "bad", text: serverError || "Gagal memuat status terbaru" };
    } else if (now.status === "SUCCESS") {
      msg = { tone: "ok", text: "Provider mengonfirmasi pembayaran LUNAS. Struk sudah bisa dikirim." };
    } else if (now.status === "FAILED") {
      msg = { tone: "bad", text: "Provider memastikan pembayaran GAGAL. Saldo yang ditahan dikembalikan ke loket." };
    } else if (now.status === "PENDING_REVIEW") {
      msg = { tone: "wait", text: "Batas pengecekan habis. Transaksi diteruskan ke supervisor/admin (Review Transaksi). Saldo tetap ditahan." };
    } else {
      msg = {
        tone: "wait",
        text: `Provider belum memberi kepastian (pengecekan ${now.adviceAttempts} dari ${max}). Coba lagi beberapa menit lagi.`,
      };
    }
    setAdviceMsg((m) => ({ ...m, [key]: msg }));
    setChecking(null);
  }

  useEffect(() => {
    if (code) load();
  }, [code, load]);

  const header = (
    <MobileHeader
      title="Detail transaksi"
      subtitle={code}
      backHref="/m/riwayat"
      right={
        <button
          type="button"
          onClick={() => load()}
          className="h-10 w-10 rounded-full flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
          aria-label="Muat ulang status"
        >
          <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}>refresh</span>
        </button>
      }
    />
  );

  if (!data) {
    return (
      <div>
        {header}
        <div className="p-6 text-center text-slate-500">
          {loading ? "Memuat…" : (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>
          )}
        </div>
      </div>
    );
  }

  const mp = data.multiPayment;
  const receipt = buildShareReceipt({
    loketName: mp.loketName || "",
    loketCode: mp.loketCode || "",
    // Nama petugas: pembuat transaksi, bukan yang membuka riwayat
    kasir: mp.username || user?.name || user?.username || "",
    paidAt: mp.paidAt || mp.createdAt,
    referenceCode: mp.multiPaymentCode,
    paidAmount: mp.paidAmount,
    items: data.items.map((i) => ({
      serviceType: i.serviceType,
      provider: i.provider,
      customerId: i.customerId,
      customerName: i.customerName,
      periodLabel: i.periodLabel,
      amount: i.amount,
      adminFee: i.adminFee,
      total: i.total,
      status: i.status,
      transactionCode: i.transactionCode,
      providerData: i.providerResponse,
      metadata: i.metadata,
    })),
  });
  const anyPending = data.items.some((i) => PENDING.includes(i.status));
  const anyReview = mp.status === "PENDING_REVIEW" || data.items.some((i) => i.status === "PENDING_REVIEW");
  const anyNotPaid = data.items.some((i) => i.status !== "SUCCESS");
  const maxAdvice = data.maxAdviceAttempts ?? 3;
  // PDAM multi-bulan berbagi satu No. Trx — tombol cukup sekali per transaksi
  const adviceButtonFor = new Set<string>();
  {
    const seen = new Set<string>();
    for (const i of data.items) {
      if (!canRunAdvice(i, maxAdvice) || !i.transactionCode || seen.has(i.transactionCode)) continue;
      seen.add(i.transactionCode);
      adviceButtonFor.add(i.itemCode);
    }
  }

  return (
    <div>
      {header}
      <div className="p-4 space-y-4 pb-8">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-2xl font-bold">{formatRp(mp.grandTotal)}</p>
            </div>
            <TxStatusBadge status={mp.status} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Waktu</dt>
            <dd className="text-right">
              {new Date(mp.paidAt || mp.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </dd>
            <dt className="text-slate-500">Loket</dt>
            <dd className="text-right truncate">{mp.loketName || mp.loketCode || "-"}</dd>
            <dt className="text-slate-500">Petugas</dt>
            <dd className="text-right truncate">{mp.username || "-"}</dd>
            {mp.paidAmount > mp.grandTotal && (
              <>
                <dt className="text-slate-500">Tunai / kembali</dt>
                <dd className="text-right">{formatRp(mp.paidAmount)} / {formatRp(mp.changeAmount)}</dd>
              </>
            )}
          </dl>
        </div>

        {(anyPending || anyReview) && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
            <span className="material-symbols-outlined">hourglass_top</span>
            <p>
              {anyReview
                ? "Transaksi sedang ditinjau supervisor/admin. "
                : "Menunggu konfirmasi provider. "}
              Saldo ditahan sampai ada kepastian dan kembali otomatis bila dipastikan gagal.
              <b> Jangan bayar ulang</b> tagihan yang sama.
              {adviceButtonFor.size > 0 && " Tekan \"Cek ke provider\" untuk menanyakan hasilnya."}
            </p>
          </div>
        )}

        {receipt && <TokenCards receipt={receipt} />}

        <ul className="rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {data.items.map((i) => {
            const v = serviceVisual(i.serviceType);
            const periode = i.provider === "PDAM" ? formatPeriode(i.periodLabel || "") : "";
            return (
              <li key={i.itemCode} className="p-4 flex items-start gap-3">
                <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${v.tone}`}>
                  <span className="material-symbols-outlined text-lg">{v.icon}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{i.customerName || i.customerId}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {serviceLabel(i.serviceType)} · {i.customerId}{periode ? ` · ${periode}` : ""}
                  </p>
                  {i.transactionCode && <p className="text-[11px] text-slate-400 truncate">No. Trx {i.transactionCode}</p>}
                  {i.status === "FAILED" && i.providerErrorMessage && (
                    <p className="text-xs text-red-600 mt-1">{i.providerErrorMessage}</p>
                  )}
                  {adviceButtonFor.has(i.itemCode) && (
                    <button
                      type="button"
                      disabled={checking !== null}
                      onClick={() => runAdvice(i)}
                      className="mt-2 h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-lg ${checking === (i.transactionCode || i.itemCode) ? "animate-spin" : ""}`}>
                        {checking === (i.transactionCode || i.itemCode) ? "progress_activity" : "sync"}
                      </span>
                      {checking === (i.transactionCode || i.itemCode) ? "Mengecek…" : "Cek ke provider"}
                    </button>
                  )}
                  {PENDING.includes(i.status) && i.adviceAttempts > 0 && !adviceMsg[i.transactionCode || i.itemCode] && (
                    <p className="text-[11px] text-slate-500 mt-1">Sudah dicek {i.adviceAttempts} dari {maxAdvice} kali</p>
                  )}
                  {(() => {
                    const k = i.transactionCode || i.itemCode;
                    const m = adviceMsg[k];
                    // Satu pesan per No. Trx (baris pertama saja)
                    if (!m || data.items.find((x) => (x.transactionCode || x.itemCode) === k)?.itemCode !== i.itemCode) return null;
                    const cls = m.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : m.tone === "bad" ? "text-red-600" : "text-amber-700 dark:text-amber-400";
                    return <p className={`text-xs mt-1 ${cls}`}>{m.text}</p>;
                  })()}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatRp(i.total)}</p>
                  {i.adminFee > 0 && <p className="text-[11px] text-slate-400">adm {formatRp(i.adminFee)}</p>}
                  <TxStatusBadge status={i.status} />
                </div>
              </li>
            );
          })}
        </ul>

        {receipt ? (
          <>
            <ReceiptShareCard receipt={receipt} askNumber title="Kirim ulang struk" />
            {anyNotPaid && (
              <p className="text-xs text-slate-500 text-center">Struk hanya memuat tagihan yang sudah lunas.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center">Struk tersedia setelah tagihan lunas.</p>
        )}
      </div>
    </div>
  );
}
