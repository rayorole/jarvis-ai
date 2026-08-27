import type { JarvisErrorCode } from "./errors.js";

/**
 * Fixed upstream origin — the gateway proxy never forwards to anything else.
 * `JARVIS_GATEWAY_ORIGIN` exists for contract tests only; it is validated to
 * be a well-formed https URL with no path, query or credentials.
 */
export const DEFAULT_GATEWAY_ORIGIN = "https://os.orole.be/v1";

export function resolveGatewayOrigin(env: NodeJS.ProcessEnv): string {
  const raw = env.JARVIS_GATEWAY_ORIGIN;
  if (raw === undefined || raw === "") return DEFAULT_GATEWAY_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("JARVIS_GATEWAY_ORIGIN must be an absolute https URL");
  }
  if (
    parsed.protocol !== "https:" ||
    (parsed.pathname.replace(/\/+$/, "") !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(
      "JARVIS_GATEWAY_ORIGIN must be a bare https origin (no path/query/credentials)",
    );
  }
  return raw.replace(/\/+$/, "");
}

export function requireGatewayBearerToken(env: NodeJS.ProcessEnv): string {
  const token = env.GATEWAY_BEARER_TOKEN;
  if (!token || token.length < 16) {
    // Fail closed — the gateway is unusable without a server-held credential.
    const err = new Error("GATEWAY_BEARER_TOKEN is not configured") as Error & {
      code?: JarvisErrorCode;
    };
    err.code = "internal_error";
    throw err;
  }
  return token;
}

export interface GatewayLimits {
  /** Upstream timeout in milliseconds for JSON operations. */
  timeoutMs: number;
  /** Maximum accepted request body bytes. */
  maxBodyBytes: number;
  /** Maximum accepted response size across the stream. */
  maxResponseBytes: number;
}

/** Operation classes group routes for rate limiting. */
export type OperationClass = "read" | "write" | "stream";

export interface GatewayOperation {
  /** Canonical route id, e.g. "sessions.get". */
  id: string;
  method: string;
  /** Path under /api/gateway; `:name` segments are validated params. */
  browserPath: string;
  /** Upstream path template relative to the fixed origin. */
  upstreamPath: string;
  authRequired: true;
  csrfRequired: boolean;
  operationClass: OperationClass;
  limits: GatewayLimits;
  responseKind: "json" | "sse";
}

const READ_LIMITS: GatewayLimits = {
  timeoutMs: 10_000,
  maxBodyBytes: 0,
  maxResponseBytes: 5 * 1024 * 1024,
};
const WRITE_LIMITS: GatewayLimits = {
  timeoutMs: 10_000,
  maxBodyBytes: 256 * 1024,
  maxResponseBytes: 5 * 1024 * 1024,
};
const STREAM_LIMITS: GatewayLimits = {
  timeoutMs: 0, // streaming: no overall timeout; per-chunk idle watchdog applies
  maxBodyBytes: 64 * 1024,
  maxResponseBytes: 64 * 1024 * 1024,
};

/**
 * Explicit allowlist of every allowed browser -> gateway operation.
 * Anything not listed here is rejected before any upstream contact.
 */
export const GATEWAY_OPERATIONS: readonly GatewayOperation[] = [
  {
    id: "sessions.list",
    method: "GET",
    browserPath: "/api/gateway/sessions",
    upstreamPath: "/sessions",
    authRequired: true,
    csrfRequired: false,
    operationClass: "read",
    limits: READ_LIMITS,
    responseKind: "json",
  },
  {
    id: "sessions.create",
    method: "POST",
    browserPath: "/api/gateway/sessions",
    upstreamPath: "/sessions",
    authRequired: true,
    csrfRequired: true,
    operationClass: "write",
    limits: WRITE_LIMITS,
    responseKind: "json",
  },
  {
    id: "sessions.get",
    method: "GET",
    browserPath: "/api/gateway/sessions/:id",
    upstreamPath: "/sessions/:id",
    authRequired: true,
    csrfRequired: false,
    operationClass: "read",
    limits: READ_LIMITS,
    responseKind: "json",
  },
  {
    id: "sessions.update",
    method: "PATCH",
    browserPath: "/api/gateway/sessions/:id",
    upstreamPath: "/sessions/:id",
    authRequired: true,
    csrfRequired: true,
    operationClass: "write",
    limits: WRITE_LIMITS,
    responseKind: "json",
  },
  {
    id: "sessions.delete",
    method: "DELETE",
    browserPath: "/api/gateway/sessions/:id",
    upstreamPath: "/sessions/:id",
    authRequired: true,
    csrfRequired: true,
    operationClass: "write",
    limits: WRITE_LIMITS,
    responseKind: "json",
  },
  {
    id: "sessions.messages",
    method: "GET",
    browserPath: "/api/gateway/sessions/:id/messages",
    upstreamPath: "/sessions/:id/messages",
    authRequired: true,
    csrfRequired: false,
    operationClass: "read",
    limits: READ_LIMITS,
    responseKind: "json",
  },
  {
    id: "runs.stream",
    method: "POST",
    browserPath: "/api/gateway/runs/stream",
    upstreamPath: "/runs/stream",
    authRequired: true,
    csrfRequired: true,
    operationClass: "stream",
    limits: STREAM_LIMITS,
    responseKind: "sse",
  },
  {
    id: "runs.cancel",
    method: "POST",
    browserPath: "/api/gateway/runs/:runId/cancel",
    upstreamPath: "/runs/:runId/cancel",
    authRequired: true,
    csrfRequired: true,
    operationClass: "write",
    limits: { ...WRITE_LIMITS, maxBodyBytes: 0 },
    responseKind: "json",
  },
] as const;

const ID_PARAM_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function matchOperation(
  method: string,
  pathname: string,
): { operation: GatewayOperation; params: Record<string, string> } | { mismatch: "path" | "method" } {
  let sawPathMatch = false;
  for (const op of GATEWAY_OPERATIONS) {
    const opSegments = op.browserPath.split("/").filter(Boolean);
    const reqSegments = pathname.split("/").filter(Boolean);
    if (opSegments.length !== reqSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < opSegments.length; i++) {
      const seg = opSegments[i];
      if (seg.startsWith(":")) {
        const value = decodeURIComponent(reqSegments[i]);
        if (!ID_PARAM_PATTERN.test(value)) {
          matched = false;
          break;
        }
        params[seg.slice(1)] = value;
      } else if (seg !== reqSegments[i]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    sawPathMatch = true;
    if (op.method === method) return { operation: op, params };
  }
  return { mismatch: sawPathMatch ? "method" : "path" };
}
