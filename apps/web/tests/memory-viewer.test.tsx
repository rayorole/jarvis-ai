import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { MemoryViewer } from "@/components/memory/memory-viewer";
import type { MemoryStore, MemoryEntry } from "@/lib/memory-api";

function entry(overrides: Partial<MemoryEntry> = {}) {
  return {
    id: "m1",
    content: "Prefers concise answers",
    origin: "manual" as const,
    enabled: true,
    updatedAt: "2026-08-20T12:00:00.000Z",
  };
}

function store(overrides: Partial<MemoryStore> = {}): MemoryStore {
  return {
    tab: "agent",
    budget: { used: 27, limit: 100 },
    version: 3,
    entries: [entry()],
    pendingWrites: [],
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

function mockFetchFor(
  stores: Record<string, MemoryStore>,
  handlers: Array<(url: string, init: RequestInit | undefined) => Response | undefined> = [],
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const tab = url.includes("tab=profile") ? "profile" : "agent";
    if (url.includes("/api/memory?") || url.endsWith("/api/memory")) {
      const s = stores[tab] ?? store();
      return jsonResponse({
        tab: s.tab,
        budget: s.budget,
        version: s.version,
        entries: s.entries,
        pendingWrites: s.pendingWrites,
      });
    }
    for (const handler of handlers) {
      const res = handler(url, init);
      if (res) return res;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function renderViewer() {
  return render(
    <MemoryRouterProvider initialEntries={["/memory"]}>
      <MemoryViewer />
    </MemoryRouterProvider>,
  );
}

describe("MemoryViewer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders agent memory entries with usage meter, provenance, and updated time", async () => {
    mockFetchFor({ agent: store() });
    renderViewer();

    const list = await screen.findByRole("list", { name: /agent memory entries/i });
    expect(within(list).getByText("Prefers concise answers")).toBeTruthy();
    expect(within(list).getByText(/manual/i)).toBeTruthy();
    expect(screen.getByText(/27\s*\/\s*100 characters/i)).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("switches between agent memory and user profile tabs", async () => {
    mockFetchFor({
      agent: store(),
      profile: store({
        tab: "profile",
        budget: { used: 10, limit: 50 },
        entries: [{ ...entry(), id: "p1", content: "Timezone UTC+2" }],
      }),
    });
    const user = userEvent.setup();
    renderViewer();

    await screen.findByRole("list", { name: /agent memory entries/i });
    await user.click(screen.getByRole("tab", { name: /user profile/i }));

    const list = await screen.findByRole("list", { name: /user profile entries/i });
    expect(within(list).getByText("Timezone UTC+2")).toBeTruthy();
    expect(screen.getByText(/10\s*\/\s*50 characters/i)).toBeTruthy();
  });

  it("shows the frozen-at-session-start semantics warning before mutation completes", async () => {
    mockFetchFor({ agent: store() });
    const user = userEvent.setup();
    renderViewer();

    await screen.findByRole("list", { name: /agent memory entries/i });
    expect(
      screen.getByText(/affect new sessions.*existing sessions keep their snapshot/i),
    ).toBeTruthy();

    await user.type(screen.getByLabelText(/new memory content/i), "Likes rust");
    await user.click(screen.getByRole("button", { name: /stage add/i }));
    // Warning must still be visible at confirmation time (before completion).
    expect(
      screen.getByText(/affect new sessions.*existing sessions keep their snapshot/i),
    ).toBeTruthy();
  });

  it("stages an add into pending writes and approves it", async () => {
    const stores = { agent: store() };
    let approved = false;
    mockFetchFor(stores, [
      (url, init) => {
        if (url.endsWith("/api/memory/entries") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          expect(body.operation).toBe("add");
          expect(body.content).toBe("Likes rust");
          expect(body.expectedVersion).toBe(3);
          if (body.stage === "commit") {
            approved = true;
            stores.agent = store({
              version: 4,
              budget: { used: 37, limit: 100 },
              entries: [entry(), { ...entry(), id: "m2", content: "Likes rust" }],
            });
            return jsonResponse({ ok: true });
          }
          stores.agent = store({
            ...stores.agent,
            pendingWrites: [
              { id: "pw1", operation: "add", content: "Likes rust", entryId: null, origin: "manual" },
            ],
          });
          return jsonResponse({
            pendingWrite: {
              id: "pw1",
              operation: "add",
              content: "Likes rust",
              entryId: null,
              origin: "manual",
            },
          });
        }
        return undefined;
      },
    ]);
    const user = userEvent.setup();
    renderViewer();

    await screen.findByRole("list", { name: /agent memory entries/i });
    await user.type(screen.getByLabelText(/new memory content/i), "Likes rust");
    await user.click(screen.getByRole("button", { name: /stage add/i }));

    const pending = await screen.findByTestId("pending-writes");
    expect(within(pending).getByText(/add/i)).toBeTruthy();
    expect(within(pending).getByText(/likes rust/i)).toBeTruthy();

    await user.click(within(pending).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(approved).toBe(true));
    const list = await screen.findByRole("list", { name: /agent memory entries/i });
    await waitFor(() => expect(within(list).getByText("Likes rust")).toBeTruthy());
  });

  it("requires confirmation before removing an entry", async () => {
    const stores = { agent: store() };
    let removed = false;
    mockFetchFor(stores, [
      (url, init) => {
        if (url.endsWith("/api/memory/entries") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          if (body.stage === "commit" && body.operation === "remove") {
            removed = true;
            stores.agent = store({ version: 4, budget: { used: 0, limit: 100 }, entries: [] });
            return jsonResponse({ ok: true });
          }
          return jsonResponse({
            pendingWrite: { id: "pw2", operation: "remove", entryId: "m1", content: null, origin: "manual" },
          });
        }
        return undefined;
      },
    ]);
    const user = userEvent.setup();
    renderViewer();

    const list = await screen.findByRole("list", { name: /agent memory entries/i });
    await user.click(within(list).getByRole("button", { name: /remove/i }));

    // Destructive: a confirmation step is required before anything is sent.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/remove this memory entry/i)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: /confirm remove/i }));
    await waitFor(() => expect(removed).toBe(true));
  });

  it("shows a conflict error and refetches canonical state on 409", async () => {
    const stores = { agent: store() };
    let conflicted = false;
    mockFetchFor(stores, [
      (url, init) => {
        if (url.endsWith("/api/memory/entries") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          if (body.stage === "commit") {
            conflicted = true;
            stores.agent = store({
              version: 9,
              entries: [{ ...entry(), content: "Canonical value from another writer" }],
            });
            return jsonResponse({ error: "version_conflict" }, 409);
          }
          stores.agent = store({
            ...stores.agent,
            pendingWrites: [
              { id: "pw3", operation: "add", content: "Stale write", entryId: null, origin: "manual" },
            ],
          });
          return jsonResponse({
            pendingWrite: { id: "pw3", operation: "add", content: "Stale write", entryId: null, origin: "manual" },
          });
        }
        return undefined;
      },
    ]);
    const user = userEvent.setup();
    renderViewer();

    await screen.findByRole("list", { name: /agent memory entries/i });
    await user.type(screen.getByLabelText(/new memory content/i), "Stale write");
    await user.click(screen.getByRole("button", { name: /stage add/i }));
    const pending = await screen.findByTestId("pending-writes");
    await user.click(within(pending).getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(conflicted).toBe(true));
    expect(await screen.findByRole("alert")).toHaveTextContent(/conflict|changed/i);
    // Canonical reconciliation: canonical server state replaces the optimistic view.
    const list = await screen.findByRole("list", { name: /agent memory entries/i });
    expect(within(list).getByText("Canonical value from another writer")).toBeTruthy();
    expect(within(list).queryByText("Prefers concise answers")).toBeNull();
  });

  it("rejects a pending write", async () => {
    const stores = {
      agent: store({
        pendingWrites: [
          { id: "pw4", operation: "add", content: "Auto suggestion", entryId: null, origin: "automatic" },
        ],
      }),
    };
    mockFetchFor(stores, [
      (url, init) => {
        if (url.endsWith("/api/memory/pending/pw4") && init?.method === "POST") {
          expect(JSON.parse(String(init.body))).toMatchObject({ tab: "agent", action: "reject" });
          stores.agent = store({ ...stores.agent, pendingWrites: [] });
          return jsonResponse({ ok: true });
        }
        return undefined;
      },
    ]);
    const user = userEvent.setup();
    renderViewer();

    const pending = await screen.findByTestId("pending-writes");
    expect(within(pending).getByText(/automatic/i)).toBeTruthy();
    await user.click(within(pending).getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(screen.queryByTestId("pending-writes")).toBeNull());
  });

  it("degrades malformed server payloads to the empty state instead of crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/memory")) {
        return jsonResponse({ entries: "not-a-list", budget: null });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    renderViewer();

    expect(await screen.findByText(/no memory entries/i)).toBeTruthy();
  });

  it("shows an error state when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new TypeError("network down");
    });
    renderViewer();

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load|error/i);
  });
});
