import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPage } from "@/lib/rbac";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = (token?.role as string) || "kasir";
    const path = req.nextUrl.pathname;

    // Skip API routes, static assets - they handle their own auth
    if (path.startsWith("/api/")) return NextResponse.next();

    if (!canAccessPage(role, path)) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
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
