import { NextRequest } from "next/server";
import { withAuth, hashPassword, verifyPassword, type AuthenticatedRequest } from "@/lib/auth";
import { handleRoute, success, error, unauthorized } from "@/lib/api-response";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export const POST = withAuth(async (req: NextRequest, ctx: AuthenticatedRequest) => {
  return handleRoute(async () => {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return error("Current and new passwords are required");
    }

    if (newPassword.length < 6) {
      return error("New password must be at least 6 characters long");
    }

    await connectToDatabase();
    
    // Fetch user and explicitly select the password field and sessions array
    const user = await User.findById(ctx.user.sub).select("+password +sessions");

    if (!user) {
      return unauthorized("User not found");
    }

    const isMatch = await verifyPassword(currentPassword, user.password);
    if (!isMatch) {
      return error("Incorrect current password");
    }

    user.password = await hashPassword(newPassword);
    
    // Revoke all other sessions to secure the account, but keep the current session active
    user.sessions = user.sessions.filter(s => s.sessionId === ctx.user.sid);

    await user.save();

    return success({ message: "Password updated successfully" });
  });
});
