import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUsage } from "@/hooks/useUsage";
import { UsageTicker } from "@/components/usage/usage-ticker";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function jsonOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

const snapshot = {
  generatedAt: "2026-08-27T12:00:00.000Z",
  totals: { inputTokens: 1200, outputTokens: 340, costUsd: 0.42 },
  sessions: [],
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function HookProbe() {
  const { data, isPending, isError } = useUsage();
  return (
    <div>
      <span data-testid="state">{isPending ? "pending" : isError ? "error" : "ready"}</span>
      <span data-testid="cost">{data ? data.totals.costUsd : "none"}</span>
    </div>
  );
}

function renderHook() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <HookProbe />
    </QueryClientProvider>,
  );
}

describe("useUsage", () => {
  it("starts pending then exposes a normalized snapshot", async () => {
    const gate: { resolve?: (v: Response) => void } = {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          gate.resolve = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderHook();
    expect(screen.getByTestId("state")).toHaveTextContent("pending");

    gate.resolve?.(
      new Response(JSON.stringify(snapshot), { status: 200, headers: { "content-type": "application/json" } }),
    );
    await waitFor(() => expect(screen.getByTestId("cost")).toHaveTextContent("0.42"));
  });

  it("refetches on the ticker interval and pauses while the tab is hidden", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(snapshot), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderHook();
    await waitFor(() => expect(screen.getByTestId("cost")).toHaveTextContent("0.42"));
    const callsAfterFirst = fetchMock.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    const callsWithVisibleTab = fetchMock.mock.calls.length;
    expect(callsWithVisibleTab).toBeGreaterThan(callsAfterFirst);

    // Hidden tab: no further calls
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsWithVisibleTab);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("surfaces an error state on a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    renderHook();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("error"));
  });
});

describe("UsageTicker", () => {
  it("renders total tokens and cost with a live indicator", () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <UsageTicker
          totals={{ inputTokens: 1200, outputTokens: 340, costUsd: 0.42 }}
          live
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("usage-ticker")).toBeInTheDocument();
    expect(screen.getByTestId("ticker-input-tokens")).toHaveTextContent("1,200");
    expect(screen.getByTestId("ticker-output-tokens")).toHaveTextContent("340");
    expect(screen.getByTestId("ticker-cost")).toHaveTextContent("$0.42");
    expect(screen.getByTestId("ticker-live")).toHaveTextContent("live");
  });

  it("shows a stale indicator when not live", () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <UsageTicker
          totals={{ inputTokens: 0, outputTokens: 0, costUsd: 0 }}
          live={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("ticker-live")).toHaveTextContent("stale");
  });
});
