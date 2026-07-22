import {
  setAuthCookies,
  getRefreshToken,
  clearAuthCookies,
  rotateRefreshToken,
} from "@/lib/auth";
import { handleRoute, success, unauthorized } from "@/lib/api-response";

export async function POST() {
  return handleRoute(async () => {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return unauthorized("No refresh token found. Please log in again.");
    }

    const result = await rotateRefreshToken(refreshToken);

    if (!result.ok) {
      await clearAuthCookies();
      return unauthorized(result.error);
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