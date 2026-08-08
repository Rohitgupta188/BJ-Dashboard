/**
 * lib/drive/retry.ts
 *
 * Exponential backoff with jitter for Google Drive / Sheets API calls.
 *
 * Retry on:
 *   429              — Too Many Requests (quota / user rate limit)
 *   403 rateLimitExceeded / userRateLimitExceeded
 *                    — Google Drive returns 403 (not 429) for per-user rate limits.
 *                      Google docs explicitly say: use exponential backoff.
 *                      https://developers.google.com/workspace/drive/api/guides/handle-errors#403_rate_limit_exceeded
 *   500, 502, 503, 504 — Transient server errors.
 *
 * Formula: min((2^n × 1000) + random(0-1000)ms, MAX_DELAY_MS)
 * Quota/rate-limit errors: minimum 30s wait per Google's recommendation.
 */

const MAX_DELAY_MS    = 32_000;  // Google's recommended cap
const QUOTA_DELAY_MS  = 30_000;  // Google's minimum for quota 429s and 403 rate limits

function jitter(): number {
  return Math.floor(Math.random() * 1000);
}

/**
 * Extract the Drive API error reason from the response body.
 * Google returns 403 with reason = "rateLimitExceeded" | "userRateLimitExceeded"
 * for per-user rate limits — these MUST be retried with exponential backoff.
 */
function getDriveErrorReason(err: any): string {
  return err?.response?.data?.error?.errors?.[0]?.reason ?? "";
}

function isRetryable(err: any): boolean {
  const status = err?.code ?? err?.status ?? err?.response?.status ?? err?.response?.data?.error?.code;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  // 403 with a rate-limit reason is retryable — NOT a permission error.
  if (status === 403) {
    const reason = getDriveErrorReason(err);
    return reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  }
  return false;
}

function isQuotaError(err: any): boolean {
  const status = err?.code ?? err?.status ?? err?.response?.status;
  const message: string = err?.message ?? err?.response?.data?.error?.message ?? "";
  const reason = getDriveErrorReason(err);

  if (status === 429) {
    return (
      message.includes("quota") ||
      message.includes("rate limit") ||
      message.includes("userRateLimitExceeded")
    );
  }
  // 403 rateLimitExceeded — treat same as quota (30s minimum wait)
  if (status === 403) {
    return reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  }
  return false;
}

export async function withDriveRetry<T>(
  fn:      () => Promise<T>,
  label?:  string,
  retries: number = 5,
): Promise<T> {
  let n = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (!isRetryable(err) || n >= retries) throw err;

      const base  = isQuotaError(err) ? QUOTA_DELAY_MS : Math.min(Math.pow(2, n) * 1000, MAX_DELAY_MS);
      const delay = base + jitter();
      const tag   = label ? `[${label}] ` : "";
      console.warn(
        `${tag}Drive API error (${err?.code ?? err?.status ?? "?"}) — ` +
        `retry ${n + 1}/${retries} in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
      n++;
    }
  }
}
