import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/register", "/oauth/callback", "/forgot-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname === p || pathname.startsWith("/oauth"))) {
    return NextResponse.next();
  }

  // Check for access token cookie (optional if you set httpOnly cookie on login)
  // Since we use localStorage, middleware can only do cookie-based checks
  // For full protection, set a session cookie in addition to localStorage
  const sessionCookie = request.cookies.get("pm_session");

  if (pathname.startsWith("/dashboard") && !sessionCookie) {
    // return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};