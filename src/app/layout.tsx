import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/ui/AuthProvider";
import { AppShell } from "@/ui/AppShell";
import { ThemeProvider } from "@/ui/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";

export const metadata: Metadata = {
  title: "Pedami Payment - Dashboard Pembayaran Tagihan",
  description: "Kelola tagihan PDAM dan PLN di satu tempat",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex font-display">
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
