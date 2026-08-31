import {
  setAuthCookies,
  getRefreshToken,
  clearAuthCookies,
  rotateRefreshToken,
} from "@/lib/auth";
import { NextRequest } from "next/server";
import { handleRoute, success, unauthorized } from "@/lib/api-response";
import { NextResponse } from "next/server";

import { checkRefreshRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return unauthorized("No refresh token found. Please log in again.");
    }

    const ip =
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "127.0.0.1";

    const isAllowed = await checkRefreshRateLimit(ip);
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", success: false },
        { status: 429 }
      );
    }

    const result = await rotateRefreshToken(refreshToken);

    if (!result.ok) {
      const isConcurrentRefresh = result.code === "CONCURRENT_REFRESH";
      if (!isConcurrentRefresh) {
        await clearAuthCookies();
      }
      return NextResponse.json(
        { error: result.error, code: result.code, success: false },
        { status: result.status }
      );
    }

    await setAuthCookies(result.accessToken, result.refreshToken);

    return success({
      message: "Session refreshed successfully",
      user: {
        id: result.user._id.toString(),
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
      },
    });
  });
}