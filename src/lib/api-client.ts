/**
 * lib/api-client.ts — Production-grade networking layer
 *
 * Responsibilities (ONLY):
 * - Make HTTP requests with credentials (cookies)
 * - Parse responses safely (handles JSON, binary, 204, plain-text)
 * - Throw typed ApiError on non-2xx responses
 * - Apply request timeout via AbortSignal.timeout()
 * - Globally redirect to /login on 401 SESSION_EXPIRED (browser only)
 * - Log requests in development
 *
 * Non-responsibilities:
 * - No React hooks
 * - No toast / UI
 * - No token refresh (the server withAuth handles rotation)
 * - No download DOM manipulation (see utils/download.ts)
 */

/* ═══════════════════════════════════════════════════════════════════
   ERROR CODES
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Typed error codes — no magic strings anywhere in the codebase.
 * Components and hooks switch on these to decide how to respond.
 */
export type ApiErrorCode =
  | "SESSION_EXPIRED"   // 401 — server rejected session, redirect to login
  | "FORBIDDEN"         // 403 — authenticated but lacks permission
  | "NOT_FOUND"         // 404
  | "VALIDATION_ERROR"  // 422 — Zod / input validation failure
  | "REQUEST_TIMEOUT"   // AbortError from AbortSignal.timeout()
  | "NETWORK_ERROR"     // fetch() itself threw (offline, DNS, etc.)
  | "SERVER_ERROR"      // 500+
  | "UNKNOWN_ERROR";    // catch-all

/* ═══════════════════════════════════════════════════════════════════
   ApiError CLASS
   ═══════════════════════════════════════════════════════════════════ */

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details ?? null;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RESPONSE TYPES
   ═══════════════════════════════════════════════════════════════════ */

/** Shape every backend route returns via lib/api-response.ts */
interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

/* ═══════════════════════════════════════════════════════════════════
   REQUEST OPTIONS
   ═══════════════════════════════════════════════════════════════════ */

export interface ApiRequestOptions extends Omit<RequestInit, "signal"> {
  /**
   * Request timeout in milliseconds.
   * Defaults to 30_000 (30 s). Pass 0 to disable.
   */
  timeout?: number;
  /**
   * Optional external AbortSignal (e.g. from useEffect cleanup).
   * Will be combined with the timeout signal.
   */
  signal?: AbortSignal;
}

/* ═══════════════════════════════════════════════════════════════════
   DEV LOGGER
   ═══════════════════════════════════════════════════════════════════ */

