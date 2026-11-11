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
  providerResponse: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface Detail {
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

export default function MobileRiwayatDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(String(params?.code || ""));
  const { data: session } = useSession();
  const user = session?.user as { name?: string | null; username?: string } | undefined;

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Server mengembalikan 404 bila transaksi milik loket lain (untuk kasir)
      const res = await fetch(`/api/pembayaran/multipay/${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Transaksi tidak ditemukan");
        return;
      }
      setData(json);
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setLoading(false);
    }
  }, [code]);

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
          onClick={load}
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
  const anyReview = mp.status === "PENDING_REVIEW";
  const anyNotPaid = data.items.some((i) => i.status !== "SUCCESS");

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
              <b> Jangan bayar ulang</b> tagihan yang sama. Tekan ikon muat ulang untuk cek status terbaru.
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
