/**
 * types/user.ts — Authenticated user type
 *
 * Previously defined inline in src/app/page.tsx.
 * Matches the shape returned by /api/auth/me
 */

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: "admin" | "employee";
}
