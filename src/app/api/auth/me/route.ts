import { NextRequest } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/auth";
import { handleRoute, success } from "@/lib/api-response";
import { sanitizeUser } from "@/lib/auth/auth.service";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export const GET = withAuth(async (_req: NextRequest, ctx: AuthenticatedRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const user = await User.findById(ctx.user.sub).lean();

    if (!user) {
      const { unauthorized } = await import("@/lib/api-response");
      return unauthorized("User not found");
    }

    return success({
      user: sanitizeUser(user as any),
    });
  });
});
