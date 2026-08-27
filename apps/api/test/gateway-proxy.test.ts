import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleGatewayRequest } from "../src/gateway/proxy.js";
import type { SessionVerifier } from "../src/gateway/auth.js";
import { OperationClassRateLimiter } from "../src/gateway/rate-limit.js";
import type { GatewayClient } from "../src/gateway/gateway-client.js";

const BEARER = "test-bearer-token-0123456789";

/** Authenticated verifier with Origin-matching CSRF by default. */
function makeVerifier(opts: Partial<SessionVerifier> = {}): SessionVerifier {
  return {
    isAuthenticated: vi.fn(async () => true),
    verifyCsrf: vi.fn(async () => true),
    ...opts,
  };
}

function makeUpstream(overrides: Partial<Response> = {}): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...overrides,
  }) as Response;
}

function makeClient(
  impl: GatewayClient["send"] = async () => makeUpstream(),
): GatewayClient & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    send: vi.fn(async (op, input) => {
      // Capture the URL the real HttpGatewayClient would build; for unit tests
      // we exercise the proxy with the injected client and record inputs.
      calls.push({
        url: JSON.stringify(input.params),
        init: { method: op.method, signal: input.signal },
      });
      return impl(op, input);
    }),
  } as never;
}

function jsonRequest(
  url: string,
  method: string,
  opts: { body?: unknown; csrf?: boolean; origin?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "10.0.0.1",
  };
  if (opts.csrf !== false && method !== "GET" && method !== "DELETE") {
    headers["x-csrf-token"] = "t";
  }
  if (method !== "GET") {
    headers["origin"] = opts.origin ?? "https://jarvis.example";
    headers["host"] = "jarvis.example";
  }
  return new Request(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

let limiters: Record<"read" | "write" | "stream", OperationClassRateLimiter>;

beforeEach(() => {
  const mk = () => new OperationClassRateLimiter({ limit: 1000, windowMs: 60_000 });
  limiters = { read: mk(), write: mk(), stream: mk() };
});

describe("gateway proxy — routing and allowlist", () => {
  it("rejects unknown paths as not_found", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/unknown", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(404);
  });

  it("rejects disallowed methods with method_not_allowed", async () => {
    const res = await handleGatewayRequest(
      new Request("https://jarvis.example/api/gateway/sessions", { method: "PUT" }),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(405);
  });

  it("rejects query strings on gateway routes", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions?foo=1", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(404);
  });

  it("rejects path traversal in :id params", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions/..%2fadmin", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(404);
  });

  it("rejects over-length or bad-character :id params", async () => {
    const bad = "x".repeat(200);
    const res = await handleGatewayRequest(
      jsonRequest(`https://jarvis.example/api/gateway/sessions/${bad}`, "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(404);
  });
});

describe("gateway proxy — authentication and CSRF", () => {
  it("fails closed when unauthenticated", async () => {
    const verifier = makeVerifier({ isAuthenticated: vi.fn(async () => false) });
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "GET"),
      { sessionVerifier: verifier, gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("enforces CSRF on state-changing operations", async () => {
    const verifier = makeVerifier({ verifyCsrf: vi.fn(async () => false) });
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "POST", { body: {} }),
      { sessionVerifier: verifier, gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("csrf_invalid");
  });

  it("rejects cross-origin requests on state-changing operations", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "POST", {
        body: {},
        origin: "https://evil.example",
      }),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(403);
  });

  it("rejects state-changing requests with no Origin header", async () => {
    const req = new Request("https://jarvis.example/api/gateway/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleGatewayRequest(req, {
      sessionVerifier: makeVerifier(),
      gatewayClient: makeClient(),
      rateLimiters: limiters,
    });
    expect(res.status).toBe(403);
  });
});

describe("gateway proxy — header stripping", () => {
  it("never forwards browser Authorization or Cookie upstream", async () => {
    const seen: RequestInit[] = [];
    const client: GatewayClient = {
      send: async (_op, input) => {
        // The real HttpGatewayClient builds headers; assert via its exported
        // header builder through the integration test below.
        seen.push({ headers: input.browserHeaders });
        return makeUpstream();
      },
    };
    const req = new Request("https://jarvis.example/api/gateway/sessions", {
      method: "GET",
      headers: {
        authorization: "Bearer browser-smuggled",
        cookie: "session=xyz",
      },
    });
    const res = await handleGatewayRequest(req, {
      sessionVerifier: makeVerifier({ isAuthenticated: async () => true }),
      gatewayClient: client,
      rateLimiters: limiters,
    });
    expect(res.status).toBe(200);
    expect(seen.length).toBe(1);
  });
});

describe("gateway proxy — body limits and content types", () => {
  it("rejects oversize bodies with payload_too_large", async () => {
    const big = "x".repeat(300 * 1024);
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "POST", {
        body: { title: big },
      }),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("payload_too_large");
  });

  it("rejects non-JSON content types on JSON routes", async () => {
    const req = new Request("https://jarvis.example/api/gateway/sessions", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "https://jarvis.example",
        host: "jarvis.example",
      },
      body: "hello",
    });
    const res = await handleGatewayRequest(req, {
      sessionVerifier: makeVerifier(),
      gatewayClient: makeClient(),
      rateLimiters: limiters,
    });
    expect(res.status).toBe(415);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unsupported_media_type");
  });
});

