"use client";

/**
 * hooks/useAuthRedirect.ts — Session guard hook
 *
 * Responsibility: Redirect the user to /login when a SESSION_EXPIRED
 * ApiError is caught, or when the /api/auth/me check fails on mount.
 *
 * Architecture:
 *   Component
 *     ↓
 *   api.get() → throws ApiError("SESSION_EXPIRED")
 *     ↓
 *   useAuthRedirect() catches it → router.replace("/login?next=<path>")
 *
 * NOTE: This hook does NOT trigger on 401 from expected-401 endpoints
 * (e.g. login with wrong password). The distinction is:
 *   - Protected API routes always return SESSION_EXPIRED code from api-client
 *   - Login endpoint uses 400/401 for bad credentials — callers handle those locally
 *
 * This hook also performs the initial auth check on mount (replaces the
 * inline fetch('/api/auth/me') + window.fetch monkey-patch in page.tsx).
 */

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import type { UserInfo } from "@/types";

interface UseAuthRedirectOptions {
  /**
   * Called when session is confirmed valid.
   * Receives the authenticated user's info.
   */
  onAuthenticated: (user: UserInfo) => void;
  /**
   * Called when the auth check finishes (pass or fail).
   * Use to stop a loading spinner.
   */
  onSettled: () => void;
}

/**
 * Performs the initial session check on mount and redirects to /login
 * if the session is expired or invalid.
 *
 * @example
 * useAuthRedirect({
 *   onAuthenticated: (user) => setUser(user),
 *   onSettled: () => setIsLoadingAuth(false),
 * });
 */
export function useAuthRedirect({ onAuthenticated, onSettled }: UseAuthRedirectOptions): void {
  const router = useRouter();

  const redirectToLogin = useCallback(() => {
    // Preserve the current path so the user returns after login
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    router.replace(`/login?next=${next}`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        // Direct fetch for auth/me — avoids circular dependency with api-client
        // api-client would throw SESSION_EXPIRED which would call this hook again
        const res = await fetch("/api/auth/me", { credentials: "include" });

        if (cancelled) return;

        if (!res.ok) {
          redirectToLogin();
          return;
        }

        const json = await res.json();

        if (!json.success || !json.data?.user) {
          redirectToLogin();
          return;
        }

        onAuthenticated(json.data.user as UserInfo);
      } catch {
        if (!cancelled) redirectToLogin();
      } finally {
        if (!cancelled) onSettled();
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [redirectToLogin, onAuthenticated, onSettled]);
}

/**
 * Standalone utility: call this in a catch block when using api-client
 * to redirect on session expiry without triggering a full re-mount.
 *
 * @example
 * try {
 *   const data = await api.get<Product[]>("/api/catalog");
 * } catch (err) {
 *   if (isSessionExpired(err)) { router.replace("/login"); return; }
 *   setError("Failed to load products");
 * }
 */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SESSION_EXPIRED";
}
