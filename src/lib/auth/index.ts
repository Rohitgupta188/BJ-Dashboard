export { signAccessToken, signTokenPair, hashToken, verifyToken } from "./jwt";
export type { JwtPayload, VerifyResult } from "./jwt";

export { hashPassword, verifyPassword } from "./password";

export {
  setAuthCookies,
  getAccessToken,
  getRefreshToken,
  clearAuthCookies,
} from "./cookies";

export { withAuth, getCurrentUser } from "./middleware";
export type { AuthenticatedRequest } from "./middleware";

export { registerUser, loginUser, logoutUser, sanitizeUser } from "./auth.service";
