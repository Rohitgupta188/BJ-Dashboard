import { NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  type JwtPayload,
} from "./jwt";
import { getAccessToken, getRefreshToken, setAuthCookies } from "./cookies";
import { rotateRefreshToken } from "./auth.service";

export type AuthenticatedRequest = {
  user: JwtPayload;
};

export type AuthOptions = {
  requireRole?: "admin" | "employee";
};

type RouteHandler<T = Record<string, unknown>> = (
  req: NextRequest,
  context: AuthenticatedRequest & T
) => Promise<NextResponse>;

export function withAuth<T = Record<string, unknown>>(
  handler: RouteHandler<T>,
  options?: AuthOptions
) {
  return async (req: NextRequest, context: T) => {
    const accessToken = await getAccessToken();
    const result = accessToken ? await verifyToken(accessToken, "access") : null;

    if (result?.ok) {
      if (options?.requireRole && result.payload.role !== options.requireRole) {
        return NextResponse.json(
          { error: "Forbidden: Insufficient permissions" },
          { status: 403 }
        );
      }
      return handler(req, { ...context, user: result.payload });
    }

    const shouldRefresh = !accessToken || (result && !result.ok);
    if (shouldRefresh) {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        return NextResponse.json(
          { error: "Session expired. Please log in again." },
          { status: 401 }
        );
      }

      const result = await rotateRefreshToken(refreshToken);

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      if (options?.requireRole && result.user.role !== options.requireRole) {
        return NextResponse.json(
          { error: "Forbidden: Insufficient permissions" },
          { status: 403 }
        );
      }

      const response = await handler(req, {
        ...context,
        user: { 
          sub: result.user._id.toString(), 
          email: result.user.email, 
          username: result.user.username, 
          role: result.user.role, 
          type: "access" 
        },
      });

      await setAuthCookies(result.accessToken, result.refreshToken, response);

      return response;


    }

    return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  };
}

export async function getCurrentUser(): Promise<JwtPayload | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const result = await verifyToken(accessToken, "access");
  return result.ok ? result.payload : null;
}