import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileExplorer } from "@/components/files/file-explorer";
import type { FileListing, FileRoot } from "@/lib/files-api";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const roots: FileRoot[] = [
  { id: "workspace", label: "Workspace" },
  { id: "scratch", label: "Scratch" },
];

function listing(overrides: Partial<FileListing> = {}): FileListing {
  return {
    root: "workspace",
    path: "",
    items: [
      { path: "src", name: "src", type: "directory", size: null, mtime: null },
      { path: "README.md", name: "README.md", type: "file", size: 120, mtime: "2026-08-01T00:00:00.000Z" },
    ],
    truncated: false,
    ...overrides,
  };
}

describe("FileExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the root listing once loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/files/roots")) return jsonResponse({ items: roots });
      if (url.includes("/api/files/list")) return jsonResponse(listing());
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<FileExplorer />);
    expect(await screen.findByText("src/")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.getByTestId("file-list").children.length).toBe(2);
  });

  it("descends into a directory on click and shows breadcrumbs", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/files/roots")) return jsonResponse({ items: roots });
      if (url.includes("path=src")) {
        return jsonResponse(listing({ path: "src", items: [{ path: "src/index.ts", name: "index.ts", type: "file", size: 10, mtime: null }] }));
      }
      if (url.includes("/api/files/list")) return jsonResponse(listing());
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<FileExplorer />);
    await user.click(await screen.findByText("src/"));
    expect(await screen.findByText("index.ts")).toBeTruthy();
    expect(fetchSpy.mock.calls.some(([, init]) => String(init?.signal ?? "") !== "aborted")).toBe(true);
    const crumbs = screen.getByTestId("file-breadcrumbs");
    expect(crumbs.textContent).toContain("src");
  });

  it("filters the current listing client-side", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/files/roots")) return jsonResponse({ items: roots });
      if (url.includes("/api/files/list")) return jsonResponse(listing());
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<FileExplorer />);
    await screen.findByText("src/");
    await user.type(screen.getByTestId("file-search"), "read");
    await waitFor(() => {
      expect(screen.queryByText("src/")).toBeNull();
      expect(screen.getByText("README.md")).toBeTruthy();
    });
  });

  it("navigates up one level", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/files/roots")) return jsonResponse({ items: roots });
      if (url.includes("path=src")) {
        return jsonResponse(listing({ path: "src", items: [] }));
      }
      if (url.includes("/api/files/list")) return jsonResponse(listing());
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<FileExplorer />);
    await user.click(await screen.findByText("src/"));
    await screen.findByTestId("file-up");
    await user.click(screen.getByTestId("file-up"));
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.endsWith("/api/files/list?root=workspace&path="))).toBe(true);
    });
  });

  it("shows an error state when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/files/roots")) return jsonResponse({ items: roots });
      return jsonResponse({ error: "boom" }, 500);
    });

    render(<FileExplorer />);
    expect(await screen.findByText("File explorer unavailable")).toBeTruthy();
    expect(screen.getByText("Unable to load files")).toBeTruthy();
  });
});