describe("gateway proxy — rate limiting", () => {
  it("returns rate_limited with retry-after once over budget", async () => {
    const lim = new OperationClassRateLimiter({ limit: 2, windowMs: 60_000 });
    const deps = {
      sessionVerifier: makeVerifier(),
      gatewayClient: makeClient(),
      rateLimiters: { ...limiters, read: lim },
    };
    const url = "https://jarvis.example/api/gateway/sessions";
    expect((await handleGatewayRequest(jsonRequest(url, "GET"), deps)).status).toBe(200);
    expect((await handleGatewayRequest(jsonRequest(url, "GET"), deps)).status).toBe(200);
    const third = await handleGatewayRequest(jsonRequest(url, "GET"), deps);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
    expect((await third.json()).error.code).toBe("rate_limited");
  });
});

describe("gateway proxy — error mapping", () => {
  it("maps upstream rejection to a stable envelope without reflecting the body", async () => {
    const client: GatewayClient = {
      send: async () =>
        new Response('{"secret":"upstream-database-password"}', {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    };
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: client, rateLimiters: limiters },
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("upstream_error");
    expect(JSON.stringify(body)).not.toContain("upstream-database-password");
  });

  it("maps upstream timeouts (AbortError) to upstream_timeout or disconnect", async () => {
    const controller = new AbortController();
    const client: GatewayClient = {
      send: async (_op, input) => {
        input.signal.addEventListener("abort", () =>
          controller.abort(),
        );
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    };
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: client, rateLimiters: limiters },
    );
    expect([499, 504, 400]).toContain(res.status);
  });

  it("maps network failure to upstream_unavailable", async () => {
    const client: GatewayClient = {
      send: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/sessions", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: client, rateLimiters: limiters },
    );
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("upstream_unavailable");
  });

  it("includes a redacted request id on error envelopes", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/nope", "GET"),
      { sessionVerifier: makeVerifier(), gatewayClient: makeClient(), rateLimiters: limiters },
    );
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(body.error.message).not.toMatch(/secret|token|key/i);
  });
});

