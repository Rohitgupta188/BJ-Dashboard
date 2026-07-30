import { NextRequest } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/auth";
import { handleRoute, success, error, unauthorized } from "@/lib/api-response";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

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
    
    // Fetch user and explicitly select the password field
    const user = await User.findById(ctx.user.sub).select("+password");

    if (!user) {
      return unauthorized("User not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return error("Incorrect current password");
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return success({ message: "Password updated successfully" });
  });
});
