// Klien multipay untuk versi mobile — sama dengan streamMultipay di /pembayaran desktop,
// tetapi membedakan "server menjawab" vs "koneksi putus" agar idempotencyKey bisa
// dipakai ulang saat mencoba lagi (server akan mengembalikan hasil lama, bukan bayar dua kali).
import type { MultiPaymentProgressEvent, MultiPaymentResponse, UnifiedPaymentItemInput } from "@/lib/multipay/types";

export type MultipayOutcome =
  | { kind: "done"; response: MultiPaymentResponse }
  /** Server menolak sebelum memproses (HTTP 4xx/5xx dengan pesan). Aman membuat key baru. */
  | { kind: "rejected"; status: number; error: string; errorCode?: string }
  /** Koneksi putus / stream terpotong — status di provider TIDAK diketahui. Pakai key yang sama. */
  | { kind: "unknown"; error: string };

export interface MultipayBody {
  idempotencyKey: string;
  loketCode: string;
  loketName: string;
  paidAmount: number;
  items: UnifiedPaymentItemInput[];
}

export async function streamMultipay(
  body: MultipayBody,
  onEvent: (event: MultiPaymentProgressEvent) => void,
): Promise<MultipayOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/pembayaran/multipay?stream=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "unknown", error: "Koneksi terputus saat mengirim pembayaran" };
  }

  if (!res.ok || !res.body) {
    let error = `HTTP ${res.status}`;
    let errorCode: string | undefined;
    try {
      const j = await res.json();
      if (j?.error) error = String(j.error);
      if (j?.errorCode) errorCode = String(j.errorCode);
    } catch {
      /* abaikan */
    }
    // 409 = key yang sama sedang diproses; 502/503/504 dari proxy = permintaan mungkin sudah
    // sampai ke server. Keduanya bukan penolakan pasti → jangan buat key baru.
    if (res.status === 409 || (res.status >= 502 && res.status <= 504)) return { kind: "unknown", error };
    return { kind: "rejected", status: res.status, error, errorCode };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: MultiPaymentResponse | null = null;
  let errorMessage: string | null = null;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        try {
          const event = JSON.parse(data) as MultiPaymentProgressEvent;
          if (event.type === "done") finalResponse = event.response;
          else if (event.type === "error") errorMessage = event.message;
          onEvent(event);
        } catch {
          /* satu event rusak — lewati */
        }
      }
    }
  } catch {
    if (!finalResponse) return { kind: "unknown", error: "Koneksi terputus saat menunggu hasil pembayaran" };
  }

  if (finalResponse) return { kind: "done", response: finalResponse };
  if (errorMessage) return { kind: "unknown", error: errorMessage };
  return { kind: "unknown", error: "Hasil pembayaran belum diterima" };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `m-${crypto.randomUUID()}`;
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
