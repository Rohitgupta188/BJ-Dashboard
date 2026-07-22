/**
 * proxy.ts  —  Next.js 16 network boundary (formerly middleware.ts)
 * 
 * Edge authentication gateway.
 *
 * Responsibilities:
 * - Validate access token signature.
 * - Redirect unauthenticated users to /login.
 * - Prevent authenticated users from accessing /login.
 *
 * Non-responsibilities:
 * - Database access
 * - Role/permission checks
 * - Refresh token rotation
 *
 * These responsibilities belong to the route-level `withAuth` wrapper.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, errors as joseErrors } from "jose";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_COOKIE  = "access_token";
const REFRESH_COOKIE = "refresh_token";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/scan",  
];

const PUBLIC_PREFIXES = [
  "/scan/",
  "/_next/",
  "/favicon",
  "/images/",
  "/logo",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/scanner/",
  "/api/catalog/", 
  "/api/image-proxy",
  "/api/network-ip",
];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function isTokenValid(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret(), {
      issuer: process.env.JWT_ISSUER ?? "BJ-Dashboard",
    });
    return true;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return false;
    }
    return false; 
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" || pathname === "/register") {
      const accessToken  = request.cookies.get(ACCESS_COOKIE)?.value;
      const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

      if (accessToken && (await isTokenValid(accessToken))) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      if (refreshToken && (await isTokenValid(refreshToken))) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  const accessToken  = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (accessToken && (await isTokenValid(accessToken))) {
    return NextResponse.next();
  }
  if (refreshToken) {
    return NextResponse.next();
  }

  // 2d. No usable token → redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|map)).*)",
  ],
};
