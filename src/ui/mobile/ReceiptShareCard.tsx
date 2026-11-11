"use client";

import { useState } from "react";
import { type ShareReceipt, buildReceiptImage, buildReceiptText, toWaNumber } from "@/lib/mobile/receipt-share";

/** Kotak token PLN besar + tombol salin. */
export function TokenCards({ receipt }: { receipt: ShareReceipt }) {
  const [msg, setMsg] = useState("");
  const tokens = receipt.items.map((i) => i.token).filter(Boolean) as string[];
  if (tokens.length === 0) return null;
  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t.replace(/-/g, ""));
      setMsg("Token disalin");
    } catch {
      setMsg("Gagal menyalin token");
    }
  }
  return (
    <>
      {tokens.map((t) => (
        <div key={t} className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">TOKEN PLN</p>
          <p className="text-[1.15rem] font-mono font-bold tracking-wide mt-1 whitespace-nowrap">{t}</p>
          <button type="button" onClick={() => copy(t)} className="mt-2 text-sm text-primary font-semibold">Salin token</button>
          {msg && <p className="text-xs text-slate-500 mt-1">{msg}</p>}
        </div>
      ))}
    </>
  );
}

/**
 * Kirim struk: WhatsApp (teks), bagikan gambar (Web Share), atau unduh PNG.
 * `askNumber` menampilkan isian nomor WA (dipakai di Riwayat untuk kirim ulang).
 */
export function ReceiptShareCard({
  receipt,
  waNumber: initialWa = "",
  askNumber = false,
  title = "Kirim struk",
}: {
  receipt: ShareReceipt;
  waNumber?: string;
  askNumber?: boolean;
  title?: string;
}) {
  const [waNumber, setWaNumber] = useState(initialWa);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const waTarget = toWaNumber(waNumber);

  function sendWhatsApp() {
    const text = buildReceiptText(receipt);
    window.open(`https://wa.me/${waTarget}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function shareImage(download: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const blob = await buildReceiptImage(receipt);
      const fileName = `struk-${receipt.referenceCode}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (!download && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Struk pembayaran" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setMsg(download ? "Gambar struk disimpan ke unduhan" : "Browser tidak mendukung bagikan gambar — struk diunduh");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Gagal membuat gambar struk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 space-y-2">
      <p className="font-semibold">{title}</p>
      {askNumber && (
        <input
          inputMode="tel"
          value={waNumber}
          onChange={(e) => setWaNumber(e.target.value)}
          placeholder="No. WhatsApp pelanggan (opsional)"
          className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3"
        />
      )}
      <button type="button" onClick={sendWhatsApp} className="w-full h-12 rounded-xl bg-[#25D366] text-white font-semibold flex items-center justify-center gap-2">
        <span className="material-symbols-outlined">chat</span>
        {waTarget ? `WhatsApp ke ${waNumber}` : "Kirim lewat WhatsApp"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => shareImage(false)} className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 font-medium flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-xl">share</span> Bagikan
        </button>
        <button type="button" disabled={busy} onClick={() => shareImage(true)} className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 font-medium flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-xl">download</span> Unduh
        </button>
      </div>
      {msg && <p className="text-xs text-slate-500 text-center">{msg}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<string, [string, string]> = {
  SUCCESS: ["Lunas", "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"],
  PARTIAL_SUCCESS: ["Sebagian", "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"],
  PENDING: ["Diproses", "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"],
  PENDING_PROVIDER: ["Diproses", "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"],
  PENDING_ADVICE: ["Diproses", "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"],
  PENDING_REVIEW: ["Ditinjau", "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"],
  FAILED: ["Gagal", "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"],
};

export function TxStatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS_STYLE[status] || [status, "bg-slate-100 text-slate-600"];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}
