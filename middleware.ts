import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPage } from "@/lib/rbac";

// Public paths that don't require authentication (e.g. Midtrans redirect pages)
const PUBLIC_PATHS = ["/topup/finish", "/topup/unfinish", "/topup/error"];

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;

    // Allow public paths through without auth
    if (PUBLIC_PATHS.some(p => path.startsWith(p))) return NextResponse.next();

    // Skip API routes, static assets - they handle their own auth
    if (path.startsWith("/api/")) return NextResponse.next();

    const token = req.nextauth.token;
    const role = (token?.role as string) || "kasir";

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
        if (PUBLIC_PATHS.some(p => path.startsWith(p))) return true;
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
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
