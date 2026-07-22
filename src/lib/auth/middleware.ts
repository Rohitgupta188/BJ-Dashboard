import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import {
  verifyToken,
  signAccessToken,
  signTokenPair,
  hashToken,
  type JwtPayload,
} from "./jwt";
import { getAccessToken, getRefreshToken, setAuthCookies } from "./cookies";

export type AuthenticatedRequest = {
  user: JwtPayload;
};

type RouteHandler<T = Record<string, unknown>> = (
  req: NextRequest,
  context: AuthenticatedRequest & T
) => Promise<NextResponse>;

export function withAuth<T = Record<string, unknown>>(
  handler: RouteHandler<T>
) {
  return async (req: NextRequest, context: T) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const result = await verifyToken(accessToken, "access");

    if (result.ok) {
      return handler(req, { ...context, user: result.payload });
    }

    // Refresh flow — only attempt when the access token is expired
    if (result.error === "expired") {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        return NextResponse.json(
          { error: "Session expired. Please log in again." },
          { status: 401 }
        );
      }

      const refreshResult = await verifyToken(refreshToken, "refresh");

      if (!refreshResult.ok) {
        return NextResponse.json(
          { error: "Session expired. Please log in again." },
          { status: 401 }
        );
      }

      const { sub, email, username } = refreshResult.payload;

      // Validate token against the stored hash — prevents stolen-token replay
      await connectToDatabase();
      const user = await User.findById(sub).select("+refreshTokenHash");

      if (!user?.refreshTokenHash) {
        return NextResponse.json(
          { error: "Session expired. Please log in again." },
          { status: 401 }
        );
      }

      const incomingHash = await hashToken(refreshToken);
      if (incomingHash !== user.refreshTokenHash) {
        // Token mismatch — possible theft; invalidate all sessions
        await User.findByIdAndUpdate(sub, { refreshTokenHash: null });
        return NextResponse.json(
          { error: "Session invalid. Please log in again." },
          { status: 401 }
        );
      }

      // Issue a fully rotated token pair
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        await signTokenPair({ sub, email, username });

      user.refreshTokenHash = await hashToken(newRefreshToken);
      await user.save();

      await setAuthCookies(newAccessToken, newRefreshToken);

      return handler(req, {
        ...context,
        user: { ...refreshResult.payload, type: "access" },
      });
    }

    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  };
}

export async function getCurrentUser(): Promise<JwtPayload | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const result = await verifyToken(accessToken, "access");
  return result.ok ? result.payload : null;
}