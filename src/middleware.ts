import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Admin route protection.
 *
 * Every page and API route requires a valid, HMAC-signed session cookie before
 * any contact data is read. API routes get a 401; pages redirect to /login.
 * The session payload itself is verified here (Web Crypto only), so no
 * unauthenticated request ever reaches the application code.
 */

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/health"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") return true;
  // Static assets (public/).
  if (/\.[a-z0-9]+$/i.test(pathname.split("/").pop() ?? "")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;

  const session = secret ? await verifySessionToken(token, secret) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
