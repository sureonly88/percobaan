import type { MetadataRoute } from "next";

// Manifest PWA versi mobile (agen keliling). Dipasang dari browser HP lewat
// "Tambahkan ke Layar Utama"; aplikasi terbuka langsung di /m.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pedami Payment",
    short_name: "Pedami",
    description: "Loket pembayaran PDAM, PLN, BPJS, Telkom, dan pulsa untuk agen",
    id: "/m",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f8",
    theme_color: "#137fec",
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
