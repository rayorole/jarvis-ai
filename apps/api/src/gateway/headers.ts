/**
 * Outbound header sanitization.
 *
 * Only a server-controlled set of headers reaches the upstream. Everything the
 * browser sent — including any injected `Authorization`, `Cookie`, and
 * hop-by-hop headers — is dropped here before a request is constructed.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Headers copied from the browser request when present and safe. */
const ALLOWED_FORWARDED: ReadonlySet<string> = new Set([
  "accept",
  "user-agent",
  "x-request-id",
]);

export function buildUpstreamHeaders(
  browserRequestHeaders: Headers,
  bearerToken: string,
  requestBodyBytes: number,
): Headers {
  const upstream = new Headers();
  upstream.set("authorization", `Bearer ${bearerToken}`);
  upstream.set("host", "os.orole.be");
  if (requestBodyBytes > 0) {
    upstream.set("content-length", String(requestBodyBytes));
  }
  browserRequestHeaders.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (ALLOWED_FORWARDED.has(lower) && !HOP_BY_HOP.has(lower)) {
      upstream.set(lower, value);
    }
  });
  // Never allow anything to smuggle credentials or proxy state upstream.
  upstream.delete("cookie");
  return upstream;
}

/** Response headers stripped from the upstream response before relaying. */
export function sanitizeUpstreamResponseHeaders(upstreamHeaders: Headers): Headers {
  const out = new Headers();
  upstreamHeaders.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return; // never relay upstream sessions
    if (lower === "content-security-policy" || lower === "strict-transport-security")
      return;
    out.set(name, value);
  });
  return out;
}
