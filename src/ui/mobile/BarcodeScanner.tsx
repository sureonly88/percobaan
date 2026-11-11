"use client";

import { useEffect, useRef, useState } from "react";

// BarcodeDetector tersedia di Chrome Android; di browser lain tombol scan disembunyikan.
type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

export function isBarcodeScanSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Layar penuh kamera untuk memindai barcode/QR di lembar tagihan. Hanya angka/huruf yang diambil. */
export function BarcodeScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["code_128", "code_39", "ean_13", "itf", "qr_code", "pdf417"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue?.replace(/[^a-zA-Z0-9]/g, "");
            if (raw) {
              navigator.vibrate?.(60);
              onResult(raw);
              return;
            }
          } catch {
            /* frame belum siap */
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Kamera tidak bisa dibuka. Izinkan akses kamera di pengaturan browser.");
      }
    }
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <p className="font-semibold">Pindai barcode tagihan</p>
        <button type="button" onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10" aria-label="Tutup">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-40 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <p className="text-center text-white/80 text-sm px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error || "Arahkan kamera ke barcode atau QR pada lembar tagihan"}
      </p>
    </div>
  );
}
