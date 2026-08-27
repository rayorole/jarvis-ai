import { JarvisApiError } from "./errors.js";
import type { GatewayOperation } from "./operations.js";
import { buildUpstreamHeaders, sanitizeUpstreamResponseHeaders } from "./headers.js";

/**
 * Typed seam for the upstream gateway. The proxy layer feeds this client a
 * fully validated request; the client owns fetching the fixed origin and
 * mapping network failure modes to stable Jarvis errors. Everything returned
 * past this boundary is still unverified bytes — normalization happens in
 * `normalize.ts`.
 */
export interface GatewayClient {
  send(
    operation: GatewayOperation,
    input: {
      params: Record<string, string>;
      body?: ArrayBuffer;
      contentType?: string;
      browserHeaders: Headers;
      signal: AbortSignal;
    },
  ): Promise<Response>;
}

export interface FetchLike {
  (url: string, init: RequestInit): Promise<Response>;
}

export interface UpstreamUrlBuilder {
  (operation: GatewayOperation, params: Record<string, string>): URL;
}

export function fixedOriginUrlBuilder(origin: string): UpstreamUrlBuilder {
  const base = new URL(origin.replace(/\/+$/, ""));
  return (operation, params) => {
    let path = operation.upstreamPath;
    for (const [name, value] of Object.entries(params)) {
      // Params already passed the strict ID pattern; re-encode defensively.
      path = path.replace(`:${name}`, encodeURIComponent(value));
    }
    if (path.includes(":")) throw new Error("unresolved path template");
    return new URL(base.pathname + path, base);
  };
}

export class HttpGatewayClient implements GatewayClient {
  constructor(
    private readonly options: {
      bearerToken: string;
      buildUrl: UpstreamUrlBuilder;
      fetchImpl?: FetchLike;
      /** Maximum accepted response size; enforced while streaming the body. */
      maxResponseBytes: number;
    },
  ) {}

  async send(
    operation: GatewayOperation,
    input: {
      params: Record<string, string>;
      body?: ArrayBuffer;
      contentType?: string;
      browserHeaders: Headers;
      signal: AbortSignal;
    },
  ): Promise<Response> {
    const url = this.options.buildUrl(operation, input.params);
    const bodyBytes = input.body?.byteLength ?? 0;
    const headers = buildUpstreamHeaders(
      input.browserHeaders,
      this.options.bearerToken,
      bodyBytes,
    );
    if (input.contentType) headers.set("content-type", input.contentType);

    const doFetch = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method: operation.method,
        headers,
        body:
          input.body && bodyBytes > 0 ? new Uint8Array(input.body) : undefined,
        signal: input.signal,
        redirect: "error", // never follow redirects to foreign origins
      });
    } catch (err) {
      if (
        input.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        throw new JarvisApiError("client_disconnected");
      }
      throw new JarvisApiError("upstream_unavailable");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > this.options.maxResponseBytes) {
      throw new JarvisApiError("upstream_error");
    }
    return response;
  }
}

export { sanitizeUpstreamResponseHeaders };
