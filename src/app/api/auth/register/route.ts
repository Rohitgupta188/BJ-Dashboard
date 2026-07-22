import { NextRequest, NextResponse } from "next/server";
import { userRegistrationApiSchema } from "@/lib/validation";
import { setAuthCookies } from "@/lib/auth";
import { registerUser, sanitizeUser } from "@/lib/auth/auth.service";
import { handleRoute, created, conflict, validationError } from "@/lib/api-response";
import { checkLoginRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ip =
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "127.0.0.1";
    const isAllowed = await checkLoginRateLimit(ip);

    if (!isAllowed) {
      return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429 });
    }
    const body = await req.json();

    const parsed = userRegistrationApiSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const result = await registerUser(parsed.data);

    if (!result.ok) {
      return conflict(result.error);
    }

    await setAuthCookies(result.accessToken, result.refreshToken);

    return created({
      message: "Account created successfully",
      user: sanitizeUser(result.user),
    });
  });
}