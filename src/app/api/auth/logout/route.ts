import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { clearAuthCookies } from "@/lib/auth";
import { logoutUser } from "@/lib/auth/auth.service";
import { handleRoute, success } from "@/lib/api-response";

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  return handleRoute(async () => {
    await logoutUser(ctx.user.sub);
    await clearAuthCookies();
    return success({ message: "Logged out successfully" });
  });
});