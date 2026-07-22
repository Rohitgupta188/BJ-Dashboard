import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedis = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export const loginRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "@upstash/ratelimit/login",
    })
  : null;

export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  if (!loginRateLimiter) return true;

  try {
    const { success } = await loginRateLimiter.limit(ip);
    return success;
  } catch (err) {
    console.warn("Rate limit check failed, allowing request. Error:", err);
    return true; 
  }
}
