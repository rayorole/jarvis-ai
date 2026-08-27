# Jarvis AI — Gateway operations table (issue #4)

The only browser-to-gateway path is the same-origin `/api/gateway/*` proxy in
`apps/api/src/gateway`. The browser never sees the upstream bearer credential;
the server injects it from `GATEWAY_BEARER_TOKEN` (server-only env).

Upstream origin is fixed: `https://os.orole.be/v1`.

| Route | Method | Upstream | Auth | CSRF | Timeout | Size limits | Response kind |
|---|---|---|---|---|---|---|---|
| `/api/gateway/sessions` | GET | `GET /sessions` | session cookie | no | 10s | n/a (response 5 MB) | JSON |
| `/api/gateway/sessions` | POST | `POST /sessions` | session cookie | yes | 10s | body 1 MB | JSON |
| `/api/gateway/sessions/[id]` | GET | `GET /sessions/:id` | session cookie | no | 10s | n/a | JSON |
| `/api/gateway/sessions/[id]` | PATCH | `PATCH /sessions/:id` | session cookie | yes | 10s | body 256 KB | JSON |
| `/api/gateway/sessions/[id]` | DELETE | `DELETE /sessions/:id` | session cookie | yes | 10s | n/a | JSON |
| `/api/gateway/sessions/[id]/messages` | GET | `GET /sessions/:id/messages` | session cookie | no | 10s | n/a | JSON |
| `/api/gateway/runs/stream` | POST | `POST /runs/stream` (SSE) | session cookie | yes | none (stream) | body 64 KB | SSE stream |
| `/api/gateway/runs/[runId]/cancel` | POST | `POST /runs/:runId/cancel` | session cookie | yes | 10s | body: none | JSON |

## Guarantees

- Session authentication and (for state-changing methods) CSRF double-submit
  plus Origin/Host validation run **before** any upstream contact.
- Upstream URLs are built from a fixed origin + the explicit allowlist above.
  Path params are validated (`id`, `runId`: `[A-Za-z0-9_-]{1,128}`); traversal,
  query injection, foreign redirects, and any method/path outside this table
  are rejected with a stable `JarvisApiError` envelope — the route never acts
  as an open proxy.
- Browser-supplied `Authorization`, `Cookie`, and hop-by-hop headers are
  stripped before forwarding; only a sanitized, server-controlled header set
  reaches the upstream.
- Request/response size caps, content-type checks (`application/json` on JSON
  routes), timeouts with abort propagation to the upstream fetch, and
  operation-class rate limits apply. Requests/disconnects abort the upstream.
- SSE responses stream through unbuffered
  (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`,
  `Connection: keep-alive`) with keepalive comments.
- Failures map to stable `JarvisApiError` envelopes with redacted request IDs;
  upstream bodies are never reflected to the client.
- Unverified upstream payloads cross a typed `GatewayClient` boundary and are
  normalized into stable Jarvis domain types before UI code consumes them.

## Environment (server-only)

- `GATEWAY_BEARER_TOKEN` — upstream credential; never exposed client-side.
- `JARVIS_GATEWAY_ORIGIN` — optional override for tests, defaults to
  `https://os.orole.be/v1`.
