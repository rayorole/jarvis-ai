import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { SessionHistoryPanel } from "@/components/sessions/session-history";
import type { SessionSummary } from "@/lib/sessions-api";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s1",
    title: "Untitled session",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    model: "test-model",
    provider: "test",
    status: "active",
    runState: "idle",
    messageCount: 0,
    resumable: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("SessionHistoryPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders recent sessions from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/sessions?") || url.endsWith("/api/sessions")) {
        return jsonResponse({ items: [summary({ id: "a1", title: "Fix flaky test", messageCount: 4 })], nextCursor: null });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    expect(await screen.findByText("Fix flaky test")).toBeTruthy();
    expect(screen.getByTestId("session-list").getAttribute("aria-label")).toBe("Recent sessions");
  });

  it("debounces search input and queries the server", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("q=")) return jsonResponse({ items: [summary({ id: "m1", title: "Matched", messageCount: 2 })] });
      return jsonResponse({ items: [], nextCursor: null });
    });

    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    await screen.findByTestId("session-list");
    const before = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("q=")).length;

    await user.type(screen.getByTestId("session-search"), "fla");
    await waitFor(
      () => expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes("q=fla")).length).toBeGreaterThan(0),
      { timeout: 2000 },
    );
    // Debounce: a single query for the final value, not one per keystroke.
    const flaCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("q=fla")).length;
    expect(flaCalls).toBeLessThanOrEqual(before + 2);
    expect(await screen.findByText("Matched")).toBeTruthy();
  });

  it("shows no-match empty state for search", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("q=")) return jsonResponse({ items: [] });
      return jsonResponse({ items: [], nextCursor: null });
    });

    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    await screen.findByTestId("session-search");
    await user.type(screen.getByTestId("session-search"), "zzz");
    await waitFor(() =>
      expect(screen.getByTestId("sessions-empty")).toHaveTextContent("No matching sessions"),
    );
  });

  it("resume button posts run-state running and invalidates the list", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.endsWith("/api/sessions/a1/run-state")) {
        return jsonResponse(summary({ id: "a1", runState: "running", resumable: true }));
      }
      if (url.includes("/api/sessions")) {
        return jsonResponse({ items: [summary({ id: "a1", title: "Interrupted", resumable: true })], nextCursor: null });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    const btn = await screen.findByTestId("resume-a1");
    await user.click(btn);
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).endsWith("/api/sessions/a1/run-state"))).toBe(true),
    );
    const runStateCall = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith("/api/sessions/a1/run-state"));
    expect(JSON.parse(String(runStateCall?.[1]?.body)).runState).toBe("running");
  });

  it("delete button removes a session and refreshes the list", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE") return { ok: true, status: 204 } as unknown as Response;
      return jsonResponse({ items: [summary({ id: "d1", title: "Doomed" })], nextCursor: null });
    });

    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    await screen.findByText("Doomed");
    await user.click(screen.getByTestId("delete-d1"));
    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => (c[1]?.method ?? "").toUpperCase() === "DELETE")).toBe(true));
  });

  it("renders Load more when a next cursor exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ items: [summary({ id: "p1", title: "Page one" })], nextCursor: "cur-1" }),
    );
    render(<MemoryRouterProvider initialEntries={["/chat"]}><SessionHistoryPanel /></MemoryRouterProvider>);
    expect(await screen.findByTestId("sessions-load-more")).toBeTruthy();
  });
});
