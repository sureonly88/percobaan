"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 2 * 60_000;
const MIN_GAP_MS = 60_000;

/**
 * Laporkan "terakhir aktif" (Pantau Agen) selama tab terlihat: saat dibuka, saat pindah
 * halaman, dan tiap 2 menit. Paling sering sekali per menit; berhenti saat tab di latar.
 */
export function usePresence(enabled: boolean, pathname: string) {
  const lastSent = useRef(0);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!enabled) return;
    const send = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSent.current < MIN_GAP_MS) return;
      lastSent.current = now;
      const path = pathRef.current;
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: path === "/m" || path.startsWith("/m/") ? "mobile" : "web", path }),
        keepalive: true,
      }).catch(() => {});
    };
    send();
    const timer = setInterval(send, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [enabled, pathname]);
}
