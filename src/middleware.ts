import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPage } from "@/lib/rbac";

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  "/topup/finish", "/topup/unfinish", "/topup/error", "/register",
  "/i", "/invoice", "/r", "/cek-tagihan",
];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

// Versi mobile (PWA agen keliling) ada di /m. HP yang membuka "/" diarahkan ke sana,
// kecuali pengguna memilih "Versi desktop" (cookie prefer_desktop=1).
const MOBILE_UA = /Android|iPhone|iPod|Mobile|Opera Mini|IEMobile/i;

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;

    // Allow public paths through without auth
    if (isPublicPath(path)) return NextResponse.next();

    // Skip API routes, static assets - they handle their own auth
    if (path.startsWith("/api/")) return NextResponse.next();

    const token = req.nextauth.token;
    const role = (token?.role as string) || "kasir";

    if (
      path === "/" &&
      MOBILE_UA.test(req.headers.get("user-agent") || "") &&
      req.cookies.get("prefer_desktop")?.value !== "1" &&
      canAccessPage(role, "/m")
    ) {
      return NextResponse.redirect(new URL("/m", req.url));
    }

    if (!canAccessPage(role, path)) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ req, token }) {
        const path = req.nextUrl.pathname;
        // Allow public paths without a session token
        if (isPublicPath(path)) return true;
        if (path.startsWith("/api/auth/register")) return true;
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    // sw.js, manifest, ikon, halaman offline PWA, dan gambar statis di /public (mis. ilustrasi
    // halaman login) harus bisa diambil tanpa login
    "/((?!login|register|api/auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