function devLog(method: string, url: string, durationMs: number, status: number) {
  if (process.env.NODE_ENV !== "development") return;
  const color = status >= 400 ? "\x1b[31m" : "\x1b[32m"; // red / green
  const reset = "\x1b[0m";
  console.debug(
    `${color}[api-client]${reset} ${method.toUpperCase()} ${url} → ${status} (${durationMs}ms)`
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HTTP STATUS → ERROR CODE MAPPING
   ═══════════════════════════════════════════════════════════════════ */

function resolveErrorCode(status: number, bodyError?: string): ApiErrorCode {
  if (status === 401) {
    const lower = (bodyError ?? "").toLowerCase();
    const isSessionError =
      lower.includes("session") ||
      lower.includes("expired") ||
      lower.includes("log in") ||
      lower.includes("token") ||
      lower.includes("user not found") ||
      lower.includes("invalid or missing");
    return isSessionError ? "SESSION_EXPIRED" : "UNKNOWN_ERROR";
  }
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  if (status >= 500)  return "SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

/* ═══════════════════════════════════════════════════════════════════
   CORE FETCH FUNCTION
   ═══════════════════════════════════════════════════════════════════ */

async function apiFetch<T = unknown>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { timeout = 30_000, signal: externalSignal, body, ...rest } = options;

  // ── Build signal (timeout + optional external abort) ─────────────
  let signal: AbortSignal | undefined;
  if (timeout > 0) {
    const timeoutSignal = AbortSignal.timeout(timeout);
    signal = externalSignal
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : timeoutSignal;
  } else {
    signal = externalSignal;
  }

  // ── Build headers ─────────────────────────────────────────────────
  const headers = new Headers(rest.headers);

  // Only set Content-Type for JSON bodies — remove it for FormData
  // (browser sets multipart boundary automatically for FormData)
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    credentials: "include", // always send httpOnly cookies
    ...rest,
    headers,
    body,
    signal,
  };

  const start = performance.now();
  let response: Response;

  // ── Make request ──────────────────────────────────────────────────
  try {
    response = await fetch(url, config);
  } catch (err) {
    // AbortError from AbortSignal.timeout() has name "TimeoutError" in modern browsers
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new ApiError("REQUEST_TIMEOUT", 408, `Request timed out after ${timeout}ms`);
    }
    throw new ApiError("NETWORK_ERROR", 0, "Network request failed. Check your connection.", err);
  }

  const durationMs = Math.round(performance.now() - start);
  devLog(rest.method ?? "GET", url, durationMs, response.status);

  // ── 204 No Content ────────────────────────────────────────────────
  if (response.status === 204) {
    return undefined as T;
  }

  // ── Inspect content type ──────────────────────────────────────────
  const contentType = response.headers.get("content-type") ?? "";

  // Binary blob — return as Blob without JSON parsing.
  // Covers: PDF, images, Excel (.xlsx), generic binary streams.
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("spreadsheetml") ||      // .xlsx exports
    contentType.includes("ms-excel") ||            // .xls (legacy)
    contentType.startsWith("image/")
  ) {
    if (!response.ok) {
      throw new ApiError(
        resolveErrorCode(response.status),
        response.status,
        `Binary response failed with status ${response.status}`
      );
    }
    return response.blob() as unknown as T;
  }

  // ── Safe JSON parse ───────────────────────────────────────────────
  let json: ApiEnvelope<T> | null = null;
  if (contentType.includes("application/json")) {
    try {
      json = (await response.json()) as ApiEnvelope<T>;
    } catch {
      // JSON parse failed — treat as server error
      throw new ApiError(
        "SERVER_ERROR",
        response.status,
        `Server returned unparseable JSON (status ${response.status})`
      );
    }
  }

  // ── Handle error responses ────────────────────────────────────────
  if (!response.ok) {
    const message = json?.error ?? `HTTP ${response.status}`;
    const code = resolveErrorCode(response.status, message);

    // Globally handle session expiration in the browser — redirect to login
    if (code === "SESSION_EXPIRED" && typeof window !== "undefined") {
      window.location.replace("/login");
      // Return a never-resolving promise so the calling component doesn't
      // render an error state while the browser is navigating away.
      return new Promise(() => {}) as Promise<T>;
    }

    throw new ApiError(code, response.status, message, json?.details);
  }

  // ── Success — return data payload ─────────────────────────────────
  // If the response follows our ApiEnvelope shape, unwrap .data
  if (json !== null) {
    return (json.data ?? json) as T;
  }

  // Plain text or no body
  return undefined as T;
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API SURFACE
   ═══════════════════════════════════════════════════════════════════ */

export const api = {
  /**
   * GET request.
   * @example const products = await api.get<Product[]>('/api/catalog');
   */
  get<T = unknown>(url: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiFetch<T>(url, { ...options, method: "GET" });
  },

  /**
   * POST request with optional JSON body.
   * @example const result = await api.post<{ id: string }>('/api/customers', customer);
   */
  post<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method">) {
    return apiFetch<T>(url, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PUT request with optional JSON body.
   * @example await api.put('/api/catalog/SKU001', updatedProduct);
   */
  put<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method">) {
    return apiFetch<T>(url, {
      ...options,
      method: "PUT",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PATCH request with a partial JSON body.
   * @example await api.patch('/api/catalog/SKU001', { itemStatus: 'INSTOCK' });
   */
  patch<T = unknown>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, "method">) {
    return apiFetch<T>(url, {
      ...options,
      method: "PATCH",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * DELETE request.
   * @example await api.delete('/api/catalog/SKU001');
   */
  delete<T = unknown>(url: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiFetch<T>(url, { ...options, method: "DELETE" });
  },

  /**
   * Upload a file or form data via multipart POST.
   * @example await api.upload('/api/import', formData);
   */
  upload<T = unknown>(url: string, formData: FormData, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiFetch<T>(url, { ...options, method: "POST", body: formData });
  },
};
