import { connectToDatabase } from "@/lib/db";
import User, { type IUser } from "@/models/User";
import { hashPassword, verifyPassword, signTokenPair, hashToken } from "@/lib/auth";
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

  const user = await User.create({
    username: data.username,
    email: data.email,
    password: hashedPassword,
  });

  const tokenPayload: Omit<JwtPayload, "type"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
  };

  const { accessToken, refreshToken } = await signTokenPair(tokenPayload);

  // Persist only the hash — raw token is never stored
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
    return { ok: false, error: "Invalid email or password", status: 401 };
  }

  const isValid = await verifyPassword(data.password, user.password);

  if (!isValid) {
    return { ok: false, error: "Invalid email or password", status: 401 };
  }

  const tokenPayload: Omit<JwtPayload, "type"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
  };

  const { accessToken, refreshToken } = await signTokenPair(tokenPayload);

  // Rotate: replace old hash with new one
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}