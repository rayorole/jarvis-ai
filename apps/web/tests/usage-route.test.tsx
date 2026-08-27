import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { Route } from "@/routes/usage";
import type { UsageSnapshot } from "@/lib/usage-api";

const UsageComponent = Route.options.component!;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderUsage() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouterProvider initialEntries={["/usage"]}>
        <UsageComponent />
      </MemoryRouterProvider>
    </QueryClientProvider>,
  );
}

function jsonOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

const snapshot: UsageSnapshot = {
  generatedAt: "2026-08-27T12:00:00.000Z",
  totals: { inputTokens: 1200, outputTokens: 340, costUsd: 0.42 },
  sessions: [
    { id: "s1", label: "Planner session", inputTokens: 800, outputTokens: 200, costUsd: 0.3, messages: 12 },
    { id: "s2", label: "Coder session", inputTokens: 400, outputTokens: 140, costUsd: 0.12, messages: 5 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("usage route", () => {
  it("renders the loading state before data arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderUsage();
    expect(await screen.findByTestId("state-loading")).toBeInTheDocument();
  });

  it("renders the error state with a retry affordance on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    renderUsage();
    expect(await screen.findByTestId("state-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders totals and per-session breakdown from a normalized snapshot", async () => {
    vi.stubGlobal("fetch", jsonOk(snapshot));
    renderUsage();
    expect(await screen.findByTestId("usage-ticker")).toBeInTheDocument();
    expect(screen.getByTestId("ticker-cost")).toHaveTextContent("$0.42");
    expect(screen.getByTestId("session-s1")).toBeInTheDocument();
    expect(screen.getByText("Planner session")).toBeInTheDocument();
    expect(screen.getByTestId("session-s1-cost")).toHaveTextContent("$0.30");
    expect(screen.getByTestId("session-s2-cost")).toHaveTextContent("$0.12");
  });

  it("renders the empty state when there is no usage data", async () => {
    vi.stubGlobal(
      "fetch",
      jsonOk({ generatedAt: "", totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, sessions: [] }),
    );
    renderUsage();
    expect(await screen.findByTestId("state-empty")).toBeInTheDocument();
  });

  it("supports manual refresh via the refresh button", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(snapshot), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderUsage();
    expect(await screen.findByTestId("usage-ticker")).toBeInTheDocument();
    const callsBefore = fetchMock.mock.calls.length;

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("keeps the ticker accessible with a polite live region", async () => {
    vi.stubGlobal("fetch", jsonOk(snapshot));
    renderUsage();
    expect(await screen.findByRole("status", { name: /usage and cost summary/i })).toBeInTheDocument();
  });
});
