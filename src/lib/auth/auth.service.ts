import { connectToDatabase } from "@/lib/db";
import User, { type IUser } from "@/models/User";
import { hashPassword, verifyPassword, signTokenPair, hashToken, verifyToken } from "@/lib/auth";
import type { JwtPayload } from "@/lib/auth";

type AuthResult =
  | { ok: true; user: IUser; accessToken: string; refreshToken: string }
  | { ok: false; error: string; status: number };

export async function registerUser(data: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  await connectToDatabase();

  const existingUser = await User.findOne({
    $or: [{ email: data.email }, { username: data.username }],
  }).lean();

  if (existingUser) {
    const field =
      (existingUser as IUser).email === data.email ? "Email" : "Username";
    return { ok: false, error: `${field} is already taken`, status: 409 };
  }

  const hashedPassword = await hashPassword(data.password);

  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
  const assignedRole = adminEmails.includes(data.email.toLowerCase()) ? "admin" : "employee";

  const user = await User.create({
    username: data.username,
    email: data.email,
    password: hashedPassword,
    role: assignedRole,
  });

  const tokenPayload: Omit<JwtPayload, "type"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
    role: assignedRole,
  };

  const { accessToken, refreshToken } = await signTokenPair(tokenPayload);

  user.refreshTokenHash = await hashToken(refreshToken);
  await user.save();

  return { ok: true, user, accessToken, refreshToken };
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  await connectToDatabase();

  const user = await User.findOne({ email: data.email }).select(
    "+password +refreshTokenHash"
  );

  if (!user) {
    return { ok: false, error: "USER_NOT_FOUND", status: 401 };
  }

  const isValid = await verifyPassword(data.password, user.password);

  if (!isValid) {
    return { ok: false, error: "INVALID_PASSWORD", status: 401 };
  }

  const tokenPayload: Omit<JwtPayload, "type"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
  };

  const { accessToken, refreshToken } = await signTokenPair(tokenPayload);

  user.refreshTokenHash = await hashToken(refreshToken);
  await user.save();

  return { ok: true, user, accessToken, refreshToken };
}

export async function logoutUser(userId: string): Promise<void> {
  await connectToDatabase();
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

export function sanitizeUser(user: IUser) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function rotateRefreshToken(refreshToken: string): Promise<AuthResult> {
  console.log("rotateRefreshToken called");
  await connectToDatabase();
  
  const refreshResult = await verifyToken(refreshToken, "refresh");
  if (!refreshResult.ok) {
    console.log("rotateRefreshToken failed: Invalid refresh token");
    return { ok: false, error: "Invalid refresh token", status: 401 };
  }

  const { sub, email, username, role } = refreshResult.payload;
  
  const user = await User.findById(sub).select(
    "+refreshTokenHash +lastRefreshTokenHash +refreshTokenRotatedAt"
  );

  if (!user) {
    console.log("rotateRefreshToken failed: User not found");
    return { ok: false, error: "Session expired. Please log in again.", status: 401 };
  }

  const incomingHash = await hashToken(refreshToken);
  let isGracePeriod = false;

  if (incomingHash !== user.refreshTokenHash) {
    if (
      user.lastRefreshTokenHash &&
      incomingHash === user.lastRefreshTokenHash &&
      user.refreshTokenRotatedAt &&
      Date.now() - new Date(user.refreshTokenRotatedAt).getTime() < 60000
    ) {
      console.log("rotateRefreshToken: Grace period active");
      isGracePeriod = true;
    } else {
      console.log("rotateRefreshToken failed: Hash mismatch. Incoming:", incomingHash, "Current:", user.refreshTokenHash);
      await User.findByIdAndUpdate(sub, {
        refreshTokenHash: null,
        lastRefreshTokenHash: null,
        refreshTokenRotatedAt: null,
      });
      return { ok: false, error: "Session invalid. Please log in again.", status: 401 };
    }
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    await signTokenPair({ sub, email, username, role: user.role });

  if (!isGracePeriod) {
    user.lastRefreshTokenHash = incomingHash;
    user.refreshTokenRotatedAt = new Date();
  }
  user.refreshTokenHash = await hashToken(newRefreshToken);
  await user.save();

  console.log("rotateRefreshToken succeeded");
  return { ok: true, user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}