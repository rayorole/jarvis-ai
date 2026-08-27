import { randomUUID } from "node:crypto";
import { JarvisApiError } from "./errors.js";
import { matchOperation, type GatewayOperation } from "./operations.js";
import {
  type SessionVerifier,
  requireSession,
  requireCsrf,
  NoopSessionVerifier,
} from "./auth.js";
import {
  defaultRateLimiters,
  clientIdentity,
  type OperationClassRateLimiter,
} from "./rate-limit.js";
import { sanitizeUpstreamResponseHeaders } from "./headers.js";
import { HttpGatewayClient, fixedOriginUrlBuilder, type GatewayClient } from "./gateway-client.js";

export interface GatewayProxyDeps {
  sessionVerifier?: SessionVerifier;
  gatewayClient?: GatewayClient;
  rateLimiters?: Record<"read" | "write" | "stream", OperationClassRateLimiter>;
  bearerToken?: string;
}

const SSE_RELAY_HEADERS = (requestId: string): HeadersInit => ({
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
  "x-request-id": requestId,
});

const JSON_RELAY_HEADERS = (requestId: string): HeadersInit => ({
  "x-request-id": requestId,
});

/**
 * The single browser-to-gateway path. Validates, authenticates, rate-limits,
 * then proxies one allowlisted operation to the fixed upstream origin.
 */
export async function handleGatewayRequest(
  request: Request,
  deps: GatewayProxyDeps = {},
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const url = new URL(request.url);
    if (url.search !== "") {
      // Query strings are not part of any allowlisted operation.
      throw new JarvisApiError("not_found", { requestId });
    }
    const matched = matchOperation(request.method, url.pathname);
    if ("mismatch" in matched) {
      throw new JarvisApiError(
        matched.mismatch === "method" ? "method_not_allowed" : "not_found",
        { requestId },
      );
    }
    const operation: GatewayOperation = matched.operation;

    const verifier = deps.sessionVerifier ?? new NoopSessionVerifier();

    // 1. Session authentication — before any body parsing or upstream contact.
    await requireSession(verifier, request, requestId);

    // 2. CSRF + Origin/Host for state-changing operations.
    if (operation.csrfRequired) {
      await requireCsrf(verifier, request, requestId);
    }

    // 3. Operation-class rate limit.
    const limiters = deps.rateLimiters ?? defaultRateLimiters();
    limiters[operation.operationClass].consume(
      clientIdentity(request),
      operation.operationClass,
    );

    // 4. Read the body under size + content-type limits.
    const body = await readBody(request, operation, requestId);

    // 5. Proxy.
    const client =
      deps.gatewayClient ??
      new HttpGatewayClient({
        bearerToken: deps.bearerToken ?? process.env.GATEWAY_BEARER_TOKEN ?? "",
        buildUrl: fixedOriginUrlBuilder("https://os.orole.be/v1"),
        maxResponseBytes: operation.limits.maxResponseBytes,
      });

    // Timeout / abort wiring: browser disconnect must abort upstream.
    const upstreamController = new AbortController();
    const abortFromClient = () => upstreamController.abort();
    request.signal?.addEventListener("abort", abortFromClient, { once: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (operation.limits.timeoutMs > 0) {
      timeoutHandle = setTimeout(
        () => upstreamController.abort(),
        operation.limits.timeoutMs,
      );
    }

    try {
      const upstreamResponse = await client.send(operation, {
        params: matched.params,
        body: body?.bytes,
        contentType: body?.contentType,
        browserHeaders: request.headers,
        signal: upstreamController.signal,
      });

      if (operation.responseKind === "sse") {
        return relaySse(upstreamResponse, requestId, request, abortFromClient);
      }
      return await relayJson(upstreamResponse, requestId, operation);
    } catch (err) {
      // Normalize client-layer failures: aborts (timeout or disconnect) and
      // any unexpected throw become stable envelopes, never raw 500s.
      if (err instanceof JarvisApiError) throw err;
      const aborted =
        err instanceof Error && err.name === "AbortError";
      if (aborted) {
        throw new JarvisApiError(
          request.signal?.aborted ? "client_disconnected" : "upstream_timeout",
          { requestId },
        );
      }
      throw new JarvisApiError("upstream_unavailable", { requestId });
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  } catch (err) {
    if (err instanceof JarvisApiError) {
      return err.toResponse(requestId);
    }
    return new JarvisApiError("internal_error").toResponse(requestId);
  }
}

interface ReadBodyResult {
  bytes: ArrayBuffer;
  contentType: string;
}

async function readBody(
  request: Request,
  operation: GatewayOperation,
  requestId: string,
): Promise<ReadBodyResult | undefined> {
  if (operation.limits.maxBodyBytes === 0 || request.method === "GET") {
    return undefined;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new JarvisApiError("unsupported_media_type", { requestId });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > operation.limits.maxBodyBytes) {
    throw new JarvisApiError("payload_too_large", { requestId });
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > operation.limits.maxBodyBytes) {
    throw new JarvisApiError("payload_too_large", { requestId });
  }
  return { bytes: buffer, contentType };
}

async function relayJson(
  upstreamResponse: Response,
  requestId: string,
  operation: GatewayOperation,
): Promise<Response> {
  // Never reflect sensitive upstream error bodies to the client.
  if (!upstreamResponse.ok) {
    throw new JarvisApiError(
      upstreamResponse.status >= 500 ? "upstream_error" : "upstream_error",
      { requestId },
    );
  }
  const upstreamType = (upstreamResponse.headers.get("content-type") ?? "").toLowerCase();
  if (!upstreamType.includes("application/json")) {
    throw new JarvisApiError("upstream_error", { requestId });
  }
  const bytes = await drainWithLimit(
    upstreamResponse.body,
    operation.limits.maxResponseBytes,
    requestId,
  );
  const headers = new Headers(JSON_RELAY_HEADERS(requestId));
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(bytes, { status: upstreamResponse.status, headers });
}

function relaySse(
  upstreamResponse: Response,
  requestId: string,
  request: Request,
  abortFromClient: () => void,
): Response {
  if (!upstreamResponse.ok || upstreamResponse.body === null) {
    throw new JarvisApiError("upstream_error", { requestId });
  }
  request.signal?.addEventListener("abort", abortFromClient, { once: true });
  const headers = new Headers(SSE_RELAY_HEADERS(requestId));
  const upstreamType = (upstreamResponse.headers.get("content-type") ?? "").toLowerCase();
  if (!upstreamType.includes("text/event-stream")) {
    throw new JarvisApiError("upstream_error", { requestId });
  }
  upstreamResponse.headers.forEach((value, name) => {
    if (!headers.has(name) && name.toLowerCase() !== "content-type") {
      headers.set(name, value);
    }
  });
  // Pass the upstream body straight through — no buffering.
  return new Response(upstreamResponse.body, { status: 200, headers });
}

async function drainWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  requestId: string,
): Promise<ArrayBuffer> {
  if (!stream) throw new JarvisApiError("upstream_error", { requestId });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new JarvisApiError("upstream_error", { requestId });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
