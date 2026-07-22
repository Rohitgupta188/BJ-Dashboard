import { cookies } from "next/headers";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function baseCookieOptions(maxAgeSeconds: number) {
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
  refreshToken: string
) {
  const cookieStore = await cookies();

  cookieStore.set(
    ACCESS_COOKIE,
    accessToken,
    baseCookieOptions(15 * 60) // 15 min
  );
  cookieStore.set(
    REFRESH_COOKIE,
    refreshToken,
    baseCookieOptions(7 * 24 * 60 * 60) // 7 days
  );
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_COOKIE)?.value;
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}