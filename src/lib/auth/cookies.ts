import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function baseCookieOptions(maxAgeSeconds: number) {
  return {
    maxAge: maxAgeSeconds,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  res?: NextResponse
) {
  if (res) {
    res.cookies.set(
      ACCESS_COOKIE,
      accessToken,
      baseCookieOptions(30 * 60) // 30 min
    );
    res.cookies.set(
      REFRESH_COOKIE,
      refreshToken,
      baseCookieOptions(7 * 24 * 60 * 60) // 7 days
    );
  } else {
    const cookieStore = await cookies();
    cookieStore.set(
      ACCESS_COOKIE,
      accessToken,
      baseCookieOptions(30 * 60) // 30 min
    );
    cookieStore.set(
      REFRESH_COOKIE,
      refreshToken,
      baseCookieOptions(7 * 24 * 60 * 60) // 7 days
    );
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_COOKIE)?.value;
}

export async function clearAuthCookies(res?: NextResponse) {
  if (res) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  } else {
    const cookieStore = await cookies();
    cookieStore.delete(ACCESS_COOKIE);
    cookieStore.delete(REFRESH_COOKIE);
  }
}