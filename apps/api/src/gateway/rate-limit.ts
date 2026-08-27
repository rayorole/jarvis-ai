import type { OperationClass } from "./operations.js";
import { JarvisApiError } from "./errors.js";

export interface RateLimiterOptions {
  /** Requests allowed per window per key. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, per-client rate limiting grouped by operation class.
 * Deterministic for tests; swap with a distributed store behind this
 * interface when multiple instances serve traffic.
 */
export class OperationClassRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private options: RateLimiterOptions) {}

  /** Throws a stable `rate_limited` error when over budget. */
  consume(key: string, operationClass: OperationClass, now: number = Date.now()): void {
    const bucketKey = `${operationClass}:${key}`;
    const existing = this.buckets.get(bucketKey);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + this.options.windowMs });
      return;
    }
    if (existing.count >= this.options.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new JarvisApiError("rate_limited", { retryAfterSeconds });
    }
    existing.count += 1;
    // Opportunistic pruning to keep memory bounded.
    if (this.buckets.size > 10_000) {
      for (const [k, b] of Array.from(this.buckets)) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }
  }
}

const DEFAULTS: Record<OperationClass, RateLimiterOptions> = {
  read: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  stream: { limit: 10, windowMs: 60_000 },
};

let shared: Map<OperationClass, OperationClassRateLimiter> | null = null;

export function defaultRateLimiters(): Record<OperationClass, OperationClassRateLimiter> {
  if (!shared) {
    shared = new Map(
      Object.entries(DEFAULTS).map(([cls, opts]) => [
        cls as OperationClass,
        new OperationClassRateLimiter(opts),
      ]),
    );
  }
  return {
    read: shared.get("read")!,
    write: shared.get("write")!,
    stream: shared.get("stream")!,
  };
}

/** Best-effort client identity from proxy-forwarded or direct socket info. */
export function clientIdentity(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
