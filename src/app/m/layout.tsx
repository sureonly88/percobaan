import type { Metadata, Viewport } from "next";
import { MobileShell } from "@/ui/mobile/MobileShell";

export const metadata: Metadata = {
  title: "Pedami Payment",
  description: "Loket pembayaran untuk agen keliling",
  appleWebApp: { capable: true, title: "Pedami", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#137fec",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
