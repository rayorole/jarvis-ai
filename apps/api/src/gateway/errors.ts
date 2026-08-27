/**
 * Stable error envelope for every gateway failure.
 * The client sees exactly this shape; upstream bodies are never reflected.
 */

export type JarvisErrorCode =
  | "unauthorized"
  | "csrf_invalid"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "bad_request"
  | "upstream_error"
  | "upstream_timeout"
  | "upstream_unavailable"
  | "client_disconnected"
  | "internal_error";

export interface JarvisApiErrorBody {
  error: {
    code: JarvisErrorCode;
    message: string;
    requestId: string;
    retryAfterSeconds?: number;
  };
}

const STATUS_BY_CODE: Record<JarvisErrorCode, number> = {
  unauthorized: 401,
  csrf_invalid: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  bad_request: 400,
  upstream_error: 502,
  upstream_timeout: 504,
  upstream_unavailable: 502,
  client_disconnected: 499,
  internal_error: 500,
};

/** Generic, non-revealing messages per code class. */
const MESSAGE_BY_CODE: Record<JarvisErrorCode, string> = {
  unauthorized: "Authentication required.",
  csrf_invalid: "Request rejected.",
  forbidden: "Request rejected.",
  not_found: "Not found.",
  method_not_allowed: "Method not allowed.",
  payload_too_large: "Payload too large.",
  unsupported_media_type: "Unsupported media type.",
  rate_limited: "Too many requests.",
  bad_request: "Invalid request.",
  upstream_error: "Upstream request failed.",
  upstream_timeout: "Upstream request timed out.",
  upstream_unavailable: "Upstream unavailable.",
  client_disconnected: "Client disconnected.",
  internal_error: "Internal error.",
};

export class JarvisApiError extends Error {
  readonly code: JarvisErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: JarvisErrorCode,
    options: { requestId?: string; retryAfterSeconds?: number } = {},
  ) {
    super(MESSAGE_BY_CODE[code]);
    this.name = "JarvisApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.requestId = options.requestId ?? "";
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }

  toResponse(requestId?: string): Response {
    const id = this.requestId || requestId || "";
    const body: JarvisApiErrorBody = {
      error: {
        code: this.code,
        message: MESSAGE_BY_CODE[this.code],
        requestId: id,
        ...(this.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: this.retryAfterSeconds }
          : {}),
      },
    };
    return new Response(JSON.stringify(body), {
      status: this.status === 499 ? 400 : this.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        ...(this.code === "rate_limited" && this.retryAfterSeconds !== undefined
          ? { "retry-after": String(this.retryAfterSeconds) }
          : {}),
      },
    });
  }
}
