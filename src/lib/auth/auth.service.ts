import { connectToDatabase } from "@/lib/db";
import User, { type IUser } from "@/models/User";
import { hashPassword, verifyPassword, signTokenPair, hashToken, verifyToken,clearAuthCookies } from "@/lib/auth";
import type { JwtPayload } from "@/lib/auth";


type AuthResult =
  | { ok: true; user: IUser; accessToken: string; refreshToken: string; sid: string }
  | { ok: false; error: string; status: number };

const MAX_SESSIONS = 5;

function manageSessionsLimit(user: IUser) {
  if (user.sessions.length > MAX_SESSIONS) {
    user.sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    user.sessions = user.sessions.slice(-MAX_SESSIONS);
  }
}

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
    const field = (existingUser as IUser).email === data.email ? "Email" : "Username";
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
    sessions: [],
  });

  const tokenPayload: Omit<JwtPayload, "type" | "sid"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
    role: assignedRole,
  };

  const { accessToken, refreshToken, sid } = await signTokenPair(tokenPayload);

  user.sessions.push({
    sessionId: sid,
    refreshTokenHash: await hashToken(refreshToken),
    lastRefreshTokenHash: null,
    refreshTokenRotatedAt: null,
    createdAt: new Date(),
  });

  await user.save();

  return { ok: true, user, accessToken, refreshToken, sid };
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  await connectToDatabase();

  const user = await User.findOne({ email: data.email }).select("+password +sessions");

  if (!user) {
    return { ok: false, error: "USER_NOT_FOUND", status: 401 };
  }

  const isValid = await verifyPassword(data.password, user.password);

  if (!isValid) {
    return { ok: false, error: "INVALID_PASSWORD", status: 401 };
  }

  const tokenPayload: Omit<JwtPayload, "type" | "sid"> = {
    sub: user._id.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
  };

  const { accessToken, refreshToken, sid } = await signTokenPair(tokenPayload);

  if (!user.sessions) user.sessions = [];
  
  user.sessions.push({
    sessionId: sid,
    refreshTokenHash: await hashToken(refreshToken),
    lastRefreshTokenHash: null,
    refreshTokenRotatedAt: null,
    createdAt: new Date(),
  });

  manageSessionsLimit(user);
  user.markModified("sessions");
  await user.save();

  return { ok: true, user, accessToken, refreshToken, sid };
}

export async function logoutUser(userId: string, sid?: string): Promise<void> {
  await connectToDatabase();
  
  if (sid) {
    await User.findByIdAndUpdate(userId, {
      $pull: { sessions: { sessionId: sid } }
    });
  } else {
    // Logout from all devices
    await User.findByIdAndUpdate(userId, { sessions: [] });
  }
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
    await clearAuthCookies();
    return { ok: false, error: "Invalid refresh token", status: 401 };
  }

  const { sub, email, username, role, sid } = refreshResult.payload;
  
  if (!sid) {
    console.log("rotateRefreshToken failed: No session ID in token");
    await clearAuthCookies();
    return { ok: false, error: "Session invalid", status: 401 };
  }

  const user = await User.findById(sub).select("+sessions");

  if (!user || !user.sessions) {
    console.log("rotateRefreshToken failed: User not found");
    await clearAuthCookies();
    return { ok: false, error: "Session expired. Please log in again.", status: 401 };
  }

  const session = user.sessions.find(s => s.sessionId === sid);
  
  if (!session) {
    console.log("rotateRefreshToken failed: Session not found (already revoked)");
    await clearAuthCookies();
    return { ok: false, error: "Session expired. Please log in again.", status: 401 };
  }

  const incomingHash = await hashToken(refreshToken);
  let isGracePeriod = false;

  if (incomingHash !== session.refreshTokenHash) {
    if (
      session.lastRefreshTokenHash &&
      incomingHash === session.lastRefreshTokenHash &&
      session.refreshTokenRotatedAt &&
      Date.now() - new Date(session.refreshTokenRotatedAt).getTime() < 60000
    ) {
      console.log("rotateRefreshToken: Grace period active for session", sid);
      isGracePeriod = true;
    } else {
      console.log("rotateRefreshToken failed: Hash mismatch for session", sid);
      // Token theft detected on this specific session. Revoke it.
      user.sessions = user.sessions.filter(s => s.sessionId !== sid);
      await user.save();
      await clearAuthCookies();
      return { ok: false, error: "Session invalid. Please log in again.", status: 401 };
    }
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    await signTokenPair({ sub, email, username, role: user.role, sid });

  if (!isGracePeriod) {
    session.lastRefreshTokenHash = incomingHash;
    session.refreshTokenRotatedAt = new Date();
  }
  
  session.refreshTokenHash = await hashToken(newRefreshToken);
  
  // Mark the sessions array as modified so mongoose saves the nested changes
  user.markModified('sessions');
  await user.save();

  console.log("rotateRefreshToken succeeded for session", sid);
  return { ok: true, user, accessToken: newAccessToken, refreshToken: newRefreshToken, sid };
}