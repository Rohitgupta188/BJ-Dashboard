export { signAccessToken, signTokenPair, hashToken, verifyToken } from "./jwt";
export type { JwtPayload, VerifyResult } from "./jwt";

export { hashPassword, verifyPassword } from "./password";

export {
  setAuthCookies,
  getAccessToken,
  getRefreshToken,
  clearAuthCookies,
} from "./cookies";

export { withAuth, getCurrentUser } from "./with-auth";
export type { AuthenticatedRequest } from "./with-auth";

export { registerUser, loginUser, logoutUser, sanitizeUser, rotateRefreshToken } from "./auth.service";
