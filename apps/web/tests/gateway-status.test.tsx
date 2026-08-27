import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { Route } from "@/routes/gateway";
import { normalizeGatewayHealth } from "@/lib/gateway-status";

const GatewayComponent = Route.options.component!;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function renderGateway() {
  const client = makeClient();
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouterProvider initialEntries={["/gateway"]}>
        <GatewayComponent />
      </MemoryRouterProvider>
    </QueryClientProvider>,
  );
  // Router resolves asynchronously; wait for the route content to mount.
  await waitFor(() => {
    expect(
      document.querySelector('[data-testid="state-loading"], [data-testid="state-error"], [data-testid="state-offline"], [data-testid="gateway-overall-status"]'),
    ).not.toBeNull();
  });
  return view;
}

function jsonOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeGatewayHealth", () => {
  it("normalizes a healthy payload with channels", () => {
    const health = normalizeGatewayHealth({
      status: "online",
      checkedAt: "2026-08-27T12:00:00Z",
      channels: [
        { id: "telegram", kind: "telegram", status: "online", detail: "bot connected" },
        { id: "cli", kind: "cli", status: "degraded", detail: "high latency" },
      ],
    });
    expect(health.status).toBe("online");
    expect(health.checkedAt).toBe("2026-08-27T12:00:00Z");
    expect(health.channels).toHaveLength(2);
    expect(health.channels[0]).toMatchObject({ id: "telegram", status: "online" });
    expect(health.channels[1]).toMatchObject({ id: "cli", status: "degraded" });
  });

  it("maps unknown channel states to 'unknown' and drops malformed entries", () => {
    const health = normalizeGatewayHealth({
      status: "weird-state",
      channels: [
        { id: "x", status: "bogus" },
        { id: 42, status: "online" },
        "junk",
      ],
    });
    expect(health.status).toBe("unknown");
    // Only the entry with a usable id survives; its state is normalized.
    expect(health.channels).toHaveLength(1);
    expect(health.channels[0]).toMatchObject({ id: "x", status: "unknown" });
  });

  it("degrades to offline/unknown for non-object payloads", () => {
    expect(normalizeGatewayHealth(null)).toMatchObject({ status: "unknown", channels: [] });
    expect(normalizeGatewayHealth("nope")).toMatchObject({ status: "unknown", channels: [] });
  });
});

describe("gateway status route", () => {
  it("shows the loading state before health resolves", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await renderGateway();
    expect(screen.getByTestId("state-loading")).toBeInTheDocument();
  });

  it("renders overall status and per-channel badges when healthy", async () => {
    vi.stubGlobal(
      "fetch",
      jsonOk({
        status: "online",
        checkedAt: "2026-08-27T12:00:00Z",
        channels: [
          { id: "telegram", kind: "telegram", status: "online", detail: "bot connected" },
          { id: "cli", kind: "cli", status: "degraded", detail: "high latency" },
        ],
      }),
    );
    await renderGateway();
    expect(await screen.findByRole("heading", { name: "Gateway" })).toBeInTheDocument();
    expect(screen.getByTestId("gateway-overall-status")).toHaveTextContent("online");
    expect(screen.getByTestId("channel-badge-telegram")).toHaveTextContent("online");
    expect(screen.getByTestId("channel-badge-cli")).toHaveTextContent("degraded");
    // Status is never color-only: text labels accompany each badge.
    expect(screen.getAllByText(/online|degraded/).length).toBeGreaterThanOrEqual(3);
  });

  it("shows the error state with retry when health fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );
    await renderGateway();
    expect(await screen.findByTestId("state-error", {}, { timeout: 5000 })).toBeInTheDocument();
    // Retry refetches and recovers.
    vi.stubGlobal("fetch", jsonOk({ status: "online", channels: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("gateway-overall-status")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("falls back to an offline state pattern when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network down"))));
    await renderGateway();
    expect(await screen.findByTestId("state-offline", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