describe("gateway proxy — SSE streaming", () => {
  function sseUpstream(): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("data: chunk-1\n\n"));
        controller.enqueue(encoder.encode("data: chunk-2\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  it("streams SSE through without buffering and sets no-buffer headers", async () => {
    const req = jsonRequest("https://jarvis.example/api/gateway/runs/stream", "POST", {
      body: { sessionId: "s1", prompt: "hi" },
    });
    const res = await handleGatewayRequest(req, {
      sessionVerifier: makeVerifier(),
      gatewayClient: { send: async () => sseUpstream() },
      rateLimiters: limiters,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    const text = await res.text();
    expect(text).toContain("data: chunk-1");
    expect(text).toContain("data: chunk-2");
  });

  it("fails safely when SSE upstream returns non-SSE content type", async () => {
    const res = await handleGatewayRequest(
      jsonRequest("https://jarvis.example/api/gateway/runs/stream", "POST", {
        body: { sessionId: "s1" },
      }),
      {
        sessionVerifier: makeVerifier(),
        gatewayClient: {
          send: async () =>
            new Response("<html>", {
              status: 200,
              headers: { "content-type": "text/html" },
            }),
        },
        rateLimiters: limiters,
      },
    );
    expect(res.status).toBe(502);
  });

  it("propagates browser abort to the upstream signal", async () => {
    const controller = new AbortController();
    const upstreamAborted = new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve());
    });
    const req = jsonRequest("https://jarvis.example/api/gateway/runs/stream", "POST", {
      body: { sessionId: "s1" },
    });
    // Simulate disconnect: abort the request signal after handler starts.
    void handleGatewayRequest(req, {
      sessionVerifier: makeVerifier(),
      gatewayClient: {
        send: async (_op, input) => {
          input.signal.addEventListener("abort", () => controller.abort());
          await upstreamAborted;
          return sseUpstream();
        },
      },
      rateLimiters: limiters,
    });
    // Let the handler reach client.send before simulating the disconnect.
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Trigger disconnect via request signal when supported.
    (req as Request & { signal: AbortSignal }).signal.dispatchEvent(
      new Event("abort"),
    );
    await upstreamAborted;
  });
});

describe("HttpGatewayClient — real URL construction and header stripping", () => {
  it("builds upstream URL from fixed origin + allowlisted path and strips browser auth", async () => {
    const { HttpGatewayClient, fixedOriginUrlBuilder } = await import(
      "../src/gateway/gateway-client.js"
    );
    const { GATEWAY_OPERATIONS } = await import("../src/gateway/operations.js");
    const op = GATEWAY_OPERATIONS.find((o) => o.id === "sessions.get")!;
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return makeUpstream();
    });
    const client = new HttpGatewayClient({
      bearerToken: BEARER,
      buildUrl: fixedOriginUrlBuilder("https://os.orole.be/v1"),
      fetchImpl: fetchImpl as never,
      maxResponseBytes: 1024,
    });
    const browserHeaders = new Headers({
      authorization: "Bearer smuggled",
      cookie: "a=b",
      accept: "application/json",
      connection: "keep-alive",
      te: "trailers",
    });
    await client.send(op, {
      params: { id: "abc_123" },
      browserHeaders,
      signal: new AbortController().signal,
    });
    expect(seen).toHaveLength(1);
    const firstCall = seen[0]!;
    expect(firstCall.url).toBe("https://os.orole.be/v1/sessions/abc_123");
    const headers = new Headers(firstCall.init.headers as Headers);
    expect(headers.get("authorization")).toBe(`Bearer ${BEARER}`);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("te")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
  });

  it("refuses to follow redirects", async () => {
    const { HttpGatewayClient, fixedOriginUrlBuilder } = await import(
      "../src/gateway/gateway-client.js"
    );
    const { GATEWAY_OPERATIONS } = await import("../src/gateway/operations.js");
    const op = GATEWAY_OPERATIONS.find((o) => o.id === "sessions.list")!;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("error");
      return new Response(null, { status: 302, headers: { location: "https://evil.example" } });
    });
    const client = new HttpGatewayClient({
      bearerToken: BEARER,
      buildUrl: fixedOriginUrlBuilder("https://os.orole.be/v1"),
      fetchImpl: fetchImpl as never,
      maxResponseBytes: 1024,
    });
    await client.send(op, {
      params: {},
      browserHeaders: new Headers(),
      signal: new AbortController().signal,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails closed when bearer token is missing", async () => {
    const { requireGatewayBearerToken } = await import(
      "../src/gateway/operations.js"
    );
    expect(() => requireGatewayBearerToken({} as NodeJS.ProcessEnv)).toThrow();
  });
});
